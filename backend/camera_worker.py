"""Per-camera pipeline: capture -> detect+track -> event/risk -> push.

Run standalone for validation: python backend/camera_worker.py
"""
import os
import sys
import time
from collections import deque
from pathlib import Path

import cv2
from ultralytics import YOLO

sys.path.insert(0, str(Path(__file__).parent))
from config import CAMERAS, FORCE_AFTER_HOURS
import risk

# COCO class ids: 0=person, 2=car, 3=motorcycle, 5=bus, 7=truck
DETECT_CLASSES = [0, 2, 3, 5, 7]
VEHICLE_CLASSES = {2, 3, 5, 7}
EVIDENCE_BUFFER_SECONDS = 6

try:
    import torch
    DEFAULT_DEVICE = 0 if torch.cuda.is_available() else "cpu"
except Exception:
    DEFAULT_DEVICE = "cpu"


class CameraWorker:
    """Owns one video source, one YOLO model instance (own tracker state), one risk history."""

    def __init__(self, camera_cfg, on_frame=None, on_event=None):
        self.cfg = camera_cfg
        self.model = YOLO("yolo11n.pt")
        self.history = risk.TrackHistory()
        self.on_frame = on_frame  # callback(camera_id, annotated_frame)
        self.on_event = on_event  # callback(camera_id, track_id, cls_name, score, breakdown, save_evidence)
        self._stop = False
        self._frame_buffer = deque(maxlen=1)  # sized once fps is known
        self.fps = 25
        self.device = self.cfg.get("device", DEFAULT_DEVICE)
        self.imgsz = self.cfg.get("imgsz", 480)
        self.conf = self.cfg.get("conf", 0.25)
        self.iou = self.cfg.get("iou", 0.45)
        default_tracker = os.path.join(os.path.dirname(__file__), "bytetrack.yaml")
        self.tracker = self.cfg.get("tracker", default_tracker)


    def stop(self):
        self._stop = True

    def reset_tracker(self):
        """Resets ByteTrack state (clears active tracks, Kalman filters, and ID counters)."""
        if hasattr(self.model, "predictor") and self.model.predictor is not None:
            trackers = getattr(self.model.predictor, "trackers", None)
            if trackers:
                for trk in trackers:
                    if hasattr(trk, "reset"):
                        trk.reset()

    def run(self):
        is_file = isinstance(self.cfg["source"], str) and os.path.isfile(self.cfg["source"])
        zone = self.cfg["zone"]

        while not self._stop:
            cap = cv2.VideoCapture(self.cfg["source"])
            if not cap.isOpened():
                if is_file:
                    raise RuntimeError(f"Cannot open source file: {self.cfg['source']}")
                # For RTSP / webcam live feeds, retry with backoff instead of crashing
                print(f"[{self.cfg['id']}] Cannot open stream: {self.cfg['source']}. Retrying in 3s...")
                time.sleep(3)
                continue

            self.fps = cap.get(cv2.CAP_PROP_FPS) or 25
            fps = self.fps
            self._frame_buffer = deque(maxlen=int(fps * EVIDENCE_BUFFER_SECONDS))
            frame_idx = 0
            last_cleanup_time = 0

            while not self._stop:
                t_frame_start = time.time()
                ok, frame = cap.read()
                if not ok:
                    if is_file:  # loop sample-video demos instead of stopping after one pass
                        cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                        frame_idx = 0
                        self.history = risk.TrackHistory()  # fresh loiter/zone state each loop
                        self.reset_tracker()  # fresh ByteTrack Kalman state on loop
                        continue
                    # Live RTSP / webcam disconnected or stream ended
                    print(f"[{self.cfg['id']}] Stream disconnected. Reconnecting...")
                    break

                video_time = frame_idx / fps
                frame_idx += 1

                # Periodic cleanup of stale tracks (every 30 seconds of footage) to prevent memory creep
                if video_time - last_cleanup_time > 30:
                    self.history.cleanup_stale(now=video_time, max_idle_seconds=120)
                    last_cleanup_time = video_time

                results = self.model.track(
                    frame,
                    persist=True,
                    classes=DETECT_CLASSES,
                    tracker=self.tracker,
                    conf=self.conf,
                    iou=self.iou,
                    imgsz=self.imgsz,
                    device=self.device,
                    verbose=False,
                )[0]

                annotated = results.plot()
                self._frame_buffer.append(annotated)

                boxes = results.boxes
                if boxes is not None and boxes.id is not None:
                    # Safely handle tracked detections
                    boxes_xyxy = boxes.xyxy.tolist() if hasattr(boxes.xyxy, "tolist") else []
                    track_ids = boxes.id.tolist() if hasattr(boxes.id, "tolist") else []
                    cls_ids = boxes.cls.tolist() if hasattr(boxes.cls, "tolist") else []

                    for box, track_id, cls_id in zip(boxes_xyxy, track_ids, cls_ids):
                        if track_id is None:
                            continue
                        track_id = int(track_id)
                        cls_name = "vehicle" if int(cls_id) in VEHICLE_CLASSES else "person"
                        cx, cy = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2

                        self.history.update(track_id, cls_name, (cx, cy), now=video_time)
                        signals = self.history.signals(track_id, zone, FORCE_AFTER_HOURS)
                        score, breakdown = risk.compute_risk(signals)

                        if self.on_event and self.history.score_crossed_high(track_id, score):
                            self.on_event(
                                self.cfg["id"], track_id, cls_name, score, breakdown,
                                self.save_evidence_clip,
                            )

                if self.on_frame:
                    self.on_frame(self.cfg["id"], annotated)

                if is_file:
                    delay = (1.0 / fps) - (time.time() - t_frame_start)
                    if delay > 0:
                        time.sleep(delay)

            cap.release()
            if is_file or self._stop:
                break


    def save_evidence_clip(self, path):
        """Writes the buffered recent frames (annotated) to an mp4. Called from on_event."""
        frames = list(self._frame_buffer)
        if not frames:
            return False
        h, w = frames[0].shape[:2]
        writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"mp4v"), self.fps, (w, h))
        for f in frames:
            writer.write(f)
        writer.release()
        return True


if __name__ == "__main__":
    cam_cfg = CAMERAS[0]

    def _print_event(camera_id, track_id, cls_name, score, breakdown, save_evidence):
        print(f"[{camera_id}] track={track_id} ({cls_name}) score={score} -> {breakdown}")

    worker = CameraWorker(cam_cfg, on_event=_print_event)
    print(f"Running on {cam_cfg['source']} ... press Ctrl+C to stop")
    start = time.time()
    worker.run()
    print(f"Done in {time.time() - start:.1f}s")
