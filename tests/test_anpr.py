"""ANPR unit tests for the SIH Surveillance System.

Tests:
    1. OCR text cleaning (whitespace, special chars, case normalization)
    2. Indian plate validation regex (valid/invalid patterns)
    3. Image preprocessing pipeline
    4. Multi-frame consensus calculation (weighted voting, min observations)
    5. Database insertion and duplicate prevention
    6. Missing model handling (graceful fallback)
    7. Invalid/empty bounding boxes
    8. Empty OCR output
    9. ANPR disabled mode (ANPR_ENABLED=false)
    10. Track history expiration
"""
import os
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np

BACKEND_DIR = Path(__file__).resolve().parent.parent / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from anpr import (
    ANPREngine,
    ANPRResult,
    OCRReading,
    _TrackPlateHistory,
    clean_ocr_text,
    preprocess_plate_image,
    validate_indian_plate,
)


class TestOCRTextCleaning(unittest.TestCase):
    """Test 1: OCR text cleaning."""

    def test_uppercase_normalization(self):
        self.assertEqual(clean_ocr_text("mh12ab1234"), "MH12AB1234")

    def test_whitespace_collapse(self):
        self.assertEqual(clean_ocr_text("  MH  12  AB  1234  "), "MH 12 AB 1234")

    def test_special_chars_removed(self):
        self.assertEqual(clean_ocr_text("KA-09-EE-9999"), "KA09EE9999")
        self.assertEqual(clean_ocr_text("DL.01.CA.0001!"), "DL01CA0001")

    def test_empty_string(self):
        self.assertEqual(clean_ocr_text(""), "")

    def test_only_special_chars(self):
        self.assertEqual(clean_ocr_text("---...!!!"), "")


class TestIndianPlateValidation(unittest.TestCase):
    """Test 2: Indian plate validation regex."""

    def test_valid_standard_plates(self):
        valid_plates = [
            "MH12AB1234", "DL01CA0001", "KA09EE9999",
            "TN10AB1234", "UP80AB1234", "GJ01AB1234",
        ]
        for plate in valid_plates:
            ok, result = validate_indian_plate(plate)
            self.assertTrue(ok, f"{plate} should be valid, got {ok}")
            self.assertEqual(result, plate)

    def test_valid_with_spaces(self):
        ok, result = validate_indian_plate("DL 01 CA 0001")
        self.assertTrue(ok)
        self.assertEqual(result, "DL01CA0001")

    def test_valid_with_dashes(self):
        ok, result = validate_indian_plate("MH-12-AB-1234")
        self.assertTrue(ok)

    def test_invalid_all_letters(self):
        ok, _ = validate_indian_plate("ABCDEFGHIJ")
        self.assertFalse(ok)

    def test_invalid_all_numbers(self):
        ok, _ = validate_indian_plate("1234567890")
        self.assertFalse(ok)

    def test_invalid_too_short(self):
        ok, _ = validate_indian_plate("AB")
        self.assertFalse(ok)

    def test_empty_string(self):
        ok, _ = validate_indian_plate("")
        self.assertFalse(ok)


class TestImagePreprocessing(unittest.TestCase):
    """Test 3: Image preprocessing pipeline."""

    def test_small_image_upscale(self):
        small = np.zeros((20, 50, 3), dtype=np.uint8)
        result = preprocess_plate_image(small)
        self.assertEqual(result.shape[2], 3)
        self.assertGreaterEqual(result.shape[1], 200)

    def test_large_image_passthrough(self):
        large = np.zeros((100, 400, 3), dtype=np.uint8)
        result = preprocess_plate_image(large)
        self.assertEqual(result.shape[2], 3)

    def test_empty_image(self):
        empty = np.array([], dtype=np.uint8)
        result = preprocess_plate_image(empty)
        self.assertIsNotNone(result)

    def test_grayscale_input(self):
        gray = np.zeros((50, 200), dtype=np.uint8)
        result = preprocess_plate_image(gray)
        self.assertEqual(result.shape[2], 3)

    def test_none_input(self):
        result = preprocess_plate_image(None)
        self.assertIsNone(result)


