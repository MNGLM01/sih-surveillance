import os

# Frame-pixel zone rectangles are tuned for the 768x432 sample video.
# For a different source, redraw the rectangle to match its resolution.
# Default tracker configuration file (ByteTrack)
DEFAULT_TRACKER_CONFIG = os.path.join(os.path.dirname(__file__), "bytetrack.yaml")

CAMERAS = [
    {
        "id": "cam1",
        "name": "Main Gate",
        "source": os.path.join(os.path.dirname(__file__), "..", "sample_videos", "WhatsApp Video 2026-09-14 at 10.48.17 PM.mp4"),
        "lat": 28.6139,
        "lon": 77.2090,
        "zone": (276, 165, 607, 442),  # (x1, y1, x2, y2) restricted-zone rectangle scaled for 848x478
        "tracker": DEFAULT_TRACKER_CONFIG,
    },
    {
        "id": "cam2",
        "name": "Courtyard / New Feed",
        "source": os.path.join(os.path.dirname(__file__), "..", "sample_videos", "From Klickpin.com- Mental Wellness Tips for a More Beautiful Life-pin-id-864128247291831444.mp4"),
        "lat": 28.6145,
        "lon": 77.2105,
        "zone": (150, 200, 600, 750),  # (x1, y1, x2, y2) scaled for 720x816
        "tracker": DEFAULT_TRACKER_CONFIG,
    },
]

# Force after-hours risk signal on regardless of wall-clock time, for demos.
FORCE_AFTER_HOURS = os.environ.get("FORCE_AFTER_HOURS", "false").lower() == "true"


