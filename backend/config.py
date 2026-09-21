import os
from pathlib import Path

SAMPLE_VIDEOS_DIR = Path(__file__).resolve().parent.parent / "sample_videos"
SAMPLE_VIDEO = os.path.join(str(SAMPLE_VIDEOS_DIR), "people-walking.mp4")

# Zone rectangles are normalized (0..1) fractions of frame width/height, so they
# work across any source resolution.
_DEFAULT_ZONES = [
    {"name": "Restricted Zone Alpha", "rect_norm": (0.25, 0.25, 0.75, 0.85)},
    {"name": "Restricted Zone Beta", "rect_norm": (0.15, 0.20, 0.85, 0.80)},
    {"name": "Perimeter Security Zone", "rect_norm": (0.20, 0.30, 0.80, 0.90)},
    {"name": "Gate Entry Zone", "rect_norm": (0.30, 0.35, 0.70, 0.85)},
]

_DEFAULT_CAM_NAMES = ["Main Gate (Cam 1)", "North Fence (Cam 2)", "South Perimeter (Cam 3)", "East Gate (Cam 4)"]
_DEFAULT_COORDS = [
    (28.6139, 77.2090),
    (28.6155, 77.2101),
    (28.6125, 77.2085),
    (28.6148, 77.2115),
]

def discover_cameras(target_count: int = 4) -> list[dict]:
    """Scans sample_videos folder and strictly matches only videos named
    Cam1, Cam2, Cam3, and Cam4 (case-insensitive, e.g. Cam1.mp4, cam2.mp4, etc.).
    Any other videos in the folder are strictly ignored.
    If a specific CamX video is not found, falls back to SAMPLE_VIDEO so all 4 cameras operate."""
    valid_exts = {".mp4", ".avi", ".mov", ".mkv", ".webm"}

    # Index files matching Cam1, Cam2, Cam3, Cam4
    cam_file_map = {}
    if SAMPLE_VIDEOS_DIR.is_dir():
        for item in SAMPLE_VIDEOS_DIR.iterdir():
            if item.is_file() and item.suffix.lower() in valid_exts and not item.name.startswith("."):
                stem_lower = item.stem.strip().lower()
                # Check if file stem matches cam1, cam2, cam3, cam4
                for idx in range(1, target_count + 1):
                    key = f"cam{idx}"
                    if stem_lower == key or stem_lower.replace(" ", "") == key or stem_lower.replace("_", "") == key:
                        cam_file_map[key] = str(item)

    cameras = []
    for idx in range(target_count):
        cam_id = f"cam{idx + 1}"
        src = cam_file_map.get(cam_id, SAMPLE_VIDEO)
        video_filename = Path(src).name
        cam_name = f"Camera {idx + 1} ({video_filename})"
        lat, lon = _DEFAULT_COORDS[idx % len(_DEFAULT_COORDS)]
        zone = _DEFAULT_ZONES[idx % len(_DEFAULT_ZONES)]

        cameras.append({
            "id": cam_id,
            "name": cam_name,
            "source": src,
            "lat": lat,
            "lon": lon,
            "zones": [zone],
        })
    return cameras

# Configured cameras list (automatically discovered on load)
CAMERAS = discover_cameras(4)

# Force after-hours risk signal on regardless of wall-clock time, for daytime demos.
FORCE_AFTER_HOURS = os.environ.get("FORCE_AFTER_HOURS", "true").lower() == "true"
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

# --- Streaming / FPS Optimization ---
# Process full ML pipeline (YOLO + tracking + behavior + ANPR) only every Nth
# frame.  Intermediate frames are annotated with the last known results and
# pushed for display, giving smooth video without the per-frame ML cost.
PIPELINE_SKIP_FRAMES = int(os.environ.get("PIPELINE_SKIP_FRAMES", "2"))
STREAM_JPEG_QUALITY = int(os.environ.get("STREAM_JPEG_QUALITY", "65"))
STREAM_MAX_WIDTH = int(os.environ.get("STREAM_MAX_WIDTH", "640"))

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

# --- ANPR (Automatic Number Plate Recognition) ---
ANPR_ENABLED = os.environ.get("ANPR_ENABLED", "true").lower() == "true"
ANPR_FRAME_INTERVAL = int(os.environ.get("ANPR_FRAME_INTERVAL", "5"))
ANPR_PLATE_MODEL_PATH = os.environ.get("ANPR_PLATE_MODEL_PATH", "license_plate_detector.pt")
ANPR_PLATE_CONFIDENCE = float(os.environ.get("ANPR_PLATE_CONFIDENCE", "0.4"))
ANPR_OCR_CONFIDENCE = float(os.environ.get("ANPR_OCR_CONFIDENCE", "0.35"))
ANPR_MIN_CONSENSUS_READINGS = int(os.environ.get("ANPR_MIN_CONSENSUS_READINGS", "2"))
ANPR_MAX_TRACK_HISTORY = int(os.environ.get("ANPR_MAX_TRACK_HISTORY", "50"))
ANPR_EVIDENCE_IMAGES = os.environ.get("ANPR_EVIDENCE_IMAGES", "true").lower() == "true"
ANPR_EVIDENCE_DIR = BASE_DIR / "anpr_evidence"