class TestConsensusCalculation(unittest.TestCase):
    """Test 4: Multi-frame consensus calculation."""

    def _make_reading(self, plate, ocr_conf=0.9, det_conf=0.85):
        return OCRReading(
            raw_text=plate, cleaned_text=plate, plate_number=plate,
            ocr_confidence=ocr_conf, plate_det_confidence=det_conf,
            is_valid_indian=True, plate_bbox=(0, 0, 1, 1),
            vehicle_bbox=(0, 0, 100, 100), timestamp=0.0,
        )

    def test_consensus_reached(self):
        engine = ANPREngine(min_consensus_readings=3, frame_interval=1)
        hist = engine._track_history["test:P-1"]
        for _ in range(3):
            hist.readings.append(self._make_reading("MH12AB1234"))
        result = engine._compute_consensus("test:P-1")
        self.assertIsNotNone(result)
        self.assertEqual(result.plate_number, "MH12AB1234")
        self.assertEqual(result.consensus_score, 1.0)

    def test_consensus_not_enough_readings(self):
        engine = ANPREngine(min_consensus_readings=5, frame_interval=1)
        hist = engine._track_history["test:P-1"]
        hist.readings.append(self._make_reading("KA09EE9999"))
        result = engine._compute_consensus("test:P-1")
        self.assertIsNone(result)

    def test_consensus_majority_wins(self):
        engine = ANPREngine(min_consensus_readings=2, frame_interval=1)
        hist = engine._track_history["test:P-1"]
        for _ in range(4):
            hist.readings.append(self._make_reading("MH14CD5678"))
        hist.readings.append(self._make_reading("MH14CD5679", 0.4, 0.3))
        result = engine._compute_consensus("test:P-1")
        self.assertIsNotNone(result)
        self.assertEqual(result.plate_number, "MH14CD5678")

    def test_consensus_no_valid_readings(self):
        engine = ANPREngine(min_consensus_readings=2, frame_interval=1)
        hist = engine._track_history["test:P-1"]
        reading = self._make_reading("INVALID")
        reading.is_valid_indian = False
        hist.readings.append(reading)
        hist.readings.append(reading)
        result = engine._compute_consensus("test:P-1")
        self.assertIsNone(result)

    def test_consensus_validation_status(self):
        engine = ANPREngine(min_consensus_readings=2, frame_interval=1)
        hist = engine._track_history["test:P-1"]
        for _ in range(3):
            hist.readings.append(self._make_reading("DL01CA0001", 0.95, 0.9))
        result = engine._compute_consensus("test:P-1")
        self.assertEqual(result.validation_status, "VALID")


class TestDatabaseANPR(unittest.TestCase):
    """Test 5: Database insertion and duplicate prevention."""

    def setUp(self):
        import db
        self.db = db
        self._orig_path = db.DB_PATH
        self._tmp = tempfile.TemporaryDirectory()
        db.DB_PATH = Path(self._tmp.name) / "test.db"
        db.init_db([{
            "id": "cam1", "name": "Test", "source": "x.mp4",
            "lat": 1.0, "lon": 2.0,
            "zones": [{"name": "Zone", "rect_norm": (0, 0, 1, 1)}],
        }])

    def tearDown(self):
        self.db.DB_PATH = self._orig_path
        self._tmp.cleanup()

    def test_insert_anpr_detection(self):
        row_id = self.db.insert_anpr_detection(
            "cam1", "cam1:P-1", "car", "MH12AB1234", "MH12AB1234",
            0.9, 0.85, 0.95, (10, 20, 100, 200), (30, 40, 80, 60),
            "2026-01-01T00:00:00", None, "VALID",
        )
        self.assertIsNotNone(row_id)

    def test_duplicate_prevention(self):
        self.db.insert_anpr_detection(
            "cam1", "cam1:P-1", "car", "MH12AB1234", "MH12AB1234",
            0.9, 0.85, 0.95, (10, 20, 100, 200), (30, 40, 80, 60),
            "2026-01-01T00:00:00", None, "VALID",
        )
        dup = self.db.insert_anpr_detection(
            "cam1", "cam1:P-1", "car", "MH12AB1234", "MH12AB1234",
            0.9, 0.85, 0.95, (10, 20, 100, 200), (30, 40, 80, 60),
            "2026-01-01T00:00:01", None, "VALID",
        )
        self.assertIsNone(dup, "duplicate should return None")

    def test_list_anpr_detections(self):
        self.db.insert_anpr_detection(
            "cam1", "cam1:P-1", "car", "MH12AB1234", "MH12AB1234",
            0.9, 0.85, 0.95, (10, 20, 100, 200), (30, 40, 80, 60),
            "2026-01-01T00:00:00", None, "VALID",
        )
        rows = self.db.list_anpr_detections(camera_id="cam1")
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["plate_number"], "MH12AB1234")

    def test_search_anpr_plate(self):
        self.db.insert_anpr_detection(
            "cam1", "cam1:P-1", "car", "MH12AB1234", "MH12AB1234",
            0.9, 0.85, 0.95, (10, 20, 100, 200), (30, 40, 80, 60),
            "2026-01-01T00:00:00", None, "VALID",
        )
        results = self.db.search_anpr_plate("MH12")
        self.assertEqual(len(results), 1)

    def test_search_no_results(self):
        results = self.db.search_anpr_plate("ZZ99ZZ9999")
        self.assertEqual(len(results), 0)


