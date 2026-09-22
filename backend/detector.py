"""Object detection only: frame -> Detections. No tracking, no risk, no CV
decisions about what a detection *means* - that is tracker.py/behavior.py's job.
"""
import sys
from pathlib import Path

from ultralytics import YOLO

import logging
sys.path.insert(0, str(Path(__file__).parent))
import config
from config import DETECTOR_MODEL_PATH, DETECTOR_CONFIDENCE
from schemas import Detection

logger = logging.getLogger("detector")

# COCO class ids this prototype cares about.
CLASS_NAMES = {0: "person", 2: "car", 3: "motorcycle", 5: "bus", 7: "truck"}
DETECT_CLASSES = list(CLASS_NAMES.keys())
VEHICLE_CLASSES = {"car", "motorcycle", "bus", "truck"}


def is_vehicle(class_name: str) -> bool:
    return class_name in VEHICLE_CLASSES


class Detector:
    """Owns one YOLO model instance. Safe to share with a Tracker for the
    same camera so detection+tracking stays a single forward pass per frame."""

    def __init__(self, model_path: str = DETECTOR_MODEL_PATH, classes=None, confidence: float = DETECTOR_CONFIDENCE):
        self.model = YOLO(model_path)
        self.classes = classes or DETECT_CLASSES
        self.confidence = confidence

    def detect(self, frame) -> list[Detection]:
        try:
            results = self.model.predict(
                frame,
                classes=self.classes,
                conf=self.confidence,
                device=config.YOLO_DEVICE,
                verbose=False,
            )[0]
        except Exception as exc:
            if "out of memory" in str(exc).lower() and config.YOLO_DEVICE != "cpu":
                logger.warning("CUDA OOM in detector; falling back to CPU: %s", exc)
                try:
                    import torch
                    if torch.cuda.is_available():
                        torch.cuda.empty_cache()
                except Exception:
                    pass
                results = self.model.predict(
                    frame,
                    classes=self.classes,
                    conf=self.confidence,
                    device="cpu",
                    verbose=False,
                )[0]
            else:
                raise
        return self.to_detections(results)

    def reset_tracker(self):
        """Resets the tracker instances inside the YOLO predictor so track IDs do
        not inflate indefinitely across video loops or sessions."""
        try:
            if hasattr(self.model, "predictor") and self.model.predictor is not None:
                trackers = getattr(self.model.predictor, "trackers", None)
                if trackers:
                    for tr in trackers:
                        if hasattr(tr, "reset"):
                            tr.reset()
        except Exception:
            pass

    @staticmethod
    def to_detections(results) -> list[Detection]:
        boxes = results.boxes
        if boxes is None or len(boxes) == 0:
            return []
        detections = []
        for box, cls_id, conf in zip(boxes.xyxy.tolist(), boxes.cls.tolist(), boxes.conf.tolist()):
            x1, y1, x2, y2 = box
            detections.append(Detection(
                bbox=(x1, y1, x2, y2),
                class_name=CLASS_NAMES.get(int(cls_id), "object"),
                confidence=float(conf),
                center=((x1 + x2) / 2, (y1 + y2) / 2),
            ))
        return detections


def demo():
    """Self-check: to_detections() maps raw box fields correctly."""

    class _FakeBoxes:
        xyxy = type("T", (), {"tolist": lambda self: [[10, 20, 30, 40]]})()
        cls = type("T", (), {"tolist": lambda self: [0.0]})()
        conf = type("T", (), {"tolist": lambda self: [0.93]})()

        def __len__(self):
            return 1

    class _FakeResults:
        boxes = _FakeBoxes()

    detections = Detector.to_detections(_FakeResults())
    assert len(detections) == 1
    d = detections[0]
    assert d.class_name == "person"
    assert d.confidence == 0.93
    assert d.bbox == (10, 20, 30, 40)
    assert d.center == (20, 30)
    print("detector.py self-check passed")


if __name__ == "__main__":
    demo()
