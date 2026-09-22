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
        min_x, max_x = min(x1, x2), max(x1, x2)
        min_y, max_y = min(y1, y2), max(y1, y2)
        x, y = point
        return min_x <= x <= max_x and min_y <= y <= max_y

    def to_pixels(self, frame_w: int, frame_h: int) -> tuple[float, float, float, float]:
        nx1, ny1, nx2, ny2 = self.rect_norm
        return nx1 * frame_w, ny1 * frame_h, nx2 * frame_w, ny2 * frame_h

    def distance_norm_to_point(self, point: tuple[float, float], frame_w: int, frame_h: int) -> float:
        """Returns normalized Euclidean distance (0.0 if inside) from point to zone perimeter."""
        if frame_w <= 0 or frame_h <= 0:
            return 0.0
        px_norm = point[0] / frame_w
        py_norm = point[1] / frame_h
        min_x, max_x = min(self.rect_norm[0], self.rect_norm[2]), max(self.rect_norm[0], self.rect_norm[2])
        min_y, max_y = min(self.rect_norm[1], self.rect_norm[3]), max(self.rect_norm[1], self.rect_norm[3])
        dx = max(min_x - px_norm, 0.0, px_norm - max_x)
        dy = max(min_y - py_norm, 0.0, py_norm - max_y)
        return (dx * dx + dy * dy) ** 0.5

    def distance_to_point(self, point: tuple[float, float], frame_w: int, frame_h: int) -> float:
        """Returns pixel distance (0.0 if inside) from point to zone perimeter."""
        x1, y1, x2, y2 = self.to_pixels(frame_w, frame_h)
        min_x, max_x = min(x1, x2), max(x1, x2)
        min_y, max_y = min(y1, y2), max(y1, y2)
        px, py = point
        dx = max(min_x - px, 0.0, px - max_x)
        dy = max(min_y - py, 0.0, py - max_y)
        return (dx * dx + dy * dy) ** 0.5