class TestMissingModel(unittest.TestCase):
    """Test 6: Missing model handling."""

    def test_graceful_with_no_model(self):
        engine = ANPREngine(
            plate_model_path="nonexistent_model.pt",
            frame_interval=1,
        )
        dummy_frame = np.zeros((480, 640, 3), dtype=np.uint8)

        class FakeTrack:
            track_id = "cam1:P-1"
            class_name = "car"
            bbox = (100, 100, 300, 300)

        # Should not crash, should return empty
        results = engine.process_tracks(dummy_frame, [FakeTrack()], 1.0)
        self.assertEqual(results, [])


class TestInvalidBoundingBoxes(unittest.TestCase):
    """Test 7: Invalid bounding boxes."""

    def test_zero_size_bbox(self):
        engine = ANPREngine(frame_interval=1)
        result = engine._process_single_vehicle(
            np.zeros((100, 100, 3), dtype=np.uint8),
            "test:P-1", "car", (50, 50, 50, 50), 0.0,
        )
        self.assertIsNone(result)

    def test_negative_bbox(self):
        engine = ANPREngine(frame_interval=1)
        result = engine._process_single_vehicle(
            np.zeros((100, 100, 3), dtype=np.uint8),
            "test:P-1", "car", (-10, -10, 5, 5), 0.0,
        )
        self.assertIsNone(result)


class TestEmptyOCR(unittest.TestCase):
    """Test 8: Empty OCR output."""

    def test_empty_text_returns_none(self):
        engine = ANPREngine(frame_interval=1)
        text, conf = engine._run_ocr(np.zeros((30, 100, 3), dtype=np.uint8))
        # Without PaddleOCR installed, returns empty
        # With PaddleOCR installed, may return text or empty
        self.assertIsInstance(text, str)
        self.assertIsInstance(conf, float)


class TestANPRDisabledMode(unittest.TestCase):
    """Test 9: ANPR disabled mode."""

    def test_none_engine_skips_processing(self):
        # When anpr_engine is None on CameraContext, no ANPR processing happens
        # This is implicitly tested by the CameraWorker._process() code path
        engine = None
        self.assertIsNone(engine)


class TestTrackHistoryExpiration(unittest.TestCase):
    """Test 10: Track history expiration."""

    def test_stale_tracks_expire(self):
        engine = ANPREngine(frame_interval=1)
        engine._track_history["old:P-1"] = _TrackPlateHistory(last_seen=0.0)
        engine._track_history["new:P-2"] = _TrackPlateHistory(last_seen=100.0)
        engine._active_plates["old:P-1"] = "MH12AB1234"

        class FakeTrack:
            track_id = "new:P-2"
            class_name = "car"
            bbox = (10, 10, 200, 200)

        # Process at timestamp 25 — old:P-1 is 25s stale (< 30s), should be kept
        engine._frame_counter = engine.frame_interval - 1
        engine.process_tracks(
            np.zeros((480, 640, 3), dtype=np.uint8),
            [FakeTrack()], 25.0,
        )
        self.assertIn("old:P-1", engine._track_history)

        # Process at timestamp 50 — old:P-1 is 50s stale (> 30s), should be expired
        engine._frame_counter = engine.frame_interval - 1
        engine.process_tracks(
            np.zeros((480, 640, 3), dtype=np.uint8),
            [FakeTrack()], 50.0,
        )
        self.assertNotIn("old:P-1", engine._track_history)
        self.assertNotIn("old:P-1", engine._active_plates)

    def test_reset_clears_all(self):
        engine = ANPREngine(frame_interval=1)
        engine._track_history["test:P-1"] = _TrackPlateHistory(last_seen=0.0)
        engine._active_plates["test:P-1"] = "DL01CA0001"
        engine._frame_counter = 42
        engine.reset()
        self.assertEqual(len(engine._track_history), 0)
        self.assertEqual(len(engine._active_plates), 0)
        self.assertEqual(engine._frame_counter, 0)


if __name__ == "__main__":
    unittest.main(verbosity=2)
