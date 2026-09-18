"""Shared data contracts passed between pipeline stages.

Keeping these in one module (instead of each stage inventing its own dict
shape) is what lets detector/tracker/behavior/risk/incident stay decoupled:
each stage only needs to know the schema, not the internals of the stage
before it.
"""
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class Detection:
    bbox: tuple[float, float, float, float]  # (x1, y1, x2, y2)
    class_name: str
    confidence: float
    center: tuple[float, float]


@dataclass
class Track:
    """A persistent object identity within one camera.

    `track_id` is camera-scoped (e.g. "cam1:P-7") - never assume it is
    globally unique across cameras.
    """
    track_id: str
    raw_id: int
    class_name: str
    bbox: tuple[float, float, float, float]
    center: tuple[float, float]
    confidence: float
    first_seen: float
    last_seen: float
    positions: tuple[tuple[float, float, float], ...] = ()  # (timestamp, x, y), most recent last


@dataclass
class BehaviorEvent:
    event_type: str
    camera_id: str
    track_id: str
    timestamp: float
    confidence: float
    metadata: dict = field(default_factory=dict)


@dataclass
class RiskReason:
    type: str
    points: int
    label: str


@dataclass
class RiskResult:
    score: int
    severity: str  # LOW | MEDIUM | HIGH
    reasons: list[RiskReason] = field(default_factory=list)


class IncidentStatus:
    NEW = "NEW"
    ACKNOWLEDGED = "ACKNOWLEDGED"
    INVESTIGATING = "INVESTIGATING"
    VERIFIED = "VERIFIED"
    FALSE_POSITIVE = "FALSE_POSITIVE"
    RESOLVED = "RESOLVED"

    OPEN = {NEW, ACKNOWLEDGED, INVESTIGATING}


@dataclass
class Incident:
    incident_id: Optional[int]
    camera_id: str
    track_id: str
    object_class: str
    risk_score: int
    severity: str
    status: str
    created_at: str
    updated_at: str
    reasons: list[str] = field(default_factory=list)
    evidence_path: Optional[str] = None


@dataclass
class Zone:
    name: str
    rect_norm: tuple[float, float, float, float]  # (x1, y1, x2, y2) as fractions of frame size, 0..1

    def contains(self, point: tuple[float, float], frame_w: int, frame_h: int) -> bool:
        x1, y1, x2, y2 = self.to_pixels(frame_w, frame_h)
        x, y = point
        return x1 <= x <= x2 and y1 <= y <= y2

    def to_pixels(self, frame_w: int, frame_h: int) -> tuple[float, float, float, float]:
        nx1, ny1, nx2, ny2 = self.rect_norm
        return nx1 * frame_w, ny1 * frame_h, nx2 * frame_w, ny2 * frame_h
