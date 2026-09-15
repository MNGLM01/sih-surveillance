import os

# Frame-pixel zone rectangles are tuned for the 768x432 sample video.
# For a different source, redraw the rectangle to match its resolution.
CAMERAS = [
    {
        "id": "cam1",
        "name": "Main Gate",
        "source": os.path.join(os.path.dirname(__file__), "..", "sample_videos", "WhatsApp Video 2026-09-14 at 10.48.17 PM.mp4"),
        "lat": 28.6139,
        "lon": 77.2090,
        "zone": (276, 165, 607, 442),  # (x1, y1, x2, y2) restricted-zone rectangle scaled for 848x478
    },
]

# Force after-hours risk signal on regardless of wall-clock time, for demos.
FORCE_AFTER_HOURS = os.environ.get("FORCE_AFTER_HOURS", "false").lower() == "true"
