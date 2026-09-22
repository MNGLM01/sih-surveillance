"""Central orchestration layer: wires detector -> tracker -> behavior -> risk
-> incident together for one frame of one camera. Contains no detection,
tracking, behavior-rule, risk-weighting or incident-lifecycle logic itself -
that all lives in the modules it calls.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from risk import RiskEngine
from schemas import BehaviorEvent, Detection, Incident, RiskResult, Track

if TYPE_CHECKING:
    from services.camera_service import CameraContext


@dataclass
class TrackResult:
    track: Track
    events: list[BehaviorEvent]
    risk: RiskResult
    incident: Incident | None
    incident_is_new: bool


@dataclass
class FrameResult:
    detections: list[Detection]
    tracks: list[Track]
    behavior_events: list[BehaviorEvent]
    track_results: list[TrackResult] = field(default_factory=list)
    ended_incidents: list[Incident] = field(default_factory=list)


def _events_for_track(events: list[BehaviorEvent], track_id: str) -> list[BehaviorEvent]:
    """A track's own events, plus any group-level event (e.g. CROWD_FORMATION)
    that named it as a member."""
    return [
        e for e in events
        if e.track_id == track_id or (e.track_id == "GROUP" and track_id in e.metadata.get("track_ids", ()))
    ]


class SurveillancePipeline:
    """Stateless itself (all per-camera memory lives on the CameraContext),
    so one pipeline instance is reused across every camera."""

    def __init__(self, risk_engine: RiskEngine | None = None):
        self.risk_engine = risk_engine or RiskEngine()

    def process_frame(self, context: "CameraContext", frame, timestamp: float) -> FrameResult:
        detections, tracks = context.tracker.update(frame, timestamp)

        frame_h, frame_w = frame.shape[:2]
        is_restricted = getattr(context, "is_restricted", False)
        behavior_events = context.behavior_engine.analyze(
            context.camera_id, tracks, timestamp, context.zones, frame_size=(frame_w, frame_h),
            is_restricted=is_restricted,
        )

        track_results = []
        for track in tracks:
            track_events = _events_for_track(behavior_events, track.track_id)
            risk_result = self.risk_engine.evaluate(track_events, track.class_name)
            incident, is_new = context.incident_manager.process(context.camera_id, track, risk_result, timestamp)
            track_results.append(TrackResult(
                track=track, events=track_events, risk=risk_result,
                incident=incident, incident_is_new=is_new,
            ))

        # Update incident manager with active track set for disappearance tracking
        ended_incidents = []
        if hasattr(context.incident_manager, "on_frame_end"):
            ended = context.incident_manager.on_frame_end(
                context.camera_id, {t.track_id for t in tracks}, timestamp
            )
            if ended:
                ended_incidents.extend(ended)

        return FrameResult(
            detections=detections,
            tracks=tracks,
            behavior_events=behavior_events,
            track_results=track_results,
            ended_incidents=ended_incidents,
        )
