import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from detector import Detector  # noqa: E402
from tracker import Tracker  # noqa: E402


class _FakeArray:
    def __init__(self, data):
        self._data = data

    def tolist(self):
        return self._data


class _FakeBoxes:
    def __init__(self, xyxy, cls, conf, ids):
        self.xyxy = _FakeArray(xyxy)
        self.cls = _FakeArray(cls)
        self.conf = _FakeArray(conf)
        self.id = _FakeArray(ids) if ids is not None else None

    def __len__(self):
        return len(self.xyxy._data)


class _FakeResults:
    def __init__(self, boxes):
        self.boxes = boxes


class _FakeModel:
    """Stands in for a real YOLO model - returns one canned frame of boxes per call."""

    def __init__(self, frames_of_boxes):
        self._frames = iter(frames_of_boxes)

    def track(self, frame, **kwargs):
        return [_FakeResults(next(self._frames))]


class _FakeDetector:
    to_detections = staticmethod(Detector.to_detections)  # reuse the real mapping logic

    def __init__(self, frames_of_boxes):
        self.model = _FakeModel(frames_of_boxes)
        self.classes = [0]
        self.confidence = 0.25


class TestTracker(unittest.TestCase):
    def test_track_id_persists_across_frames_for_same_raw_id(self):
        frames = [
            _FakeBoxes(xyxy=[[0, 0, 10, 10]], cls=[0.0], conf=[0.9], ids=[7]),
            _FakeBoxes(xyxy=[[1, 1, 11, 11]], cls=[0.0], conf=[0.9], ids=[7]),
        ]
        tracker = Tracker("cam1", _FakeDetector(frames))

        _, tracks1 = tracker.update(frame=None, now=0.0)
        _, tracks2 = tracker.update(frame=None, now=1.0)

        self.assertEqual(tracks1[0].track_id, "cam1:P-7")
        self.assertEqual(tracks2[0].track_id, "cam1:P-7")
        self.assertEqual(tracks2[0].first_seen, 0.0)
        self.assertEqual(tracks2[0].last_seen, 1.0)

    def test_different_cameras_have_isolated_track_state_for_same_raw_id(self):
        """The multi-camera requirement: CAM-01 track #7 and CAM-02 track #7
        must never share state even though ByteTrack assigned them the same
        raw numeric id independently in each camera's own model instance."""
        boxes_cam1 = _FakeBoxes(xyxy=[[0, 0, 10, 10]], cls=[0.0], conf=[0.9], ids=[7])
        boxes_cam2 = _FakeBoxes(xyxy=[[0, 0, 10, 10]], cls=[0.0], conf=[0.9], ids=[7])
        tracker_cam1 = Tracker("cam1", _FakeDetector([boxes_cam1]))
        tracker_cam2 = Tracker("cam2", _FakeDetector([boxes_cam2]))

        _, tracks1 = tracker_cam1.update(frame=None, now=100.0)
        _, tracks2 = tracker_cam2.update(frame=None, now=5.0)

        self.assertEqual(tracks1[0].track_id, "cam1:P-7")
        self.assertEqual(tracks2[0].track_id, "cam2:P-7")
        self.assertNotIn("cam2:P-7", tracker_cam1._tracks)
        self.assertNotIn("cam1:P-7", tracker_cam2._tracks)
        self.assertEqual(tracks1[0].first_seen, 100.0)
        self.assertEqual(tracks2[0].first_seen, 5.0)

    def test_reset_clears_state_for_looping_file_sources(self):
        boxes = _FakeBoxes(xyxy=[[0, 0, 10, 10]], cls=[0.0], conf=[0.9], ids=[7])
        tracker = Tracker("cam1", _FakeDetector([boxes]))
        tracker.update(frame=None, now=0.0)
        self.assertIn("cam1:P-7", tracker._tracks)

        tracker.reset()
        self.assertEqual(tracker._tracks, {})

    def test_no_detections_returns_empty_tracks(self):
        boxes = _FakeBoxes(xyxy=[], cls=[], conf=[], ids=None)
        tracker = Tracker("cam1", _FakeDetector([boxes]))
        _, tracks = tracker.update(frame=None, now=0.0)
        self.assertEqual(tracks, [])


if __name__ == "__main__":
    unittest.main()
