"""Behavior analysis only: tracks + zones -> BehaviorEvents.

Rule-based on purpose (see risk.py) - no CV here, no risk weighting here.
Each BehaviorEvent is a raw observation ("this track is doing X right now");
risk.py decides how much that matters, incident.py decides whether it's
worth an operator's attention.
"""
import math
import time
from dataclasses import dataclass

import config
from detector import is_vehicle
from schemas import BehaviorEvent, Track, Zone

EVENT_ZONE_INTRUSION = "ZONE_INTRUSION"
EVENT_LOITERING = "LOITERING"
EVENT_AFTER_HOURS = "AFTER_HOURS"
EVENT_MOVING_TOWARD_ZONE = "MOVING_TOWARD_RESTRICTED_ZONE"
EVENT_MOVING_AWAY = "MOVING_AWAY"
EVENT_ERRATIC_SPEED = "ERRATIC_SPEED"
EVENT_VEHICLE_STOPPED = "VEHICLE_STOPPED"
EVENT_REPEATED_ZONE_VISITS = "REPEATED_ZONE_VISITS"
EVENT_CROWD_FORMATION = "CROWD_FORMATION"


def is_after_hours(force: bool = False, now_hour: int | None = None) -> bool:
    if force:
        return True
    hour = now_hour if now_hour is not None else time.localtime().tm_hour
    return hour >= config.AFTER_HOURS_START_HOUR or hour < config.AFTER_HOURS_END_HOUR


@dataclass
class _TrackBehaviorState:
    was_in_zone: bool = False
    zone_visit_count: int = 0


