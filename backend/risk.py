"""Explainable, additive risk scoring over a track's BehaviorEvents.

No ML here on purpose: every point is a named, weighted rule so the dashboard
can show exactly why a score is what it is. This module never runs YOLO and
never sees a raw frame - it only sees BehaviorEvents that behavior.py already
derived.

Detection confidence (how sure the model is an object is a person/vehicle) and
risk score (how concerning its behavior is) are deliberately unrelated: a
99%-confidence detection standing still on a sidewalk can be LOW risk, and a
lower-confidence detection loitering in a restricted zone after hours can
still be HIGH.
"""
import config
from detector import is_vehicle
from schemas import BehaviorEvent, RiskReason, RiskResult

REASON_ZONE_INTRUSION = "RESTRICTED_ZONE_INTRUSION"
REASON_VIRTUAL_FENCE_INTRUSION = "VIRTUAL_FENCE_INTRUSION"
REASON_VIRTUAL_FENCE_PROXIMITY = "VIRTUAL_FENCE_PROXIMITY"
REASON_RESTRICTED_CAMERA_BREACH = "RESTRICTED_CAMERA_BREACH"
REASON_LOITERING = "LOITERING"
REASON_VEHICLE_IN_ZONE = "VEHICLE_IN_ZONE"
REASON_AFTER_HOURS = "AFTER_HOURS"
REASON_ERRATIC_SPEED = "ERRATIC_SPEED"
REASON_BORDER_DIRECTION = "BORDER_DIRECTION"
REASON_VEHICLE_STOPPED = "VEHICLE_STOPPED"
REASON_REPEATED_ZONE_VISITS = "REPEATED_ZONE_VISITS"
REASON_CROWD_FORMATION = "CROWD_FORMATION"

SEVERITY_LOW, SEVERITY_MEDIUM, SEVERITY_HIGH, SEVERITY_CRITICAL = "LOW", "MEDIUM", "HIGH", "CRITICAL"


def _severity(score: int) -> str:
    if score >= getattr(config, "RISK_CRITICAL_BAND", 90):
        return SEVERITY_CRITICAL
    if score >= config.RISK_HIGH_BAND:
        return SEVERITY_HIGH
    if score >= config.RISK_MEDIUM_BAND:
        return SEVERITY_MEDIUM
    return SEVERITY_LOW


