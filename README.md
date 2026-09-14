# SIH Surveillance Prototype

AI-powered CCTV surveillance: detection -> tracking -> zone/loitering events -> explainable risk scoring -> real-time alerts -> map + dashboard.

## Setup (one-time)

```bash
brew install python@3.11
cd sih-surveillance
python3.11 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

## Run

```bash
source .venv/bin/activate
uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

Open http://127.0.0.1:8000 — map with camera pins, live annotated feed, real-time alert list, event history with evidence-clip playback.

The sample video (`sample_videos/people-walking.mp4`) loops automatically so the demo can run repeatedly without restarting.

## Calibration knobs (env vars)

- `FORCE_AFTER_HOURS=true` — force the after-hours risk signal on, for demos run during the day.
- `RISK_HIGH_BAND=<int>` — override the score threshold (default 50) that triggers an alert + evidence clip. Lower it to see alerts more easily on unfamiliar footage; raise it if everything is alerting.

Restricted zones are defined per-camera in `backend/config.py` as pixel rectangles `(x1, y1, x2, y2)` — they're tuned for the bundled 768x432 sample video. Add a new camera by appending to `CAMERAS`; a file path, `0` for a webcam, or an `rtsp://` URL all work as `source` (same `cv2.VideoCapture` call).

## Validating each piece

```bash
python backend/risk.py           # risk-scoring self-check
python backend/db.py             # storage self-check
python backend/camera_worker.py  # detection+tracking+risk, prints events to console
```

## Architecture

See `docs/architecture.md` for the SIH submission writeup (problem, architecture, MVP vs advanced features, differentiator).
