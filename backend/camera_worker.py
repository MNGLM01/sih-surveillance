"""Per-camera ingestion: owns one cv2.VideoCapture, feeds frames through the
SurveillancePipeline, and turns results into callbacks. This is intentionally
thin - detection/tracking/behavior/risk/incident logic all lives in their own
modules; this file only knows how to read frames and not crash the process
when a camera misbehaves.

Run standalone for validation: python backend/camera_worker.py
"""
import logging
import os
import sys
import time
from pathlib import Path

import cv2

sys.path.insert(0, str(Path(__file__).parent))
import config
from evidence import EvidenceBuffer

logger = logging.getLogger("camera_worker")

STATUS_STARTING = "STARTING"
STATUS_ONLINE = "ONLINE"
STATUS_OFFLINE = "OFFLINE"
STATUS_ERROR = "ERROR"
STATUS_STOPPED = "STOPPED"


class CameraWorker:
    """Owns one camera's ingestion loop. A failure here (bad source, a
    transient decode error) is retried with backoff and never propagates to
    other cameras' threads - each CameraWorker.run() is its own thread."""

    def __init__(self, context, pipeline, on_frame=None, on_event=None, on_incident=None, on_incident_evidence=None, on_anpr=None):
        self.context = context
        self.pipeline = pipeline
        self.on_frame = on_frame  # (camera_id, annotated_frame)
        self.on_event = on_event  # (camera_id, track_id, cls_name, score, breakdown) -> (path, on_saved) | None
        self.on_incident = on_incident  # (incident, is_new) -> incident_id
        self.on_incident_evidence = on_incident_evidence  # (incident_id, path)
        self.on_anpr = on_anpr  # (camera_id, ANPRResult)
        self._stop = False
        self.fps = 25
        self._last_result = None  # cached pipeline result for frame-skip annotation

    def stop(self):
        self._stop = True

    def run(self):
        self._stop = False
        attempt = 0
        while not self._stop and attempt <= config.CAMERA_MAX_RETRIES:
            attempt += 1
            self.context.status = STATUS_STARTING
            try:
                self._run_once()
                self.context.status = STATUS_STOPPED if self._stop else STATUS_OFFLINE
                return
            except Exception as exc:  # noqa: BLE001 - a camera failure must not kill the process
                self.context.status = STATUS_ERROR
                self.context.error = str(exc)
                logger.error("[%s] camera error (attempt %d/%d): %s", self.context.camera_id, attempt, config.CAMERA_MAX_RETRIES, exc)
                if self._stop or attempt > config.CAMERA_MAX_RETRIES:
                    break
                time.sleep(config.CAMERA_RETRY_DELAY_SECONDS)
        self.context.status = STATUS_OFFLINE
        logger.error("[%s] giving up after %d attempt(s)", self.context.camera_id, attempt)

    def _run_once(self):
        cap = cv2.VideoCapture(self.context.source)
        if not cap.isOpened():
            raise RuntimeError(f"cannot open source: {self.context.source}")
        try:
            self.fps = cap.get(cv2.CAP_PROP_FPS) or 25
            self.context.evidence = EvidenceBuffer(fps=self.fps)
            self.context.status = STATUS_ONLINE
            self.context.error = None
            logger.info("[%s] started (fps=%.1f)", self.context.camera_id, self.fps)

            frame_idx = 0
            is_file = isinstance(self.context.source, str) and os.path.isfile(self.context.source)
            skip_n = max(1, config.PIPELINE_SKIP_FRAMES)
            while not self._stop:
                ok, frame = cap.read()
                if not ok:
                    if is_file:  # loop sample-video demos instead of stopping after one pass
                        cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                        frame_idx = 0
                        self._last_result = None
                        self.context.tracker.reset()
                        if self.context.anpr_engine is not None:
                            self.context.anpr_engine.reset()
                        continue
                    return  # webcam/RTSP: a real end of stream, not something to loop
                video_time = frame_idx / self.fps
                frame_idx += 1
                t0 = time.time()

                # Run full pipeline every Nth frame; lightweight display-only on others
                if frame_idx % skip_n == 0 or self._last_result is None:
                    self._process(frame, video_time)
                else:
                    self._push_display_frame(frame)

                elapsed = time.time() - t0
                target_dt = 1.0 / self.fps
                if is_file and elapsed < target_dt:
                    time.sleep(target_dt - elapsed)
        finally:
            cap.release()

    def _process(self, frame, video_time):
        result = self.pipeline.process_frame(self.context, frame, video_time)
        annotated = self._annotate(frame, result)

        # --- ANPR processing (independent of risk/behavior/incident) ---
        if self.context.anpr_engine is not None:
            try:
                anpr_results = self.context.anpr_engine.process_tracks(
                    frame, result.tracks, video_time,
                )
                for ar in anpr_results:
                    # Set actual vehicle type from the track
                    matching = [t for t in result.tracks if t.track_id == ar.track_id]
                    if matching:
                        ar.vehicle_type = matching[0].class_name
                    if self.on_anpr:
                        self.on_anpr(self.context.camera_id, ar)
                # Draw plate labels on the annotated frame
                annotated = self._annotate_anpr(
                    annotated, self.context.anpr_engine.get_active_plates(),
                    result.tracks,
                )
            except Exception as exc:
                logger.debug("[%s] ANPR error: %s", self.context.camera_id, exc)
        # --- END ANPR ---

        self.context.evidence.append(annotated)

        if self.on_frame:
            self.on_frame(self.context.camera_id, annotated)

        # Cache result for frame-skip re-annotation
        self._last_result = result

        for tr in result.track_results:
            if tr.incident is None:
                continue
            if tr.incident_is_new:
                self._handle_new_incident(tr)
            elif self.on_incident:
                self.on_incident(tr.incident, False)

    def _handle_new_incident(self, tr):
        on_saved_callbacks = []
        evidence_path = None

        if self.on_event:
            requested = self.on_event(
                self.context.camera_id, tr.track.track_id, tr.track.class_name,
                tr.risk.score, tr.incident.reasons,
            )
            if requested:
                evidence_path, on_saved_event = requested
                on_saved_callbacks.append(on_saved_event)

        if self.on_incident:
            incident_id = self.on_incident(tr.incident, True)
            if incident_id is not None:
                self.context.incident_manager.set_persisted_id(tr.track.track_id, incident_id)
                if self.on_incident_evidence:
                    on_saved_callbacks.append(lambda path, iid=incident_id: self.on_incident_evidence(iid, path))

        if evidence_path and on_saved_callbacks:
            def on_saved(path, callbacks=tuple(on_saved_callbacks)):
                self.context.incident_manager.set_evidence_path(tr.track.track_id, str(path))
                for cb in callbacks:
                    cb(path)
            self.context.evidence.trigger(evidence_path, on_saved=on_saved)

    def _push_display_frame(self, frame):
        """Lightweight path for skipped frames: re-annotate with the last known
        pipeline results (bounding boxes, risk colors) and push for display
        without running any ML inference."""
        if self._last_result is not None:
            annotated = self._annotate(frame, self._last_result)
        else:
            annotated = frame
        self.context.evidence.append(annotated)
        if self.on_frame:
            self.on_frame(self.context.camera_id, annotated)

    @staticmethod
    def _annotate(frame, result):
        """Draws boxes/ids for the live feed and evidence clips. Kept here
        (not in detector/tracker) since it's a presentation concern, not
        detection or tracking logic."""
        annotated = frame.copy()
        for tr in result.track_results:
            x1, y1, x2, y2 = (int(v) for v in tr.track.bbox)
            color = (0, 0, 255) if tr.risk.severity == "HIGH" else (0, 165, 255) if tr.risk.severity == "MEDIUM" else (0, 200, 0)
            cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
            label = f"{tr.track.track_id} {tr.track.class_name} {tr.risk.score}"
            cv2.putText(annotated, label, (x1, max(0, y1 - 8)), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)
        return annotated

    @staticmethod
    def _annotate_anpr(frame, active_plates, tracks):
        """Overlay confirmed plate numbers on vehicles in the live feed."""
        if not active_plates:
            return frame
        track_bboxes = {t.track_id: t.bbox for t in tracks}
        for track_id, plate_number in active_plates.items():
            bbox = track_bboxes.get(track_id)
            if bbox is None:
                continue
            x1, y1, x2, y2 = (int(v) for v in bbox)
            # Draw plate text below the vehicle bbox
            plate_label = f"PLATE: {plate_number}"
            text_y = min(y2 + 18, frame.shape[0] - 5)
            cv2.putText(
                frame, plate_label, (x1, text_y),
                cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 255, 255), 2,
            )
        return frame


if __name__ == "__main__":
    from pipeline import SurveillancePipeline
    from services.camera_service import build_camera_context

    logging.basicConfig(level=logging.INFO)
    cfg = config.CAMERAS[0]
    context = build_camera_context(cfg)
    pipeline = SurveillancePipeline()

    def _print_event(camera_id, track_id, cls_name, score, breakdown):
        print(f"[{camera_id}] track={track_id} ({cls_name}) score={score} -> {breakdown}")
        return None

    worker = CameraWorker(context, pipeline, on_event=_print_event)
    print(f"Running on {cfg['source']} ... press Ctrl+C to stop")
    start = time.time()
    try:
        worker.run()
    except KeyboardInterrupt:
        worker.stop()
    print(f"Done in {time.time() - start:.1f}s")
