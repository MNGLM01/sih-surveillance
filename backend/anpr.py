"""Automatic Number Plate Recognition (ANPR) engine for the SIH surveillance
pipeline.  Runs *after* the existing YOLO11 + ByteTrack pipeline returns
tracked vehicles — it never touches the tracker internals, risk engine, or
incident lifecycle.

Responsibilities:
    1. License-plate detection inside each vehicle's bounding box (YOLO model).
    2. Plate crop extraction + image preprocessing.
    3. OCR (PaddleOCR).
    4. Text cleaning and confidence filtering.
    5. Indian license-plate format validation.
    6. Multi-frame weighted-vote consensus per track.
    7. Track-ID association and duplicate suppression.

One ANPREngine instance per camera (stored on CameraContext).  Thread-safe
because nothing is shared across cameras.

Run standalone for self-check:  python backend/anpr.py
"""
from __future__ import annotations

import logging
import os
import re
import sys
import time
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
import config

logger = logging.getLogger("anpr")

# ---------------------------------------------------------------------------
# Lazy imports for heavy dependencies — fail gracefully if not installed
# ---------------------------------------------------------------------------
_PADDLE_OCR = None
_PADDLE_AVAILABLE = False

def _ensure_paddleocr():
    global _PADDLE_OCR, _PADDLE_AVAILABLE
    if _PADDLE_OCR is not None:
        return _PADDLE_AVAILABLE
    try:
        # Pre-import torch to avoid Windows DLL conflicts (e.g. shm.dll)
        try:
            import torch  # noqa: F401
        except Exception:
            pass

        os.environ["PADDLE_PDX_ENABLE_MKLDNN_BYDEFAULT"] = "0"
        os.environ["PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK"] = "True"

        # Check whether the installed Paddle backend was compiled with CUDA
        paddle_cuda = False
        try:
            import paddle
            paddle_cuda = bool(
                paddle.is_compiled_with_cuda()
                and hasattr(paddle, "device")
                and hasattr(paddle.device, "cuda")
                and paddle.device.cuda.device_count() > 0
            )
        except Exception:
            paddle_cuda = False

        gpu_requested = getattr(config, "CUDA_AVAILABLE", False) and ("cuda" in str(getattr(config, "YOLO_DEVICE", "")).lower())

        if paddle_cuda and gpu_requested:
            ocr_device = "gpu:0"
            use_gpu_flag = True
            log_device = "GPU"
        else:
            ocr_device = "cpu"
            use_gpu_flag = False
            log_device = "CPU"
            if not paddle_cuda and gpu_requested:
                logger.info("Paddle backend compiled without CUDA; PaddleOCR remaining on CPU")

        from paddleocr import PaddleOCR  # type: ignore
        try:
            # PaddleOCR 3.x
            _PADDLE_OCR = PaddleOCR(
                use_doc_orientation_classify=False,
                use_doc_unwarping=False,
                use_textline_orientation=False,
                lang="en",
                device=ocr_device,
            )
        except Exception:
            # Legacy PaddleOCR 2.x fallback
            _PADDLE_OCR = PaddleOCR(
                use_angle_cls=True,
                lang="en",
                show_log=False,
                use_gpu=use_gpu_flag,
            )
        _PADDLE_AVAILABLE = True
        logger.info("PaddleOCR device: %s", log_device)
        logger.info("PaddleOCR initialised successfully")
    except Exception as exc:
        _PADDLE_OCR = False  # sentinel: attempted but failed
        _PADDLE_AVAILABLE = False
        logger.warning("PaddleOCR unavailable (%s) — ANPR OCR disabled", exc)
    return _PADDLE_AVAILABLE


_YOLO_CLASS = None

def _ensure_yolo():
    global _YOLO_CLASS
    if _YOLO_CLASS is not None:
        return _YOLO_CLASS is not False
    try:
        from ultralytics import YOLO
        _YOLO_CLASS = YOLO
        return True
    except Exception:
        _YOLO_CLASS = False  # sentinel: attempted but failed
        logger.warning("ultralytics not available — plate detection disabled")
        return False


# ---------------------------------------------------------------------------
# Indian License Plate Validation
# ---------------------------------------------------------------------------
# Standard Indian format: XX 00 XX 0000  (state code, district, series, number)
# Examples:  MH12AB1234,  DL01CA0001,  KA09EE9999
# Also allows: temporary/trade plates with "T" and BH-series.
INDIAN_PLATE_PATTERN = re.compile(
    r"^[A-Z]{2}\s*\d{1,2}\s*[A-Z]{0,3}\s*\d{1,4}$"
)

