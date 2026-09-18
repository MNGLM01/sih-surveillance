"""Explainable, additive risk scoring built directly on the tracker's per-ID history.

No ML here on purpose: every point is a named, weighted rule so the dashboard
can show exactly why a score is what it is.
"""
import os
import statistics
import time
from collections import deque

LOITER_HIGH_S = 180
LOITER_MED_S = 60
AFTER_HOURS_START, AFTER_HOURS_END = 22, 6
ERRATIC_SPEED_THRESHOLD = 40  # px/frame stdev, tuned for ~720p @ 12-30fps
# ponytail: fixed weights/threshold are a starting calibration, not physics -
# override per demo footage/camera angle without editing source.
# 50 (not 60) because real-footage testing showed zone-intrusion + after-hours
# (40+15=55) is already a genuinely serious signal that should page an operator.
HIGH_BAND = int(os.environ.get("RISK_HIGH_BAND", 50))


def in_zone(point, zone_rect):
    x, y = point
    x1, y1, x2, y2 = zone_rect
    return x1 <= x <= x2 and y1 <= y <= y2


def is_after_hours(force=False):
    if force:
        return True
    hour = time.localtime().tm_hour
    return hour >= AFTER_HOURS_START or hour < AFTER_HOURS_END


def compute_risk(signals: dict) -> tuple[int, list[str]]:
    score = 0
    breakdown = []

    if signals["zone_intrusion"]:
        score += 40
        breakdown.append(f"Zone intrusion ({signals['zone_name']}): +40")

    if signals["loiter_seconds"] > LOITER_HIGH_S:
        score += 25
        breakdown.append(f"Loitering {signals['loiter_seconds'] // 60:.0f}min: +25")
    elif signals["loiter_seconds"] > LOITER_MED_S:
        score += 10
        breakdown.append(f"Lingering {signals['loiter_seconds']:.0f}s: +10")

    if signals["object_class"] == "vehicle" and signals["zone_intrusion"]:
        score += 10
        breakdown.append("Vehicle in restricted zone: +10")

    if signals["is_after_hours"]:
        score += 15
        breakdown.append("After-hours (22:00-06:00): +15")

    if signals["erratic_speed"]:
        score += 10
        breakdown.append("Erratic/high-speed movement: +10")

    return min(score, 100), breakdown


class TrackHistory:
    """Per-track_id state: when first seen, recent positions, current class."""

    def __init__(self):
        self._tracks = {}  # track_id -> dict
        self._last_band = {}  # track_id -> "LOW" | "MEDIUM" | "HIGH"

    def update(self, track_id, cls_name, position, now=None):
        """`now` should be video-time (frame_idx / fps) for file sources, so loitering
        reflects how long the subject appears in the footage, not CPU processing speed.
        Defaults to wall-clock for live sources (webcam/RTSP) where that's already true."""
        if now is None:
            now = time.time()
        t = self._tracks.setdefault(
            track_id,
            {"first_seen": now, "class": cls_name, "positions": deque(maxlen=30)},
        )
        t["class"] = cls_name
        t["last_seen"] = now
        t["positions"].append((now, *position))

    def has_track(self, track_id):
        return track_id in self._tracks

    def loiter_seconds(self, track_id):
        t = self._tracks.get(track_id)
        if not t:
            return 0
        return t["last_seen"] - t["first_seen"]

    def erratic_speed(self, track_id):
        t = self._tracks.get(track_id)
        if not t:
            return False
        positions = t["positions"]
        if len(positions) < 4:
            return False
        deltas = [
            ((x2 - x1) ** 2 + (y2 - y1) ** 2) ** 0.5
            for (_, x1, y1), (_, x2, y2) in zip(positions, list(positions)[1:])
        ]
        return statistics.pstdev(deltas) > ERRATIC_SPEED_THRESHOLD

    def signals(self, track_id, zone_rect, force_after_hours=False):
        t = self._tracks.get(track_id)
        if not t or not t["positions"]:
            return {
                "zone_intrusion": False,
                "zone_name": "Restricted Zone",
                "loiter_seconds": 0,
                "object_class": "person",
                "is_after_hours": is_after_hours(force_after_hours),
                "erratic_speed": False,
            }
        cx, cy = t["positions"][-1][1], t["positions"][-1][2]
        return {
            "zone_intrusion": in_zone((cx, cy), zone_rect),
            "zone_name": "Restricted Zone",
            "loiter_seconds": self.loiter_seconds(track_id),
            "object_class": t["class"],
            "is_after_hours": is_after_hours(force_after_hours),
            "erratic_speed": self.erratic_speed(track_id),
        }

    def score_crossed_high(self, track_id, score):
        """True the moment a track's score enters the HIGH band (edge-triggered, not every frame)."""
        was_high = self._last_band.get(track_id) == "HIGH"
        is_high = score > HIGH_BAND
        self._last_band[track_id] = "HIGH" if is_high else "LOW"
        return is_high and not was_high

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
    """Self-check: the pitch's headline example must keep summing correctly."""
    signals = {
        "zone_intrusion": True,
        "zone_name": "Restricted Zone",
        "loiter_seconds": 200,
        "object_class": "person",
        "is_after_hours": True,
        "erratic_speed": False,
    }
    score, breakdown = compute_risk(signals)
    assert score == 80, f"expected 80, got {score}: {breakdown}"

    maxed = {**signals, "object_class": "vehicle", "erratic_speed": True}
    score2, _ = compute_risk(maxed)
    assert score2 == 100, f"expected clamp at 100, got {score2}"

    none_signals = {
        "zone_intrusion": False,
        "zone_name": "",
        "loiter_seconds": 0,
        "object_class": "person",
        "is_after_hours": False,
        "erratic_speed": False,
    }
    score3, breakdown3 = compute_risk(none_signals)
    assert score3 == 0 and breakdown3 == []

    print("risk.py self-check passed")


if __name__ == "__main__":
    demo()
