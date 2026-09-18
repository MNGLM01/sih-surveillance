# AI-Powered Real-Time Video Surveillance — Solution & Architecture

## 1. Problem Summary

Manual CCTV monitoring doesn't scale: operators can't watch every feed continuously, risky events get missed in real time, and footage review only happens after the fact. Security teams need a system that watches every feed simultaneously and surfaces only what actually needs a human's attention.

## 2. Proposed Architecture

```
Camera Feed(s) [file / webcam / RTSP]
        |
        v
CameraService — one CameraContext per camera (own detector, tracker,
                behavior history, incident dedup state, zones)
        |
        v
CameraWorker  — one thread per camera: ingestion + retry/backoff on failure
        |
        v
SurveillancePipeline.process_frame(context, frame, video_time)
        |
        v
Detector (YOLO11n)  ->  Tracker (ByteTrack, camera-scoped IDs)
        |
        v
BehaviorEngine (zone intrusion, loitering, after-hours, direction,
                vehicle-stopped, repeated visits, crowd formation)
        |
        v
RiskEngine (explainable, weighted, additive score + reasons)
        |
        v
IncidentManager (dedup/cooldown -> lifecycle-managed Incident)
        |
        v
SQLite (events + incidents + evidence) ---> WebSocket broadcast
                                                    |
                                                    v
                                    Dashboard: live feed + map + alert feed + history
```

Each pipeline stage only understands the schema the stage before it produces (`Detection` -> `Track` -> `BehaviorEvent` -> `RiskResult` -> `Incident`, all defined in `backend/schemas.py`), not that stage's internals. This is what lets the modules be developed, tested, and swapped independently.

## 3. Core Modules

| Module | File | Responsibility |
|---|---|---|
| Config | `backend/config.py` | Camera list (multi-camera), zone definitions (normalized, resolution-independent), all tunable thresholds/weights |
| Schemas | `backend/schemas.py` | Shared data contracts: `Detection`, `Track`, `BehaviorEvent`, `RiskReason`/`RiskResult`, `Incident`, `Zone` |
| Detection | `backend/detector.py` | Pretrained YOLO11n -> `Detection` list. No tracking, no risk. |
| Tracking | `backend/tracker.py` | ByteTrack (explicitly configured via `tracker="bytetrack.yaml"`), camera-scoped `track_id`s (`"cam1:P-7"`), first/last-seen + position history |
| Behavior | `backend/behavior.py` | Zone intrusion, loitering, after-hours, movement direction, vehicle-stopped, repeated zone visits, crowd formation -> `BehaviorEvent` list. Rule-based, no ML, no CV. |
| Risk | `backend/risk.py` | Named, weighted, additive scoring over a track's `BehaviorEvent`s -> `RiskResult` (score 0-100, severity, reasons). No detection/tracking logic. |
| Incident | `backend/incident.py` | EVENT ≠ INCIDENT: dedups repeated HIGH frames from the same track into one lifecycle-managed `Incident` (cooldown-based), instead of one row per frame. |
| Evidence | `backend/evidence.py` | Per-camera pre-event ring buffer + post-event continuation (~5s before / ~10s after a trigger), one clip in flight per camera. |
| Pipeline | `backend/pipeline.py` | Orchestrates detector -> tracker -> behavior -> risk -> incident for one frame. Contains none of their logic itself. |
| Camera service | `backend/services/camera_service.py` | Builds one isolated `CameraContext` per camera; `start_camera`/`stop_camera`/`restart_camera`/`get_camera_status`/`start_all`/`stop_all`. |
| Ingestion | `backend/camera_worker.py` | Owns one `cv2.VideoCapture` per camera thread; bounded retry/backoff on failure so one bad camera can't take others down; feeds frames to the pipeline. |
| Storage | `backend/db.py` | SQLite: `cameras`, `events` (legacy per-crossing rows, unchanged shape), `incidents` (new, with lifecycle status) |
| API | `backend/main.py` | FastAPI: REST routes, `/ws/live` WebSocket, static dashboard hosting, camera-service wiring |
| Dashboard | `frontend/index.html`, `app.js`, `style.css` | Leaflet map, live feed, alert feed, history — vanilla JS, no build step, unchanged by this refactor |

## 4. Multi-Camera Concurrency

