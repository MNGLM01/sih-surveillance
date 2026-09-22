"""Incident lifecycle only: correlated security situations, not raw observations.

EVENT ("person entered restricted zone") != INCIDENT ("zone intrusion +
loitering + after-hours = HIGH-risk situation an operator should look at").
A track producing a HIGH risk score every frame while it stays HIGH must not
spawn a new incident every frame - this module's whole job is that dedup.
"""
from __future__ import annotations

import datetime
from dataclasses import dataclass
from typing import TYPE_CHECKING

import config
from schemas import Incident, IncidentStatus, RiskResult, Track


@dataclass
class _TrackIncidentState:
    incident: Incident
    primary_type: str
    first_seen: float
    last_high_time: float
    last_frame_time: float
    is_active: bool
    ended_at: float | None = None


class IncidentManager:
    """One instance per camera; `_states` is per-camera state,
    isolated the same way Tracker/BehaviorEngine state is."""

    def __init__(self):
        # Key: (camera_id, track_id) -> _TrackIncidentState
        self._states: dict[tuple[str, str], _TrackIncidentState] = {}

    def process(
        self,
        camera_id: str,
        track: Track,
        risk_result: RiskResult,
        timestamp: float,
    ) -> tuple[Incident | None, bool]:
        """Processes a track's risk evaluation.
        Returns (incident, is_new).
        - incident is None when nothing worth recording is happening (LOW/MEDIUM).
        - is_new is True only when a genuinely new security incident is opened.
        - is_new is False when an ongoing situation updates an existing active incident.
        """
        key = (camera_id, track.track_id)
        state = self._states.get(key)
        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

        # Handle transition to LOW risk (e.g. subject exited restricted fence or danger zone)
        if risk_result.severity == "LOW":
            if state is not None and state.is_active:
                # Situation transitioned to inactive: emit update with LOW severity so frontend turns off siren
                state.is_active = False
                state.ended_at = timestamp
                state.incident.risk_score = risk_result.score
                state.incident.severity = "LOW"
                state.incident.updated_at = now_iso
                return state.incident, False
            return None, False

        # --- Severity is MEDIUM, HIGH, or CRITICAL ---
        reasons = [r.label for r in risk_result.reasons]
        primary_type = risk_result.reasons[0].type if risk_result.reasons else "RISK_ALERT"

        # Check if we have an existing incident for this camera + track
        if state is not None:
            # Handle timestamp rewind (e.g. video file loop)
            if timestamp < state.last_high_time - 1.0:
                # Video looped backwards; start fresh
                state = None
            else:
                elapsed_since_last_frame = timestamp - state.last_frame_time
                time_since_ended = (timestamp - state.ended_at) if state.ended_at is not None else elapsed_since_last_frame

                # 1. Continuous active incident: object is still present and at HIGH risk.
                #    As long as the track is continuously seen within the cooldown window,
                #    it updates the existing incident and does NOT create a duplicate every 30s.
                #    If it was absent/unseen for > cooldown window, it is treated as a new return.
                if (
                    state.is_active
                    and elapsed_since_last_frame <= config.INCIDENT_COOLDOWN_SECONDS
                    and state.incident.status not in (IncidentStatus.RESOLVED, IncidentStatus.FALSE_POSITIVE)
                ):
                    state.incident.risk_score = risk_result.score
                    state.incident.severity = risk_result.severity
                    state.incident.reasons = reasons
                    state.incident.updated_at = now_iso
                    state.last_high_time = timestamp
                    state.last_frame_time = timestamp
                    return state.incident, False

                # 2. Resumed incident: was briefly non-HIGH or occluded, but returned within cooldown window
                #    and previous incident was not manually resolved/marked false positive
                if (
                    not state.is_active
                    and time_since_ended < config.INCIDENT_COOLDOWN_SECONDS
                    and state.incident.status not in (IncidentStatus.RESOLVED, IncidentStatus.FALSE_POSITIVE)
                ):
                    state.is_active = True
                    state.ended_at = None
                    state.incident.risk_score = risk_result.score
                    state.incident.severity = risk_result.severity
                    state.incident.reasons = reasons
                    state.incident.updated_at = now_iso
                    state.last_high_time = timestamp
                    state.last_frame_time = timestamp
                    return state.incident, False

                # 3. Cooldown has elapsed since the previous incident ended,
                #    OR the previous incident was resolved -> allow a genuinely new incident.

        # Open a brand new incident
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

        self._states[key] = _TrackIncidentState(
            incident=incident,
            primary_type=primary_type,
            first_seen=timestamp,
            last_high_time=timestamp,
            last_frame_time=timestamp,
            is_active=True,
            ended_at=None,
        )

        return incident, True

    def on_frame_end(self, camera_id: str, active_track_ids: set[str], timestamp: float) -> list[Incident]:
        """Notifies the manager of which tracks were present in the frame.
        Tracks that disappeared transition from active to ended state.
        Returns list of ended incidents with LOW severity so alerts/sound shut off."""
        ended_list: list[Incident] = []
        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
        for (cam, tid), state in self._states.items():
            if cam == camera_id and state.is_active and tid not in active_track_ids:
                state.is_active = False
                state.ended_at = timestamp
                state.incident.risk_score = 0
                state.incident.severity = "LOW"
                state.incident.updated_at = now_iso
                ended_list.append(state.incident)
        return ended_list

    def set_persisted_id(self, track_id: str, incident_id: int, camera_id: str | None = None):
        """Wires the DB-assigned id back into the in-memory incident so a
        cooldown-window update writes to the same row instead of a new one."""
        for (cam, tid), state in self._states.items():
            if tid == track_id and (camera_id is None or cam == camera_id):
                state.incident.incident_id = incident_id

    def set_evidence_path(self, track_id: str, evidence_path: str, camera_id: str | None = None):
        for (cam, tid), state in self._states.items():
            if tid == track_id and (camera_id is None or cam == camera_id):
                state.incident.evidence_path = evidence_path

    def reset(self):
        """Clears all in-memory incident tracking (e.g. when video loops or camera resets)."""
        self._states.clear()

    def cleanup_stale(self, now: float, max_idle_seconds: float = 300.0) -> int:
        """Evicts ended incidents where track has been absent for > max_idle_seconds."""
        to_remove = []
        for key, state in self._states.items():
            if not state.is_active and state.ended_at is not None:
                if (now - state.ended_at) > max_idle_seconds:
                    to_remove.append(key)
        for key in to_remove:
            del self._states[key]
        return len(to_remove)


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

    incident_res, is_new_res = manager.process("cam1", track, low, timestamp=2000.0)
    assert not is_new_res and incident_res is not None and incident_res.severity == "LOW", "transition to low must emit update"

    incident_none, is_new_none = manager.process("cam1", track, low, timestamp=2001.0)
    assert incident_none is None and not is_new_none, "subsequent low frames must return None"

    print("incident.py self-check passed")


if __name__ == "__main__":
    demo()
