import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

import config  # noqa: E402
from behavior import (  # noqa: E402
    EVENT_AFTER_HOURS,
    EVENT_LOITERING,
    EVENT_MOVING_TOWARD_ZONE,
    EVENT_ZONE_INTRUSION,
    BehaviorEngine,
)
from incident import IncidentManager  # noqa: E402
from schemas import IncidentStatus, RiskResult, Track, Zone  # noqa: E402


def _track(track_id="cam1:P-1", center=(5, 5), first_seen=0.0, last_seen=0.0, positions=()):
    return Track(
        track_id=track_id, raw_id=1, class_name="person", bbox=(0, 0, 10, 10), center=center,
        confidence=0.9, first_seen=first_seen, last_seen=last_seen, positions=positions,
    )


class TestBehaviorEngine(unittest.TestCase):
    """EVENT != INCIDENT: this covers the raw observations behavior.py derives.
    Whether they add up to something worth an operator's attention is risk.py
    and incident.py's job (see test_risk.py / TestIncidentManager below)."""

    def setUp(self):
        self.engine = BehaviorEngine()
        self.covering_zone = Zone(name="Z", rect_norm=(0.0, 0.0, 1.0, 1.0))

    def test_zone_intrusion_detected(self):
        events = self.engine.analyze("cam1", [_track()], timestamp=0.0, zones=[self.covering_zone], frame_size=(100, 100))
        self.assertIn(EVENT_ZONE_INTRUSION, {e.event_type for e in events})

    def test_no_intrusion_outside_zone(self):
        far_zone = Zone(name="Z", rect_norm=(0.9, 0.9, 1.0, 1.0))
        events = self.engine.analyze("cam1", [_track(center=(5, 5))], timestamp=0.0, zones=[far_zone], frame_size=(100, 100))
        self.assertNotIn(EVENT_ZONE_INTRUSION, {e.event_type for e in events})

    def test_loitering_high_band_past_180_seconds(self):
        track = _track(first_seen=0.0, last_seen=200.0)
        events = self.engine.analyze("cam1", [track], timestamp=200.0, zones=[], frame_size=(100, 100))
        loiter = next(e for e in events if e.event_type == EVENT_LOITERING)
        self.assertEqual(loiter.metadata["band"], "HIGH")

    def test_after_hours_forced_flag(self):
        config.FORCE_AFTER_HOURS = True
        try:
            events = self.engine.analyze("cam1", [_track()], timestamp=0.0, zones=[], frame_size=(100, 100))
            self.assertIn(EVENT_AFTER_HOURS, {e.event_type for e in events})
        finally:
            config.FORCE_AFTER_HOURS = False

    def test_movement_toward_zone(self):
        far_zone = Zone(name="Z", rect_norm=(0.9, 0.9, 1.0, 1.0))
        track = _track(center=(95, 95), positions=((0.0, 5, 5), (1.0, 95, 95)))
        events = self.engine.analyze("cam1", [track], timestamp=1.0, zones=[far_zone], frame_size=(100, 100))
        self.assertIn(EVENT_MOVING_TOWARD_ZONE, {e.event_type for e in events})


class TestIncidentManager(unittest.TestCase):
    """An incident is a correlated situation worth an operator's attention,
    deduplicated so a track staying HIGH doesn't spawn one every frame."""

    def test_duplicate_suppressed_within_cooldown(self):
        manager = IncidentManager()
        high = RiskResult(score=80, severity="HIGH", reasons=[])
        incident1, is_new1 = manager.process("cam1", _track(), high, timestamp=0.0)
        incident2, is_new2 = manager.process("cam1", _track(), high, timestamp=1.0)
        self.assertTrue(is_new1)
        self.assertFalse(is_new2)
        self.assertIs(incident1, incident2)

    def test_new_incident_after_cooldown_expires(self):
        manager = IncidentManager()
        high = RiskResult(score=80, severity="HIGH", reasons=[])
        manager.process("cam1", _track(), high, timestamp=0.0)
        _, is_new = manager.process("cam1", _track(), high, timestamp=config.INCIDENT_COOLDOWN_SECONDS + 1)
        self.assertTrue(is_new)

    def test_low_risk_produces_no_incident(self):
        manager = IncidentManager()
        low = RiskResult(score=10, severity="LOW", reasons=[])
        incident, is_new = manager.process("cam1", _track(), low, timestamp=0.0)
        self.assertIsNone(incident)
        self.assertFalse(is_new)

    def test_incident_status_can_change(self):
        manager = IncidentManager()
        high = RiskResult(score=80, severity="HIGH", reasons=[])
        incident, _ = manager.process("cam1", _track(), high, timestamp=0.0)
        self.assertEqual(incident.status, IncidentStatus.NEW)
        incident.status = IncidentStatus.ACKNOWLEDGED
        self.assertEqual(incident.status, IncidentStatus.ACKNOWLEDGED)


if __name__ == "__main__":
    unittest.main()
