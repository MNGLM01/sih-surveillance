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

Two cameras (`cam1`, `cam2`) are configured by default, both reading the bundled sample video, so multi-camera concurrency is exercised out of the box without extra footage.

## Calibration knobs (env vars)

- `YOLO_DEVICE=cuda:0` — hardware device for YOLO detector, ByteTrack tracker, and ANPR plate detector (`cuda:0` default when CUDA is available; set `YOLO_DEVICE=cpu` for CPU fallback).
- `FORCE_AFTER_HOURS=true` — force the after-hours risk signal on, for demos run during the day.
- `RISK_HIGH_BAND=<int>` — override the score threshold (default 70) that triggers an alert + evidence clip. Lower it to see alerts more easily on unfamiliar footage; raise it if everything is alerting.
- `RISK_MEDIUM_BAND=<int>` — override the MEDIUM/LOW boundary (default 30).

Restricted zones are defined per-camera in `backend/config.py` as **normalized** rectangles `(x1, y1, x2, y2)` — fractions of frame width/height, 0..1 — so they aren't tied to one source resolution. Add a new camera by appending to `CAMERAS`; a file path, `0` for a webcam, or an `rtsp://` URL all work as `source` (same `cv2.VideoCapture` call). Behavior thresholds (loitering, erratic speed, vehicle-stopped, crowd formation, incident cooldown) and risk weights are all in `backend/config.py`, not scattered through the code.

## Validating each piece

```bash
python -m unittest discover -s tests -v   # detector/tracker/behavior/risk/incident/API tests
python backend/detector.py                # self-check
python backend/tracker.py                 # self-check
python backend/behavior.py                # self-check
python backend/risk.py                    # self-check
python backend/incident.py                # self-check
python backend/evidence.py                # self-check
python backend/db.py                      # self-check
python backend/camera_worker.py           # runs one camera end-to-end, prints incidents to console
```

## API

- `GET /cameras`, `GET /cameras/{id}/status`, `POST /cameras/{id}/restart`
- `GET /events?camera_id=&since=` — legacy per-crossing rows (unchanged shape, for the existing dashboard)
- `GET /incidents?camera_id=&status=`, `PATCH /incidents/{id}?status=` — deduplicated, lifecycle-managed incidents (`NEW`/`ACKNOWLEDGED`/`INVESTIGATING`/`VERIFIED`/`FALSE_POSITIVE`/`RESOLVED`)
- `GET /evidence/{event_id}.mp4`
- `WS /ws/live` — `event`, `incident_created`, `incident_updated` messages

## Architecture

See `docs/architecture.md` for the current module breakdown, the detector → tracker → behavior → risk → incident pipeline, and how multiple cameras run concurrently. `docs/PRD.md` is kept as the original hackathon-submission snapshot.