# Broad pattern — catches most real plates even with minor OCR errors
INDIAN_PLATE_LOOSE = re.compile(
    r"[A-Z]{2}\s*\d{1,2}\s*[A-Z]{0,3}\s*\d{1,4}"
)


def clean_ocr_text(raw: str) -> str:
    """Normalize OCR output for plate comparison."""
    text = raw.upper().strip()
    # Remove common OCR artifacts
    text = re.sub(r"[^A-Z0-9\s]", "", text)
    # Collapse whitespace
    text = re.sub(r"\s+", " ", text).strip()
    return text


def validate_indian_plate(text: str) -> tuple[bool, str]:
    """Returns (is_valid, cleaned_plate_number).
    Tries to extract a valid Indian plate from the cleaned text."""
    cleaned = clean_ocr_text(text)
    # Try strict match first
    no_space = cleaned.replace(" ", "")
    if INDIAN_PLATE_PATTERN.match(no_space):
        return True, no_space
    # Try loose extraction
    match = INDIAN_PLATE_LOOSE.search(no_space)
    if match:
        return True, match.group().replace(" ", "")
    return False, cleaned


# ---------------------------------------------------------------------------
# Image Preprocessing for OCR
# ---------------------------------------------------------------------------

def preprocess_plate_image(crop: np.ndarray) -> np.ndarray:
    """Enhance a plate crop for better OCR accuracy."""
    if crop is None or crop.size == 0:
        return crop

    # Ensure 3-channel BGR
    if len(crop.shape) == 2:
        crop = cv2.cvtColor(crop, cv2.COLOR_GRAY2BGR)

    # Resize small crops to an optimal size for OCR (width ~200px, height ~60px)
    h, w = crop.shape[:2]
    if w < 160 or h < 48:
        scale = max(200.0 / max(w, 1), 60.0 / max(h, 1))
        crop = cv2.resize(crop, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)

    # Gentle contrast enhancement via LAB color space CLAHE (preserves color and character strokes)
    lab = cv2.cvtColor(crop, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=1.5, tileGridSize=(8, 8))
    l_enhanced = clahe.apply(l)
    enhanced_lab = cv2.merge((l_enhanced, a, b))
    return cv2.cvtColor(enhanced_lab, cv2.COLOR_LAB2BGR)


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

@dataclass
class OCRReading:
    """One OCR observation of a plate for a given track."""
    raw_text: str
    cleaned_text: str
    plate_number: str  # after validation/extraction
    ocr_confidence: float
    plate_det_confidence: float
    is_valid_indian: bool
    plate_bbox: tuple[float, float, float, float]  # (x1,y1,x2,y2) in full-frame coords
    vehicle_bbox: tuple[float, float, float, float]
    timestamp: float


@dataclass
class ANPRResult:
    """Confirmed plate detection ready for DB insertion / WebSocket broadcast."""
    track_id: str
    vehicle_type: str
    plate_number: str
    raw_ocr_text: str
    ocr_confidence: float
    plate_detection_confidence: float
    consensus_score: float
    vehicle_bbox: tuple[float, float, float, float]
    plate_bbox: tuple[float, float, float, float]
    timestamp: float
    validation_status: str  # "VALID", "PARTIAL", "UNVALIDATED"
    evidence_image: Optional[np.ndarray] = field(default=None, repr=False)


@dataclass
class _TrackPlateHistory:
    """Per-track accumulated OCR readings for consensus."""
    readings: list[OCRReading] = field(default_factory=list)
    confirmed_plate: Optional[str] = None
    last_seen: float = 0.0
    emitted: bool = False  # True once a consensus result has been sent


# ---------------------------------------------------------------------------
# ANPREngine
# ---------------------------------------------------------------------------

