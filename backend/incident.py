"""Incident lifecycle only: correlated security situations, not raw observations.

EVENT ("person entered restricted zone") != INCIDENT ("zone intrusion +
loitering + after-hours = HIGH-risk situation an operator should look at").
A track producing a HIGH risk score every frame while it stays HIGH must not
spawn a new incident every frame - this module's whole job is that dedup.
"""
import datetime

import config
from schemas import Incident, IncidentStatus, RiskResult, Track


class IncidentManager:
    """One instance per camera; `_open`/`_last_update` are per-camera state,
    isolated the same way Tracker/BehaviorEngine state is."""

    def __init__(self):
        self._open: dict[str, Incident] = {}  # track_id -> most recent incident
        self._last_update: dict[str, float] = {}  # track_id -> timestamp of last HIGH crossing

    def process(self, camera_id: str, track: Track, risk_result: RiskResult, timestamp: float) -> tuple[Incident | None, bool]:
        """Returns (incident, is_new). incident is None when nothing worth
        recording is happening for this track right now."""
        if risk_result.severity != "HIGH":
            return None, False

        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
        reasons = [r.label for r in risk_result.reasons]

        existing = self._open.get(track.track_id)
        last_update = self._last_update.get(track.track_id)
        within_cooldown = existing is not None and last_update is not None and \
            (timestamp - last_update) < config.INCIDENT_COOLDOWN_SECONDS

        if within_cooldown:
            existing.risk_score = risk_result.score
            existing.reasons = reasons
            existing.updated_at = now_iso
            self._last_update[track.track_id] = timestamp
            return existing, False

        incident = Incident(
            incident_id=None,
            camera_id=camera_id,
            track_id=track.track_id,
            object_class=track.class_name,
            risk_score=risk_result.score,
            severity=risk_result.severity,
            status=IncidentStatus.NEW,
            created_at=now_iso,
            updated_at=now_iso,
            reasons=reasons,
        )
        self._open[track.track_id] = incident
        self._last_update[track.track_id] = timestamp
        return incident, True

    def set_persisted_id(self, track_id: str, incident_id: int):
        """Wires the DB-assigned id back into the in-memory incident so a
        cooldown-window update writes to the same row instead of a new one."""
        incident = self._open.get(track_id)
        if incident is not None:
            incident.incident_id = incident_id

    def set_evidence_path(self, track_id: str, evidence_path: str):
        incident = self._open.get(track_id)
        if incident is not None:
            incident.evidence_path = evidence_path


def demo():
    """Self-check: repeated HIGH frames within the cooldown window update the
    same incident; a gap past the cooldown starts a new one."""
    manager = IncidentManager()
    track = Track(
        track_id="cam1:P-1", raw_id=1, class_name="person",
        bbox=(0, 0, 1, 1), center=(0, 0), confidence=0.9,
        first_seen=0.0, last_seen=0.0,
    )
    high = RiskResult(score=80, severity="HIGH", reasons=[])
    low = RiskResult(score=10, severity="LOW", reasons=[])

    incident1, is_new1 = manager.process("cam1", track, high, timestamp=1000.0)
    assert is_new1 and incident1.incident_id is None
    manager.set_persisted_id("cam1:P-1", incident_id=42)

    incident2, is_new2 = manager.process("cam1", track, high, timestamp=1005.0)
    assert not is_new2 and incident2.incident_id == 42, "within cooldown must update, not recreate"

    incident3, is_new3 = manager.process("cam1", track, high, timestamp=1005.0 + config.INCIDENT_COOLDOWN_SECONDS + 1)
    assert is_new3 and incident3.incident_id is None, "past cooldown must start a fresh incident"

    incident_none, is_new_none = manager.process("cam1", track, low, timestamp=2000.0)
    assert incident_none is None and not is_new_none

    print("incident.py self-check passed")


if __name__ == "__main__":
    demo()