class BehaviorEngine:
    """One instance per camera; `_state` is that camera's own history and is
    never shared with another camera's engine."""

    def __init__(self):
        self._state: dict[str, _TrackBehaviorState] = {}

    def analyze(
        self,
        camera_id: str,
        tracks: list[Track],
        timestamp: float,
        zones: list[Zone],
        frame_size: tuple[int, int],
    ) -> list[BehaviorEvent]:
        events: list[BehaviorEvent] = []
        frame_w, frame_h = frame_size
        after_hours = is_after_hours(config.FORCE_AFTER_HOURS)

        if after_hours:
            for track in tracks:
                events.append(self._event(EVENT_AFTER_HOURS, camera_id, track, timestamp))

        for track in tracks:
            state = self._state.setdefault(track.track_id, _TrackBehaviorState())
            events.extend(self._zone_events(camera_id, track, state, zones, frame_w, frame_h, timestamp))
            events.extend(self._loitering_events(camera_id, track, timestamp))
            events.extend(self._direction_events(camera_id, track, zones, frame_w, frame_h, timestamp))
            events.extend(self._erratic_speed_events(camera_id, track, timestamp))
            events.extend(self._vehicle_stopped_events(camera_id, track, timestamp))

        events.extend(self._crowd_events(camera_id, tracks, timestamp))
        return events

    def _zone_events(self, camera_id, track, state, zones, frame_w, frame_h, timestamp):
        events = []
        in_zone, zone_name = False, None
        for zone in zones:
            if zone.contains(track.center, frame_w, frame_h):
                in_zone, zone_name = True, zone.name
                break

        if in_zone:
            events.append(self._event(EVENT_ZONE_INTRUSION, camera_id, track, timestamp, metadata={"zone_name": zone_name}))
            if not state.was_in_zone:
                state.zone_visit_count += 1
                if state.zone_visit_count >= config.REPEATED_VISITS_THRESHOLD:
                    events.append(self._event(
                        EVENT_REPEATED_ZONE_VISITS, camera_id, track, timestamp,
                        metadata={"zone_name": zone_name, "visit_count": state.zone_visit_count},
                    ))
        state.was_in_zone = in_zone
        return events

    def _loitering_events(self, camera_id, track, timestamp):
        dwell = track.last_seen - track.first_seen
        if dwell > config.LOITER_HIGH_SECONDS:
            return [self._event(EVENT_LOITERING, camera_id, track, timestamp, metadata={"dwell_seconds": dwell, "band": "HIGH"})]
        if dwell > config.LOITER_MED_SECONDS:
            return [self._event(EVENT_LOITERING, camera_id, track, timestamp, metadata={"dwell_seconds": dwell, "band": "MEDIUM"})]
        return []

    def _direction_events(self, camera_id, track, zones, frame_w, frame_h, timestamp):
        if len(track.positions) < 2 or not zones:
            return []
        _, x1, y1 = track.positions[0]
        _, x2, y2 = track.positions[-1]

        def nearest_zone_distance(x, y):
            centers = [
                ((z.to_pixels(frame_w, frame_h)[0] + z.to_pixels(frame_w, frame_h)[2]) / 2,
                 (z.to_pixels(frame_w, frame_h)[1] + z.to_pixels(frame_w, frame_h)[3]) / 2)
                for z in zones
            ]
            return min(math.hypot(x - cx, y - cy) for cx, cy in centers)

        before = nearest_zone_distance(x1, y1)
        after = nearest_zone_distance(x2, y2)
        if after < before - 1:  # small deadband against jitter
            return [self._event(EVENT_MOVING_TOWARD_ZONE, camera_id, track, timestamp)]
        if after > before + 1:
            return [self._event(EVENT_MOVING_AWAY, camera_id, track, timestamp)]
        return []

    def _erratic_speed_events(self, camera_id, track, timestamp):
        positions = track.positions
        if len(positions) < 4:
            return []
        deltas = [
            math.hypot(x2 - x1, y2 - y1)
            for (_, x1, y1), (_, x2, y2) in zip(positions, positions[1:])
        ]
        mean = sum(deltas) / len(deltas)
        stdev = math.sqrt(sum((d - mean) ** 2 for d in deltas) / len(deltas))
        if stdev > config.ERRATIC_SPEED_THRESHOLD:
            return [self._event(EVENT_ERRATIC_SPEED, camera_id, track, timestamp)]
        return []

    def _vehicle_stopped_events(self, camera_id, track, timestamp):
        if not is_vehicle(track.class_name):
            return []
        dwell = track.last_seen - track.first_seen
        positions = track.positions
        if dwell < config.VEHICLE_STOPPED_SECONDS or len(positions) < 4:
            return []
        deltas = [
            math.hypot(x2 - x1, y2 - y1)
            for (_, x1, y1), (_, x2, y2) in zip(positions, positions[1:])
        ]
        avg_speed = sum(deltas) / len(deltas)
        if avg_speed < config.VEHICLE_STOPPED_SPEED_PX:
            return [self._event(EVENT_VEHICLE_STOPPED, camera_id, track, timestamp, metadata={"dwell_seconds": dwell})]
        return []

    def _crowd_events(self, camera_id, tracks, timestamp):
        # ponytail: O(n^2) pairwise scan - fine at demo scale (a few dozen
        # tracks/camera); switch to a spatial grid/KD-tree if a camera
        # regularly tracks hundreds of people at once.
        people = [t for t in tracks if t.class_name == "person"]
        for track in people:
            nearby = [
                other for other in people
                if other.track_id != track.track_id
                and math.hypot(track.center[0] - other.center[0], track.center[1] - other.center[1]) <= config.CROWD_RADIUS_PX
            ]
            if len(nearby) + 1 >= config.CROWD_MIN_COUNT:
                group_ids = sorted({track.track_id, *(o.track_id for o in nearby)})
                return [BehaviorEvent(
                    event_type=EVENT_CROWD_FORMATION,
                    camera_id=camera_id,
                    track_id="GROUP",
                    timestamp=timestamp,
                    confidence=1.0,
                    metadata={"track_ids": group_ids, "count": len(group_ids)},
                )]
        return []

    @staticmethod
    def _event(event_type, camera_id, track: Track, timestamp, metadata=None) -> BehaviorEvent:
        return BehaviorEvent(
            event_type=event_type,
            camera_id=camera_id,
            track_id=track.track_id,
            timestamp=timestamp,
            confidence=track.confidence,
            metadata=metadata or {},
        )


def demo():
    """Self-check: a stationary track inside a zone for >180s produces
    ZONE_INTRUSION + LOITERING(HIGH); after-hours adds AFTER_HOURS for every track."""
    zone = Zone(name="Test Zone", rect_norm=(0.0, 0.0, 1.0, 1.0))
    track = Track(
        track_id="cam1:P-1", raw_id=1, class_name="person",
        bbox=(0, 0, 10, 10), center=(5, 5), confidence=0.9,
        first_seen=0.0, last_seen=200.0,
        positions=((0.0, 5, 5), (200.0, 5, 5)),
    )
    engine = BehaviorEngine()
    events = engine.analyze("cam1", [track], timestamp=200.0, zones=[zone], frame_size=(100, 100))
    types = {e.event_type for e in events}
    assert EVENT_ZONE_INTRUSION in types
    assert EVENT_LOITERING in types
    assert is_after_hours(force=True)
    assert not is_after_hours(force=False, now_hour=12)
    assert is_after_hours(force=False, now_hour=23)
    print("behavior.py self-check passed")


if __name__ == "__main__":
    demo()
