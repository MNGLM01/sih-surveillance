import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from detector import Detector  # noqa: E402


class _FakeArray:
    def __init__(self, data):
        self._data = data

    def tolist(self):
        return self._data


class _FakeBoxes:
    def __init__(self, xyxy, cls, conf):
        self.xyxy = _FakeArray(xyxy)
        self.cls = _FakeArray(cls)
        self.conf = _FakeArray(conf)

    def __len__(self):
        return len(self.xyxy._data)


class _FakeResults:
    def __init__(self, boxes):
        self.boxes = boxes


class TestDetector(unittest.TestCase):
    def test_to_detections_maps_fields(self):
        boxes = _FakeBoxes(xyxy=[[10, 20, 30, 40]], cls=[0.0], conf=[0.93])
        detections = Detector.to_detections(_FakeResults(boxes))
        self.assertEqual(len(detections), 1)
        d = detections[0]
        self.assertEqual(d.class_name, "person")
        self.assertAlmostEqual(d.confidence, 0.93)
        self.assertEqual(d.bbox, (10, 20, 30, 40))
        self.assertEqual(d.center, (20, 30))

    def test_confidence_is_preserved_per_detection(self):
        boxes = _FakeBoxes(xyxy=[[0, 0, 1, 1], [0, 0, 1, 1]], cls=[2.0, 7.0], conf=[0.4, 0.99])
        detections = Detector.to_detections(_FakeResults(boxes))
        self.assertEqual([d.confidence for d in detections], [0.4, 0.99])
        self.assertEqual([d.class_name for d in detections], ["car", "truck"])

    def test_no_boxes_returns_no_detections(self):
        self.assertEqual(Detector.to_detections(_FakeResults(None)), [])

    def test_empty_boxes_returns_no_detections(self):
        boxes = _FakeBoxes(xyxy=[], cls=[], conf=[])
        self.assertEqual(Detector.to_detections(_FakeResults(boxes)), [])

    def test_unknown_class_id_falls_back_to_generic_label(self):
        boxes = _FakeBoxes(xyxy=[[0, 0, 1, 1]], cls=[99.0], conf=[0.5])
        detections = Detector.to_detections(_FakeResults(boxes))
        self.assertEqual(detections[0].class_name, "object")


if __name__ == "__main__":
    unittest.main()
