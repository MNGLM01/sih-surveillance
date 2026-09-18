import os
from pathlib import Path

SAMPLE_VIDEO = os.path.join(os.path.dirname(__file__), "..", "sample_videos", "people-walking.mp4")

# Zone rectangles are normalized (0..1) fractions of frame width/height, so they
# no longer assume a fixed source resolution. These were tuned by eye against
# the bundled 768x432 sample video: (250,150,550,400)px -> divide by (768,432).
_MAIN_GATE_ZONE = {"name": "Main Gate Restricted Zone", "rect_norm": (250 / 768, 150 / 432, 550 / 768, 400 / 432)}
_NORTH_FENCE_ZONE = {"name": "North Fence Restricted Zone", "rect_norm": (100 / 768, 100 / 432, 400 / 432, 350 / 432)}

# Two cameras by default (both reading the same sample video) so multi-camera
# concurrency is exercised out of the box without needing extra footage.
# Add a real camera by appending an entry; "source" accepts a file path,
# webcam index (0), or an rtsp:// URL - same cv2.VideoCapture call for all three.
CAMERAS = [
    {
        "id": "cam1",
        "name": "Main Gate",
        "source": SAMPLE_VIDEO,
        "lat": 28.6139,
        "lon": 77.2090,
        "zones": [_MAIN_GATE_ZONE],
    },
    {
        "id": "cam2",
        "name": "North Fence",
        "source": SAMPLE_VIDEO,
        "lat": 28.6155,
        "lon": 77.2101,
        "zones": [_NORTH_FENCE_ZONE],
    },
]

# Force after-hours risk signal on regardless of wall-clock time, for daytime demos.
FORCE_AFTER_HOURS = os.environ.get("FORCE_AFTER_HOURS", "false").lower() == "true"
AFTER_HOURS_START_HOUR = 22
AFTER_HOURS_END_HOUR = 6

# Behavior thresholds.
LOITER_MED_SECONDS = 60
LOITER_HIGH_SECONDS = 180
ERRATIC_SPEED_THRESHOLD = 40  # px/frame stdev, tuned for ~720p @ 12-30fps
VEHICLE_STOPPED_SECONDS = 20
VEHICLE_STOPPED_SPEED_PX = 4  # avg px/frame displacement below this counts as "stationary"
REPEATED_VISITS_THRESHOLD = 3  # zone re-entries before flagging as repeated
CROWD_MIN_COUNT = 4
CROWD_RADIUS_PX = 150

# Risk weights - named, additive, capped at 100 (see risk.py). Override the
# alert threshold per env for unfamiliar footage without editing source.
RISK_WEIGHTS = {
    "RESTRICTED_ZONE_INTRUSION": 40,
    "LOITERING_HIGH": 25,
    "LOITERING_MEDIUM": 10,
    "VEHICLE_IN_ZONE": 10,
    "AFTER_HOURS": 15,
    "ERRATIC_SPEED": 10,
    "BORDER_DIRECTION": 2,
    "VEHICLE_STOPPED": 10,
    "REPEATED_ZONE_VISITS": 15,
    "CROWD_FORMATION": 10,
}
RISK_HIGH_BAND = int(os.environ.get("RISK_HIGH_BAND", 50))
RISK_MEDIUM_BAND = int(os.environ.get("RISK_MEDIUM_BAND", 30))

# Incident deduplication: same camera+track+behavior within this window updates
# the existing incident instead of creating a new one every frame.
INCIDENT_COOLDOWN_SECONDS = 30

# Evidence clip buffering.
EVIDENCE_PRE_SECONDS = 5
EVIDENCE_POST_SECONDS = 10

# Camera fault handling: bounded retries with backoff, not a tight restart loop.
CAMERA_MAX_RETRIES = 3
CAMERA_RETRY_DELAY_SECONDS = 5

DETECTOR_MODEL_PATH = "yolo11n.pt"
DETECTOR_CONFIDENCE = 0.25

BASE_DIR = Path(__file__).parent.parent
DATA_DIR = BASE_DIR / "data"
EVIDENCE_DIR = BASE_DIR / "evidence_clips"