class RiskEngine:
    """Stateless and pure config - safe to share a single instance across all
    cameras (unlike Tracker/BehaviorEngine, it holds no per-camera history)."""

    def evaluate(self, events: list[BehaviorEvent], object_class: str) -> RiskResult:
        types = {e.event_type for e in events}
        reasons: list[RiskReason] = []

        # Fully restricted camera breach (person detected anywhere in camera) -> DANGER (CRITICAL)
        if "RESTRICTED_CAMERA_BREACH" in types:
            pts = config.RISK_WEIGHTS.get("RESTRICTED_CAMERA_BREACH", 95)
            reasons.append(RiskReason(REASON_RESTRICTED_CAMERA_BREACH, pts, f"Restricted camera zone breach (Person detected): +{pts}"))

        # Virtual fence intrusion (person inside virtual fence) -> DANGER (CRITICAL/HIGH)
        if "VIRTUAL_FENCE_INTRUSION" in types:
            zone_name = next(e.metadata.get("zone_name", "Virtual Fence") for e in events if e.event_type == "VIRTUAL_FENCE_INTRUSION")
            pts = config.RISK_WEIGHTS.get("VIRTUAL_FENCE_INTRUSION", 90)
            reasons.append(RiskReason(REASON_VIRTUAL_FENCE_INTRUSION, pts, f"Virtual fence intrusion ({zone_name}): +{pts}"))
        elif "ZONE_INTRUSION" in types:
            zone_name = next(e.metadata.get("zone_name", "Restricted Zone") for e in events if e.event_type == "ZONE_INTRUSION")
            pts = config.RISK_WEIGHTS["RESTRICTED_ZONE_INTRUSION"]
            reasons.append(RiskReason(REASON_ZONE_INTRUSION, pts, f"Zone intrusion ({zone_name}): +{pts}"))
            if is_vehicle(object_class):
                pts = config.RISK_WEIGHTS["VEHICLE_IN_ZONE"]
                reasons.append(RiskReason(REASON_VEHICLE_IN_ZONE, pts, f"Vehicle in restricted zone: +{pts}"))

        # Near virtual fence (person in perimeter buffer zone) -> MEDIUM
        if "VIRTUAL_FENCE_PROXIMITY" in types and "VIRTUAL_FENCE_INTRUSION" not in types and "ZONE_INTRUSION" not in types:
            zone_name = next(e.metadata.get("zone_name", "Virtual Fence") for e in events if e.event_type == "VIRTUAL_FENCE_PROXIMITY")
            pts = config.RISK_WEIGHTS.get("VIRTUAL_FENCE_PROXIMITY", 45)
            reasons.append(RiskReason(REASON_VIRTUAL_FENCE_PROXIMITY, pts, f"Near virtual fence ({zone_name}): +{pts}"))


        loiter_event = next((e for e in events if e.event_type == "LOITERING"), None)
        if loiter_event:
            dwell = loiter_event.metadata.get("dwell_seconds", 0)
            if loiter_event.metadata.get("band") == "HIGH":
                pts = config.RISK_WEIGHTS["LOITERING_HIGH"]
                reasons.append(RiskReason(REASON_LOITERING, pts, f"Loitering {dwell // 60:.0f}min: +{pts}"))
            else:
                pts = config.RISK_WEIGHTS["LOITERING_MEDIUM"]
                reasons.append(RiskReason(REASON_LOITERING, pts, f"Lingering {dwell:.0f}s: +{pts}"))

        if "AFTER_HOURS" in types:
            pts = config.RISK_WEIGHTS["AFTER_HOURS"]
            reasons.append(RiskReason(REASON_AFTER_HOURS, pts, f"After-hours ({config.AFTER_HOURS_START_HOUR:02d}:00-{config.AFTER_HOURS_END_HOUR:02d}:00): +{pts}"))

        if "ERRATIC_SPEED" in types:
            pts = config.RISK_WEIGHTS["ERRATIC_SPEED"]
            reasons.append(RiskReason(REASON_ERRATIC_SPEED, pts, f"Erratic/high-speed movement: +{pts}"))

        if "MOVING_TOWARD_RESTRICTED_ZONE" in types:
            pts = config.RISK_WEIGHTS["BORDER_DIRECTION"]
            reasons.append(RiskReason(REASON_BORDER_DIRECTION, pts, f"Moving toward restricted zone: +{pts}"))

        stopped_event = next((e for e in events if e.event_type == "VEHICLE_STOPPED"), None)
        if stopped_event:
            pts = config.RISK_WEIGHTS["VEHICLE_STOPPED"]
            dwell = stopped_event.metadata.get("dwell_seconds", 0)
            reasons.append(RiskReason(REASON_VEHICLE_STOPPED, pts, f"Vehicle stationary {dwell:.0f}s: +{pts}"))

        repeated_event = next((e for e in events if e.event_type == "REPEATED_ZONE_VISITS"), None)
        if repeated_event:
            pts = config.RISK_WEIGHTS["REPEATED_ZONE_VISITS"]
            count = repeated_event.metadata.get("visit_count", 0)
            reasons.append(RiskReason(REASON_REPEATED_ZONE_VISITS, pts, f"Repeated zone visits ({count}): +{pts}"))

        crowd_event = next((e for e in events if e.event_type == "CROWD_FORMATION"), None)
        if crowd_event:
            pts = config.RISK_WEIGHTS["CROWD_FORMATION"]
            count = crowd_event.metadata.get("count", 0)
            reasons.append(RiskReason(REASON_CROWD_FORMATION, pts, f"Crowd formation ({count} people): +{pts}"))

        score = min(sum(r.points for r in reasons), 100)
        return RiskResult(score=score, severity=_severity(score), reasons=reasons)

    def cleanup_stale(self, now=None, max_idle_seconds=300):
        """Evicts tracks not seen within max_idle_seconds to prevent memory creep."""
        if now is None:
            now = time.time()
        stale_ids = [
            tid for tid, data in self._tracks.items()
            if (now - data.get("last_seen", now)) > max_idle_seconds
        ]
        for tid in stale_ids:
            self._tracks.pop(tid, None)
            self._last_band.pop(tid, None)
        return len(stale_ids)



def demo():
    """Self-check: the pitch's headline example must keep summing correctly,
    on the same numbers as before this module was rewritten around BehaviorEvents."""
    engine = RiskEngine()

    events = [
        BehaviorEvent("ZONE_INTRUSION", "cam1", "cam1:P-1", 0.0, 0.9, {"zone_name": "Restricted Zone"}),
        BehaviorEvent("LOITERING", "cam1", "cam1:P-1", 0.0, 0.9, {"dwell_seconds": 200, "band": "HIGH"}),
        BehaviorEvent("AFTER_HOURS", "cam1", "cam1:P-1", 0.0, 0.9, {}),
    ]
    result = engine.evaluate(events, "person")
    assert result.score == 80, f"expected 80, got {result.score}: {result.reasons}"
    assert result.severity == SEVERITY_HIGH

    events_maxed = [
        BehaviorEvent("ZONE_INTRUSION", "cam1", "cam1:P-2", 0.0, 0.9, {"zone_name": "Restricted Zone"}),
        BehaviorEvent("LOITERING", "cam1", "cam1:P-2", 0.0, 0.9, {"dwell_seconds": 200, "band": "HIGH"}),
        BehaviorEvent("AFTER_HOURS", "cam1", "cam1:P-2", 0.0, 0.9, {}),
        BehaviorEvent("ERRATIC_SPEED", "cam1", "cam1:P-2", 0.0, 0.9, {}),
    ]
    result2 = engine.evaluate(events_maxed, "car")
    assert result2.score == 100, f"expected clamp at 100, got {result2.score}"
    assert result2.severity == SEVERITY_CRITICAL

    result3 = engine.evaluate([], "person")
    assert result3.score == 0 and result3.reasons == [] and result3.severity == SEVERITY_LOW

    print("risk.py self-check passed")


if __name__ == "__main__":
    demo()