class ANPREngine:
    """One instance per camera.  Call `process_tracks(frame, tracks, timestamp)`
    after every pipeline frame to run ANPR on tracked vehicles.

    Returns a list of *newly confirmed* ANPRResult objects (plates that just
    reached consensus and haven't been emitted yet).
    """

    def __init__(
        self,
        plate_model_path: str = "license_plate_detector.pt",
        plate_confidence: float = 0.4,
        ocr_confidence_threshold: float = 0.5,
        min_consensus_readings: int = 3,
        max_track_history: int = 50,
        frame_interval: int = 5,
        save_evidence: bool = False,
        evidence_dir: Optional[Path] = None,
    ):
        self.plate_confidence = plate_confidence
        self.ocr_confidence_threshold = ocr_confidence_threshold
        self.min_consensus_readings = min_consensus_readings
        self.max_track_history = max_track_history
        self.frame_interval = frame_interval
        self.save_evidence = save_evidence
        self.evidence_dir = evidence_dir

        self._frame_counter = 0
        self._track_history: dict[str, _TrackPlateHistory] = defaultdict(
            _TrackPlateHistory
        )
        self._plate_model = None
        self._plate_model_path = plate_model_path
        self._model_load_attempted = False
        self._active_plates: dict[str, str] = {}  # track_id -> confirmed plate

    # ------------------------------------------------------------------
    # Model loading (lazy, once)
    # ------------------------------------------------------------------
    def _load_plate_model(self):
        if self._model_load_attempted:
            return self._plate_model is not None
        self._model_load_attempted = True
        if not _ensure_yolo():
            return False
        if not os.path.isfile(self._plate_model_path):
            logger.warning(
                "License plate model not found at '%s' — plate detection disabled. "
                "Download a YOLO plate-detection model and set ANPR_PLATE_MODEL_PATH.",
                self._plate_model_path,
            )
            return False
        try:
            self._plate_model = _YOLO_CLASS(self._plate_model_path)
            logger.info("Plate detection model loaded: %s (device: %s)", self._plate_model_path, config.YOLO_DEVICE)
            return True
        except Exception as exc:
            logger.error("Failed to load plate model: %s", exc)
            return False

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def process_tracks(
        self,
        frame: np.ndarray,
        tracks: list,
        timestamp: float,
    ) -> list[ANPRResult]:
        """Process all tracked vehicles in the current frame.

        `tracks` is the list of `Track` dataclass objects from the existing
        pipeline — we only read `.track_id`, `.class_name`, `.bbox`.
        """
        self._frame_counter += 1
        if self._frame_counter % self.frame_interval != 0:
            return []

        # Lazy-load models on first real call
        if not self._model_load_attempted:
            self._load_plate_model()

        results: list[ANPRResult] = []
        active_track_ids: set[str] = set()
        ocr_available = _ensure_paddleocr()

        for track in tracks:
            try:
                from detector import is_vehicle
            except Exception:
                break
            if not is_vehicle(track.class_name):
                continue
            active_track_ids.add(track.track_id)

            if not ocr_available:
                continue

            try:
                reading = self._process_single_vehicle(
                    frame, track.track_id, track.class_name, track.bbox, timestamp,
                )
                if reading is not None:
                    hist = self._track_history[track.track_id]
                    hist.readings.append(reading)
                    hist.last_seen = timestamp
                    # Trim history
                    if len(hist.readings) > self.max_track_history:
                        hist.readings = hist.readings[-self.max_track_history:]

                    # Check for consensus
                    if not hist.emitted:
                        consensus = self._compute_consensus(track.track_id)
                        if consensus is not None:
                            hist.emitted = True
                            hist.confirmed_plate = consensus.plate_number
                            self._active_plates[track.track_id] = consensus.plate_number
                            # Save evidence image if configured
                            if self.save_evidence and self.evidence_dir:
                                consensus.evidence_image = self._make_evidence_image(
                                    frame, track.bbox, reading.plate_bbox,
                                )
                            results.append(consensus)
            except Exception as exc:
                logger.debug("ANPR error for track %s: %s", track.track_id, exc)

        # Expire stale tracks (not seen for 30+ seconds) — always runs
        stale = [
            tid for tid, hist in self._track_history.items()
            if tid not in active_track_ids and (timestamp - hist.last_seen) > 30
        ]
        for tid in stale:
            self._track_history.pop(tid, None)
            self._active_plates.pop(tid, None)

        return results

    def get_active_plates(self) -> dict[str, str]:
        """Returns {track_id: plate_number} for currently tracked vehicles."""
        return dict(self._active_plates)

    def reset(self):
        """Called when the camera source loops (e.g. sample video restart)."""
        self._track_history.clear()
        self._active_plates.clear()
        self._frame_counter = 0

    # ------------------------------------------------------------------
    # Per-vehicle processing
    # ------------------------------------------------------------------
    def _process_single_vehicle(
        self,
        frame: np.ndarray,
        track_id: str,
        vehicle_type: str,
        vehicle_bbox: tuple[float, float, float, float],
        timestamp: float,
    ) -> Optional[OCRReading]:
        """Detect plate inside vehicle bbox, run OCR, return reading or None."""
        x1, y1, x2, y2 = (int(v) for v in vehicle_bbox)
        fh, fw = frame.shape[:2]
        # Clamp
        x1, y1 = max(0, x1), max(0, y1)
        x2, y2 = min(fw, x2), min(fh, y2)
        if x2 - x1 < 20 or y2 - y1 < 20:
            return None

        vehicle_crop = frame[y1:y2, x1:x2]

        # --- Plate detection ---
        plate_bbox_local, plate_conf = self._detect_plate(vehicle_crop)
        if plate_bbox_local is None:
            return None

        px1, py1, px2, py2 = (int(v) for v in plate_bbox_local)
        vh, vw = vehicle_crop.shape[:2]
        px1, py1 = max(0, px1), max(0, py1)
        px2, py2 = min(vw, px2), min(vh, py2)
        if px2 - px1 < 5 or py2 - py1 < 5:
            return None

        plate_crop = vehicle_crop[py1:py2, px1:px2]

        # Convert local plate bbox to full-frame coordinates
        plate_bbox_full = (x1 + px1, y1 + py1, x1 + px2, y1 + py2)

        # --- Preprocessing ---
        processed = preprocess_plate_image(plate_crop)

        # --- OCR ---
        raw_text, ocr_conf = self._run_ocr(processed)
        if not raw_text or ocr_conf < self.ocr_confidence_threshold:
            return None

        # --- Validation ---
        cleaned = clean_ocr_text(raw_text)
        is_valid, plate_number = validate_indian_plate(cleaned)

        return OCRReading(
            raw_text=raw_text,
            cleaned_text=cleaned,
            plate_number=plate_number,
            ocr_confidence=ocr_conf,
            plate_det_confidence=plate_conf,
            is_valid_indian=is_valid,
            plate_bbox=plate_bbox_full,
            vehicle_bbox=vehicle_bbox,
            timestamp=timestamp,
        )

    def _detect_plate(
        self, vehicle_crop: np.ndarray
    ) -> tuple[Optional[tuple[float, float, float, float]], float]:
        """Detect license plate inside a vehicle crop.
        Returns (bbox_in_crop, confidence) or (None, 0)."""
        if self._plate_model is None:
            return None, 0.0
        try:
            results = self._plate_model.predict(
                vehicle_crop,
                conf=self.plate_confidence,
                device=config.YOLO_DEVICE,
                verbose=False,
            )[0]
            boxes = results.boxes
            if boxes is None or len(boxes) == 0:
                return None, 0.0
            # Take the highest-confidence plate
            best_idx = boxes.conf.argmax().item()
            bbox = boxes.xyxy[best_idx].tolist()
            conf = float(boxes.conf[best_idx])
            return tuple(bbox), conf
        except Exception as exc:
            if "out of memory" in str(exc).lower() and config.YOLO_DEVICE != "cpu":
                logger.warning("CUDA OOM in plate detector; falling back to CPU: %s", exc)
                try:
                    import torch
                    if torch.cuda.is_available():
                        torch.cuda.empty_cache()
                except Exception:
                    pass
                try:
                    results = self._plate_model.predict(
                        vehicle_crop,
                        conf=self.plate_confidence,
                        device="cpu",
                        verbose=False,
                    )[0]
                    boxes = results.boxes
                    if boxes is None or len(boxes) == 0:
                        return None, 0.0
                    best_idx = boxes.conf.argmax().item()
                    bbox = boxes.xyxy[best_idx].tolist()
                    conf = float(boxes.conf[best_idx])
                    return tuple(bbox), conf
                except Exception as fallback_exc:
                    logger.debug("Plate detection fallback error: %s", fallback_exc)
                    return None, 0.0
            logger.debug("Plate detection error: %s", exc)
            return None, 0.0

    def _run_ocr(self, plate_image: np.ndarray) -> tuple[str, float]:
        """Run PaddleOCR on a preprocessed plate image.
        Returns (text, confidence) or ('', 0)."""
        if not _PADDLE_AVAILABLE or _PADDLE_OCR is None or _PADDLE_OCR is False:
            return "", 0.0
        try:
            try:
                result = _PADDLE_OCR.ocr(plate_image)
            except (TypeError, ValueError):
                result = _PADDLE_OCR.ocr(plate_image, cls=True)
            if not result or not result[0]:
                return "", 0.0
            texts = []
            confs = []
            if isinstance(result[0], dict):
                raw_texts = result[0].get("rec_texts", [])
                raw_scores = result[0].get("rec_scores", [])
                for t, s in zip(raw_texts, raw_scores):
                    if t:
                        texts.append(str(t))
                        confs.append(float(s))
            else:
                for line in result[0]:
                    if line and len(line) >= 2:
                        text_info = line[1]
                        if isinstance(text_info, (list, tuple)) and len(text_info) >= 2:
                            texts.append(str(text_info[0]))
                            confs.append(float(text_info[1]))
            if not texts:
                return "", 0.0
            combined = " ".join(texts)
            avg_conf = sum(confs) / len(confs)
            return combined, avg_conf
        except Exception as exc:
            logger.debug("OCR error: %s", exc)
            return "", 0.0

    # ------------------------------------------------------------------
    # Multi-frame consensus
    # ------------------------------------------------------------------
    def _compute_consensus(self, track_id: str) -> Optional[ANPRResult]:
        """Check if enough valid readings agree on a plate number."""
        hist = self._track_history.get(track_id)
        if hist is None:
            return None

        valid_readings = [r for r in hist.readings if r.is_valid_indian and r.plate_number]
        if len(valid_readings) < self.min_consensus_readings:
            return None

        # Weighted vote: weight = ocr_confidence * plate_det_confidence
        votes: dict[str, float] = defaultdict(float)
        vote_counts: dict[str, int] = defaultdict(int)
        plate_data: dict[str, OCRReading] = {}  # latest reading per plate

        for r in valid_readings:
            weight = r.ocr_confidence * r.plate_det_confidence
            votes[r.plate_number] += weight
            vote_counts[r.plate_number] += 1
            plate_data[r.plate_number] = r

        if not votes:
            return None

        # Find the plate with the highest weighted vote
        best_plate = max(votes, key=votes.get)
        best_count = vote_counts[best_plate]

        # Require the winner to have at least min_consensus_readings votes
        if best_count < self.min_consensus_readings:
            return None

        total_weight = sum(votes.values())
        consensus_score = votes[best_plate] / total_weight if total_weight > 0 else 0

        # Need at least 50% of weighted vote
        if consensus_score < 0.5:
            return None

        latest = plate_data[best_plate]

        # Validation status
        is_valid, _ = validate_indian_plate(best_plate)
        if is_valid and consensus_score >= 0.7:
            status = "VALID"
        elif is_valid:
            status = "PARTIAL"
        else:
            status = "UNVALIDATED"

        # Average confidences from the winning readings
        winning_readings = [r for r in valid_readings if r.plate_number == best_plate]
        avg_ocr_conf = sum(r.ocr_confidence for r in winning_readings) / len(winning_readings)
        avg_plate_conf = sum(r.plate_det_confidence for r in winning_readings) / len(winning_readings)

        return ANPRResult(
            track_id=track_id,
            vehicle_type="vehicle",  # overridden by caller with actual class_name
            plate_number=best_plate,
            raw_ocr_text=latest.raw_text,
            ocr_confidence=round(avg_ocr_conf, 3),
            plate_detection_confidence=round(avg_plate_conf, 3),
            consensus_score=round(consensus_score, 3),
            vehicle_bbox=latest.vehicle_bbox,
            plate_bbox=latest.plate_bbox,
            timestamp=latest.timestamp,
            validation_status=status,
        )

    # ------------------------------------------------------------------
    # Evidence image
    # ------------------------------------------------------------------
    @staticmethod
    def _make_evidence_image(
        frame: np.ndarray,
        vehicle_bbox: tuple[float, float, float, float],
        plate_bbox: tuple[float, float, float, float],
    ) -> np.ndarray:
        """Create an evidence crop showing the vehicle with plate highlighted."""
        x1, y1, x2, y2 = (int(v) for v in vehicle_bbox)
        fh, fw = frame.shape[:2]
        # Add some margin
        margin = 20
        x1, y1 = max(0, x1 - margin), max(0, y1 - margin)
        x2, y2 = min(fw, x2 + margin), min(fh, y2 + margin)
        evidence = frame[y1:y2, x1:x2].copy()
        # Draw plate bbox relative to the crop
        px1, py1, px2, py2 = (int(v) for v in plate_bbox)
        px1 -= x1
        py1 -= y1
        px2 -= x1
        py2 -= y1
        cv2.rectangle(evidence, (px1, py1), (px2, py2), (0, 255, 0), 2)
        return evidence


