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

    def stop(self):
        self._stop = True

    def run(self):
        cap = cv2.VideoCapture(self.cfg["source"])
        if not cap.isOpened():
            raise RuntimeError(f"Cannot open source: {self.cfg['source']}")

        self.fps = cap.get(cv2.CAP_PROP_FPS) or 25
        fps = self.fps
        self._frame_buffer = deque(maxlen=int(fps * EVIDENCE_BUFFER_SECONDS))
        frame_idx = 0
        zone = self.cfg["zone"]
        is_file = isinstance(self.cfg["source"], str) and os.path.isfile(self.cfg["source"])
        while not self._stop:
            ok, frame = cap.read()
            if not ok:
                if is_file:  # loop sample-video demos instead of stopping after one pass
                    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    frame_idx = 0
                    self.history = risk.TrackHistory()  # fresh loiter/zone state each loop
                    continue
                break  # webcam/RTSP: a real end of stream, not something to loop
            video_time = frame_idx / fps
            frame_idx += 1

            results = self.model.track(
                frame, persist=True, classes=DETECT_CLASSES, verbose=False
            )[0]
            annotated = results.plot()
            self._frame_buffer.append(annotated)

            boxes = results.boxes
            if boxes is not None and boxes.id is not None:
                for box, track_id, cls_id in zip(
                    boxes.xyxy.tolist(), boxes.id.tolist(), boxes.cls.tolist()
                ):
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

        cap.release()

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
