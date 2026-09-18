import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from risk import RiskEngine  # noqa: E402
from schemas import BehaviorEvent  # noqa: E402


def _event(event_type, track_id="cam1:P-1", confidence=0.9, metadata=None):
    return BehaviorEvent(event_type, "cam1", track_id, 0.0, confidence, metadata or {})


class TestRiskEngine(unittest.TestCase):
    def setUp(self):
        self.engine = RiskEngine()

    def test_weighted_reasons_worked_example(self):
        """The PRD's headline example: zone intrusion + after-hours = 55, HIGH."""
        events = [_event("ZONE_INTRUSION", metadata={"zone_name": "Main Gate"}), _event("AFTER_HOURS")]
        result = self.engine.evaluate(events, "person")
        self.assertEqual(result.score, 55)
        self.assertEqual(result.severity, "HIGH")
        self.assertEqual({r.type for r in result.reasons}, {"RESTRICTED_ZONE_INTRUSION", "AFTER_HOURS"})

    def test_score_capped_at_100(self):
        events = [
            _event("ZONE_INTRUSION", metadata={"zone_name": "Z"}),
            _event("LOITERING", metadata={"dwell_seconds": 200, "band": "HIGH"}),
            _event("AFTER_HOURS"),
            _event("ERRATIC_SPEED"),
            _event("VEHICLE_STOPPED", metadata={"dwell_seconds": 30}),
            _event("REPEATED_ZONE_VISITS", metadata={"visit_count": 3}),
        ]
        result = self.engine.evaluate(events, "car")
        self.assertEqual(result.score, 100)

    def test_detection_confidence_is_independent_of_risk_score(self):
        """A low-confidence detection and a near-certain one produce the same
        risk score for the same behavior - confidence and risk are separate axes."""
        low_conf = [_event("ZONE_INTRUSION", confidence=0.05, metadata={"zone_name": "Z"})]
        high_conf = [_event("ZONE_INTRUSION", confidence=0.99, metadata={"zone_name": "Z"})]
        self.assertEqual(
            self.engine.evaluate(low_conf, "person").score,
            self.engine.evaluate(high_conf, "person").score,
        )

    def test_no_events_is_zero_and_low(self):
        result = self.engine.evaluate([], "person")
        self.assertEqual(result.score, 0)
        self.assertEqual(result.severity, "LOW")
        self.assertEqual(result.reasons, [])

    def test_vehicle_in_zone_adds_on_top_of_zone_intrusion(self):
        events = [_event("ZONE_INTRUSION", metadata={"zone_name": "Z"})]
        person_result = self.engine.evaluate(events, "person")
        car_result = self.engine.evaluate(events, "car")
        self.assertGreater(car_result.score, person_result.score)
        self.assertIn("VEHICLE_IN_ZONE", {r.type for r in car_result.reasons})


if __name__ == "__main__":
    unittest.main()