# ---------------------------------------------------------------------------
# Self-check
# ---------------------------------------------------------------------------

def demo():
    """Self-check: text cleaning, validation, and consensus logic."""
    # --- Text cleaning ---
    assert clean_ocr_text("  mh 12 ab 1234  ") == "MH 12 AB 1234"
    assert clean_ocr_text("KA-09-EE-9999") == "KA09EE9999"
    assert clean_ocr_text("DL.01.CA.0001!") == "DL01CA0001"

    # --- Indian plate validation ---
    ok1, p1 = validate_indian_plate("MH12AB1234")
    assert ok1 and p1 == "MH12AB1234", f"got {ok1}, {p1}"

    ok2, p2 = validate_indian_plate("DL 01 CA 0001")
    assert ok2 and p2 == "DL01CA0001", f"got {ok2}, {p2}"

    ok3, p3 = validate_indian_plate("INVALID")
    assert not ok3, f"expected invalid, got {ok3}"

    ok4, p4 = validate_indian_plate("KA09EE9999")
    assert ok4 and p4 == "KA09EE9999"

    # --- Preprocessing ---
    dummy = np.zeros((30, 80, 3), dtype=np.uint8)
    result = preprocess_plate_image(dummy)
    assert result.shape[2] == 3, "should return 3-channel image"
    assert result.shape[1] >= 200, "should upscale small images"

    # Empty image safety
    empty = np.array([], dtype=np.uint8)
    assert preprocess_plate_image(empty) is not None

    # --- Consensus logic ---
    engine = ANPREngine(min_consensus_readings=2, frame_interval=1)
    # Simulate readings
    hist = engine._track_history["test:P-1"]
    for i in range(3):
        hist.readings.append(OCRReading(
            raw_text="MH12AB1234", cleaned_text="MH12AB1234",
            plate_number="MH12AB1234", ocr_confidence=0.9,
            plate_det_confidence=0.85, is_valid_indian=True,
            plate_bbox=(10, 10, 50, 30), vehicle_bbox=(0, 0, 100, 100),
            timestamp=float(i),
        ))
    consensus = engine._compute_consensus("test:P-1")
    assert consensus is not None, "should reach consensus with 3 identical readings"
    assert consensus.plate_number == "MH12AB1234"
    assert consensus.consensus_score == 1.0
    assert consensus.validation_status == "VALID"

    # --- No consensus with too few readings ---
    engine2 = ANPREngine(min_consensus_readings=5, frame_interval=1)
    hist2 = engine2._track_history["test:P-2"]
    hist2.readings.append(OCRReading(
        raw_text="KA09EE9999", cleaned_text="KA09EE9999",
        plate_number="KA09EE9999", ocr_confidence=0.8,
        plate_det_confidence=0.7, is_valid_indian=True,
        plate_bbox=(0, 0, 1, 1), vehicle_bbox=(0, 0, 1, 1),
        timestamp=0.0,
    ))
    assert engine2._compute_consensus("test:P-2") is None, "too few readings"

    # --- Mixed readings (majority wins) ---
    engine3 = ANPREngine(min_consensus_readings=2, frame_interval=1)
    hist3 = engine3._track_history["test:P-3"]
    for _ in range(3):
        hist3.readings.append(OCRReading(
            raw_text="MH14CD5678", cleaned_text="MH14CD5678",
            plate_number="MH14CD5678", ocr_confidence=0.85,
            plate_det_confidence=0.8, is_valid_indian=True,
            plate_bbox=(0, 0, 1, 1), vehicle_bbox=(0, 0, 1, 1),
            timestamp=0.0,
        ))
    hist3.readings.append(OCRReading(
        raw_text="MH14CD5679", cleaned_text="MH14CD5679",
        plate_number="MH14CD5679", ocr_confidence=0.6,
        plate_det_confidence=0.5, is_valid_indian=True,
        plate_bbox=(0, 0, 1, 1), vehicle_bbox=(0, 0, 1, 1),
        timestamp=0.0,
    ))
    c3 = engine3._compute_consensus("test:P-3")
    assert c3 is not None and c3.plate_number == "MH14CD5678", "majority should win"

    print("anpr.py self-check passed")


if __name__ == "__main__":
    demo()