Each configured camera gets its own `CameraContext` (own `Detector`/YOLO model instance, own `Tracker`, own `BehaviorEngine`, own `IncidentManager`, own evidence buffer, own zones) built once at startup by `CameraService`. `CameraService.start_all()` spawns one Python thread per camera (`CameraWorker.run`), each independently opening its source, reading frames, and calling `SurveillancePipeline.process_frame(context, frame, video_time)`.

Nothing about a camera's runtime state is shared across cameras: two cameras can independently assign raw tracker id `7` to different objects, and they never collide because every track id is rewritten as `"<camera_id>:P-<raw_id>"` before leaving `tracker.py`, and every per-track history dict lives inside that camera's own `Tracker`/`BehaviorEngine`/`IncidentManager` instances. `RiskEngine` is the one instance shared across all cameras, safely, because it is pure config + arithmetic with no per-camera memory.

A camera failing to open or erroring mid-stream is caught in `CameraWorker.run`, retried up to `CAMERA_MAX_RETRIES` times with a fixed backoff, then marked `OFFLINE` — it never raises past its own thread, so other cameras keep running. `GET /cameras/{id}/status` and `POST /cameras/{id}/restart` expose this for an operator.

This was chosen over a shared-inference-queue architecture (one model process fed by all cameras) because at 2-4 camera, CPU-only, YOLO11n scale, one model instance per camera thread is simpler, was already proven working in the original prototype, and needs no message broker. If a deployment grows to many more concurrent feeds than CPU cores, the upgrade path is to move `Detector`'s model call behind a shared batched-inference queue — the `Detector`/`Tracker` interfaces don't need to change for that, only what's inside them.

## 5. MVP vs. Advanced Features

**MVP (built and demoed):**
- Multi-camera person + vehicle detection and multi-object tracking, running concurrently
- Restricted-zone intrusion, loitering, after-hours, movement-direction, vehicle-stopped, repeated-visit, and crowd-formation behaviors
- Explainable, auditable, additive risk scoring, independent of detection confidence
- Incident lifecycle (`NEW` -> `ACKNOWLEDGED`/`INVESTIGATING`/`VERIFIED`/`FALSE_POSITIVE`/`RESOLVED`) with dedup/cooldown, separate from raw per-crossing events
- Real-time alerts and incident updates over WebSocket
- Map + dashboard with camera locations and live incidents
- Pre+post buffered evidence clips auto-saved on high-risk events

**Advanced / future work:**
- Automatic number-plate reading (ANPR/OCR) where footage permits
- Cross-camera tracking / authorized-person Re-ID
- Live multi-site RTSP fleet ingestion at scale (shared batched-inference queue, see §4)
- Custom-trained models for domain-specific objects (e.g. abandoned bags, weapons)
- Predictive analytics from historical incident patterns
- Polygon (non-rectangular) restricted zones — `Zone` already stores normalized coordinates so this is a `contains()` implementation change, not a schema change

## 6. Example User Journey

An operator opens the dashboard and sees camera pins on a map, colored by current risk level. At 11pm, a person enters a restricted zone near the main gate and lingers. The risk engine combines "zone intrusion" (+40) and "after-hours" (+15) into a score of 55 — crossing the alert threshold. `IncidentManager` opens one `Incident` for that track (not one per frame while it stays HIGH), the operator sees a real-time alert with the exact score breakdown, and a short evidence clip covering ~5s before and ~10s after the crossing, without having had to watch that camera at all.

## 7. Tech Stack & Why

| Layer | Choice | Why |
|---|---|---|
| Detection + Tracking | Ultralytics YOLO11n + bundled ByteTrack | Pretrained — no training data or time needed; ByteTrack ships with the same library, no separate Re-ID/embedding dependency |
| Backend | FastAPI + uvicorn | Single process serves REST + WebSocket + static files, async-native |
| Storage | SQLite | Zero-ops, file-based, plenty for demo scale (2-4 cameras) |
| Frontend | Vanilla HTML/JS + Leaflet | No build step — nothing to break on a judge's wifi |
| Concurrency | One thread per camera, isolated `CameraContext` | 2-4 demo feeds don't need a distributed worker fleet; see §4 for the scale-up path |

## 8. Key Differentiator

Unlike black-box AI alerting, every risk score here is a transparent sum of named, weighted factors — auditable by a human operator, not a mystery output. An operator (or an inquiry afterward) can see exactly why an incident was flagged: which zone, how long, what time, what kind of movement — and that this is separate from how confident the detector was that the object is a person or vehicle in the first place.
