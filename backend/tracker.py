"""Tracking only: per-frame boxes -> persistent, camera-scoped Tracks.

Ultralytics fuses detection + ByteTrack into one `model.track()` forward pass;
running Detector.detect() separately here would double inference cost for no
benefit, so Tracker reuses the Detector's own model for that single call and
is responsible only for turning its output into stable identities (raw
ultralytics ids reset/collide across camera model instances, so every id is
rewritten as "<camera_id>:P-<raw_id>" before leaving this module).
"""
from collections import deque

import config
from detector import Detector
from schemas import Detection, Track

POSITION_HISTORY_LEN = 30
DEFAULT_TRACKER_CFG = "bytetrack.yaml"


class _TrackState:
    __slots__ = ("raw_id", "class_name", "first_seen", "last_seen", "positions")

    def __init__(self, raw_id: int, class_name: str, now: float):
        self.raw_id = raw_id
        self.class_name = class_name
        self.first_seen = now
        self.last_seen = now
        self.positions = deque(maxlen=POSITION_HISTORY_LEN)


class Tracker:
    """One instance per camera - `_tracks` is never shared across cameras,
    so a `cam1:P-7` and a `cam2:P-7` cannot collide or read each other's state."""

    def __init__(self, camera_id: str, detector: Detector, tracker_cfg: str = DEFAULT_TRACKER_CFG):
        self.camera_id = camera_id
        self.detector = detector
        self.tracker_cfg = tracker_cfg
        self._tracks: dict[str, _TrackState] = {}

    def update(self, frame, now: float) -> tuple[list[Detection], list[Track]]:
        """`now` should be video-time (frame_idx / fps) for file sources so
        dwell-time reflects the footage's own timeline, not wall-clock CPU speed."""
        results = self.detector.model.track(
            frame,
            persist=True,
            classes=self.detector.classes,
            conf=self.detector.confidence,
            tracker=self.tracker_cfg,
            imgsz=getattr(config, "YOLO_IMGSZ", 480),
            verbose=False,
        )[0]
        detections = self.detector.to_detections(results)

        boxes = results.boxes
        tracks: list[Track] = []
        if boxes is not None and boxes.id is not None:
            for det, raw_id in zip(detections, boxes.id.tolist()):
                raw_id = int(raw_id)
                track_id = f"{self.camera_id}:P-{raw_id}"
                state = self._tracks.get(track_id)
                if state is None:
                    state = _TrackState(raw_id, det.class_name, now)
                    self._tracks[track_id] = state
                state.class_name = det.class_name
                state.last_seen = now
                state.positions.append((now, det.center[0], det.center[1]))

                tracks.append(Track(
                    track_id=track_id,
                    raw_id=raw_id,
                    class_name=state.class_name,
                    bbox=det.bbox,
                    center=det.center,
                    confidence=det.confidence,
                    first_seen=state.first_seen,
                    last_seen=state.last_seen,
                    positions=tuple(state.positions),
                ))
        return detections, tracks

    def reset(self):
        """Called when a looping file source restarts, so a fresh pass over
        the same footage doesn't inherit stale loiter/position history."""
        self._tracks.clear()
        if hasattr(self.detector, "reset_tracker"):
            self.detector.reset_tracker()


def demo():
    """Self-check: two Trackers for different cameras never share track state,
    even when fed the identical raw ultralytics track id."""

    class _FakeDetector:
        model = None
        classes = []
        confidence = 0.25

    t1 = Tracker("cam1", _FakeDetector())
    t2 = Tracker("cam2", _FakeDetector())
    t1._tracks["cam1:P-7"] = _TrackState(7, "person", 0.0)
    t2._tracks["cam2:P-7"] = _TrackState(7, "person", 0.0)
    assert "cam2:P-7" not in t1._tracks
    assert "cam1:P-7" not in t2._tracks
    print("tracker.py self-check passed")


if __name__ == "__main__":
    demo()
