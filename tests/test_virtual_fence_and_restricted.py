"""Tests for Virtual Fence Intrusion, Proximity, and Restricted Camera Mode."""
import sys
import unittest
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import config
import db
from behavior import (
    EVENT_RESTRICTED_CAMERA_BREACH,
    EVENT_VIRTUAL_FENCE_INTRUSION,
    EVENT_VIRTUAL_FENCE_PROXIMITY,
    BehaviorEngine,
)
from risk import (
    REASON_RESTRICTED_CAMERA_BREACH,
    REASON_VIRTUAL_FENCE_INTRUSION,
    REASON_VIRTUAL_FENCE_PROXIMITY,
    RiskEngine,
    SEVERITY_CRITICAL,
    SEVERITY_LOW,
    SEVERITY_MEDIUM,
)
from schemas import RiskResult, Track, Zone


def _make_track(track_id="cam1:P-1", class_name="person", center=(50, 50)):
    return Track(
        track_id=track_id,
        raw_id=1,
        class_name=class_name,
        bbox=(center[0] - 10, center[1] - 20, center[0] + 10, center[1] + 20),
        center=center,
        confidence=0.9,
        first_seen=0.0,
        last_seen=0.0,
    )


class TestVirtualFenceAndRestricted(unittest.TestCase):
    def setUp(self):
        self.risk_engine = RiskEngine()
        self.behavior_engine = BehaviorEngine()
        # Zone covers (0.30, 0.30) to (0.70, 0.70) in normalized space
        # In a 1000x1000 frame, this is (300, 300) to (700, 700)
        self.zone = Zone(name="Virtual Fence 1", rect_norm=(0.30, 0.30, 0.70, 0.70))

    def test_person_inside_virtual_fence_triggers_danger(self):
        """Person inside virtual fence -> VIRTUAL_FENCE_INTRUSION -> score 90 -> DANGER (CRITICAL)."""
        track = _make_track(center=(500, 500), class_name="person")  # inside zone
        events = self.behavior_engine.analyze(
            "cam1", [track], timestamp=10.0, zones=[self.zone], frame_size=(1000, 1000),
        )
        event_types = {e.event_type for e in events}
        self.assertIn(EVENT_VIRTUAL_FENCE_INTRUSION, event_types)

        result = self.risk_engine.evaluate(events, "person")
        self.assertGreaterEqual(result.score, 90)
        self.assertEqual(result.severity, SEVERITY_CRITICAL)
        reasons_dict = {r.type: r.points for r in result.reasons}
        self.assertEqual(reasons_dict.get(REASON_VIRTUAL_FENCE_INTRUSION), 90)

    def test_person_near_virtual_fence_triggers_medium_risk(self):
        """Person near virtual fence (within buffer 0.08, e.g. at x=250, distance=50px=0.05) -> MEDIUM (score 45)."""
        # Distance to left edge x=300 is 50px (0.05 normalized <= 0.08 buffer)
        track = _make_track(center=(250, 500), class_name="person")  # outside, but near
        events = self.behavior_engine.analyze(
            "cam1", [track], timestamp=10.0, zones=[self.zone], frame_size=(1000, 1000),
        )
        event_types = {e.event_type for e in events}
        self.assertIn(EVENT_VIRTUAL_FENCE_PROXIMITY, event_types)
        self.assertNotIn(EVENT_VIRTUAL_FENCE_INTRUSION, event_types)

        result = self.risk_engine.evaluate(events, "person")
        self.assertEqual(result.score, 45)
        self.assertEqual(result.severity, SEVERITY_MEDIUM)
        reasons_dict = {r.type: r.points for r in result.reasons}
        self.assertEqual(reasons_dict.get(REASON_VIRTUAL_FENCE_PROXIMITY), 45)

    def test_person_far_outside_virtual_fence_triggers_low_risk(self):
        """Person far outside virtual fence (x=50, distance=250px=0.25 > 0.08 buffer) -> score 0 -> LOW."""
        track = _make_track(center=(50, 500), class_name="person")  # far outside
        events = self.behavior_engine.analyze(
            "cam1", [track], timestamp=10.0, zones=[self.zone], frame_size=(1000, 1000),
        )
        event_types = {e.event_type for e in events}
        self.assertNotIn(EVENT_VIRTUAL_FENCE_INTRUSION, event_types)
        self.assertNotIn(EVENT_VIRTUAL_FENCE_PROXIMITY, event_types)

        result = self.risk_engine.evaluate(events, "person")
        self.assertEqual(result.score, 0)
        self.assertEqual(result.severity, SEVERITY_LOW)

    def test_camera_in_fully_restricted_mode_triggers_danger_on_any_person(self):
        """When camera is fully restricted, any person anywhere in the frame -> RESTRICTED_CAMERA_BREACH -> score 95 -> DANGER (CRITICAL)."""
        track = _make_track(center=(50, 50), class_name="person")  # anywhere in frame, outside all zones
        events = self.behavior_engine.analyze(
            "cam1", [track], timestamp=10.0, zones=[self.zone], frame_size=(1000, 1000),
            is_restricted=True,
        )
        event_types = {e.event_type for e in events}
        self.assertIn(EVENT_RESTRICTED_CAMERA_BREACH, event_types)

        result = self.risk_engine.evaluate(events, "person")
        self.assertGreaterEqual(result.score, 95)
        self.assertEqual(result.severity, SEVERITY_CRITICAL)
        reasons_dict = {r.type: r.points for r in result.reasons}
        self.assertEqual(reasons_dict.get(REASON_RESTRICTED_CAMERA_BREACH), 95)

    def test_camera_not_restricted_does_not_trigger_restricted_breach(self):
        """When camera is not restricted, person outside zones does not trigger restricted breach."""
        track = _make_track(center=(50, 50), class_name="person")
        events = self.behavior_engine.analyze(
            "cam1", [track], timestamp=10.0, zones=[self.zone], frame_size=(1000, 1000),
            is_restricted=False,
        )
        event_types = {e.event_type for e in events}
        self.assertNotIn(EVENT_RESTRICTED_CAMERA_BREACH, event_types)

    def test_virtual_fence_persists_across_server_restarts(self):
        """Tests that user-configured virtual fences persist when server restarts (db.init_db)."""
        import tempfile
        orig_db = db.DB_PATH
        temp_dir = tempfile.TemporaryDirectory()
        db.DB_PATH = Path(temp_dir.name) / "test_persist.db"
        try:
            cam_id = "test_persist_cam"
            initial_cam = {"id": cam_id, "name": "Persist Cam", "source": "0", "lat": 0, "lon": 0, "zones": []}
            db.init_db([initial_cam])

            # User saves a custom virtual fence
            custom_zones = [{"name": "Custom Fence A", "rect_norm": [0.2, 0.2, 0.7, 0.7]}]
            db.update_camera_zones(cam_id, custom_zones)

            # Server shuts down and restarts: db.init_db is called again with config
            db.init_db([initial_cam])

            # Verify the custom virtual fence was NOT wiped out
            loaded_zones = db.get_camera_zones(cam_id)
            self.assertIsNotNone(loaded_zones)
            self.assertEqual(len(loaded_zones), 1)
            self.assertEqual(loaded_zones[0]["name"], "Custom Fence A")
            self.assertEqual(loaded_zones[0]["rect_norm"], [0.2, 0.2, 0.7, 0.7])
        finally:
            db.DB_PATH = orig_db
            temp_dir.cleanup()

    def test_person_leaves_fence_emits_low_severity(self):
        """When a person leaves the virtual fence, manager emits LOW severity so alarm sound turns off."""
        from incident import IncidentManager
        manager = IncidentManager()
        track = _make_track(center=(500, 500), class_name="person")
        high_risk = RiskResult(score=90, severity="CRITICAL", reasons=[])
        low_risk = RiskResult(score=10, severity="LOW", reasons=[])

        # Intrusion opens incident
        inc1, is_new1 = manager.process("cam1", track, high_risk, timestamp=10.0)
        self.assertTrue(is_new1)
        self.assertEqual(inc1.severity, "CRITICAL")

        # Person leaves virtual fence -> risk drops to LOW
        inc2, is_new2 = manager.process("cam1", track, low_risk, timestamp=12.0)
        self.assertFalse(is_new2)
        self.assertIsNotNone(inc2)
        self.assertEqual(inc2.severity, "LOW")

    def test_person_disappears_frame_end_emits_low_severity(self):
        """When a person disappears from frame, on_frame_end emits ended incident with LOW severity."""
        from incident import IncidentManager
        manager = IncidentManager()
        track = _make_track(center=(500, 500), class_name="person")
        high_risk = RiskResult(score=90, severity="CRITICAL", reasons=[])

        manager.process("cam1", track, high_risk, timestamp=10.0)

        # Frame ends with empty track set (person left camera)
        ended = manager.on_frame_end("cam1", set(), timestamp=11.0)
        self.assertEqual(len(ended), 1)
        self.assertEqual(ended[0].severity, "LOW")


if __name__ == "__main__":
    unittest.main()
