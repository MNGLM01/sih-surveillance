# Product Requirements Document

**Project:** AI-Powered Real-Time Video Surveillance System
**Track:** Smart India Hackathon (SIH) — SIH26045-class security/surveillance problem statement
**Doc version:** 1.0
**Status:** MVP built and validated against real footage (local prototype)
**Date:** 2026-09-14

---

## 1. Executive Summary

Security operators today watch CCTV feeds manually — a task that doesn't scale past a handful of cameras and misses events in real time because attention, not footage, is the bottleneck. This project replaces continuous human monitoring with an AI pipeline that watches every feed simultaneously and only surfaces what needs attention: **Live feeds → Detection → Tracking → Event analysis → Explainable risk scoring → Real-time alerts → Map + dashboard.**

A working prototype has been built and validated end-to-end against real pedestrian footage: detection (YOLO11n), multi-object tracking (ByteTrack), zone-intrusion and loitering detection, an explainable additive risk score, a FastAPI backend (REST + WebSocket), a SQLite event store, and a live map/dashboard frontend. This document specifies the full product — what's built, what's deliberately deferred, and why.

## 2. Problem Statement

- Manual CCTV monitoring does not scale: one operator cannot attentively watch many feeds at once.
- Risky events (unauthorized zone entry, loitering, suspicious movement) are typically discovered after the fact during footage review, not in real time.
- Existing "smart" alerting is often a black box — an operator cannot see *why* a system flagged something, which undermines trust and makes incidents hard to justify or audit.
- Security teams need a system that is centralized (one dashboard, many cameras), proactive (real-time alerts, not just recordings), and explainable (every alert can be justified to a human).

## 3. Goals & Success Metrics

| Goal | Success metric |
|---|---|
| Reduce manual monitoring load | One dashboard covers N cameras; operator acts only on alerts, not continuous watching |
| Real-time detection | Alert reaches the dashboard within ~1 detection cycle of the triggering event (sub-second over WebSocket) |
| Explainability | Every alert shows a human-readable score breakdown (which rule fired, why, how much) |
| Evidence-backed response | Every high-risk alert has a corresponding short video clip an operator can review immediately |
| Demo-readiness (hackathon) | System runs against recorded/sample footage with zero live-camera dependency, and is RTSP-ready for real deployment |

## 4. Users & Personas

- **Security operator** — primary user. Watches the dashboard, responds to alerts, reviews evidence clips, does not want false-positive fatigue.
- **Site/security manager** — reviews event history, audits why incidents were flagged, tunes zone definitions and thresholds for their site.
- **SIH evaluators / stakeholders** — audience for this document and the live demo; care about technical soundness, explainability, and a credible path from prototype to real deployment.

## 5. Scope

### 5.1 In scope — MVP (built)

1. Multi-camera video ingestion (recorded file, webcam, or RTSP — same code path)
2. Person and vehicle detection
3. Multi-object tracking (persistent IDs across frames)
4. Restricted-zone intrusion detection
5. Loitering detection (dwell-time based)
6. Explainable, rule-based, additive risk scoring
7. Real-time alert delivery to the dashboard (WebSocket)
8. Automatic evidence-clip capture on high-risk events
9. Event history with query API
10. Map + live dashboard UI (camera pins colored by current risk, live annotated feed, alert feed, history table with clip playback)

### 5.2 Out of scope — advanced / future work

1. Automatic number-plate reading (ANPR/OCR) where footage permits
2. Cross-camera tracking / authorized-person Re-ID
3. Live ingestion at multi-site RTSP fleet scale (current design targets 2-4 concurrent feeds)
4. Custom-trained models for domain-specific objects (e.g. abandoned bags, weapons)
5. Predictive analytics from historical incident patterns
6. Dashboard authentication / role-based access control
7. Evidence-clip retention policy and storage lifecycle management (see §10, Risks)

These are excluded deliberately, not by omission — each requires either training data/time the hackathon timeline doesn't allow, or infrastructure that isn't justified at 2-4 camera demo scale.

## 6. Functional Requirements

| ID | Requirement | Detail / acceptance criteria |
|---|---|---|
| FR1 | Video ingestion | `cv2.VideoCapture(source)` where `source` is a file path, webcam index, or `rtsp://` URL, identically. One capture thread per camera. |
| FR2 | Object detection | Pretrained YOLO11n detects COCO classes person(0), car(2), motorcycle(3), bus(5), truck(7) per frame. |
| FR3 | Tracking | Ultralytics' bundled ByteTrack (`model.track(persist=True)`) assigns a stable `track_id` to each object across frames within a camera. |
| FR4 | Zone intrusion | A restricted zone is a per-camera pixel rectangle; a track is "in zone" when its bounding-box center falls inside it. |
| FR5 | Loitering | Dwell time = current video-time minus a track's first-seen video-time; two bands (>60s, >180s) contribute increasing risk. |
| FR6 | Risk scoring | Deterministic, additive, named-weight formula (see §9) — never a black-box model score. |
| FR7 | Alerting | On a track's score crossing the HIGH band (edge-triggered, not every frame), an event is broadcast to all connected dashboard clients over WebSocket within the same detection cycle. |
| FR8 | Evidence capture | On the same HIGH-crossing trigger, the last ~6 seconds of annotated frames are flushed to an `.mp4` clip and linked to the event record. |
| FR9 | Event history | `GET /events` (optionally filtered by camera/time) returns persisted incidents with score, breakdown, and evidence link. |
| FR10 | Dashboard | Map (camera pins, colored by current risk band), live annotated feed per camera, live alert feed, event history table with clip playback — all served from one process, no build step. |

## 7. Non-Functional Requirements

- **Explainability** — every score is a sum of named, weighted, human-readable rules (§9), not an opaque ML output; this is the product's stated differentiator, not an afterthought.
- **Performance** — must run in real time on CPU-only consumer hardware for 2-4 camera feeds (validated: YOLO11n + ByteTrack processed a 596-frame/768×432 clip well within real time on a MacBook-class CPU).
- **Fault isolation** — one camera thread stalling or erroring must not stop others; no shared mutable state between camera workers beyond the broadcast layer.
- **Portability** — the ingestion layer must not assume "file"; swapping in a live RTSP URL requires a config change only, no code change.
- **Demo repeatability** — file-based sources loop automatically so the system can be demonstrated repeatedly without a restart.
- **Auditability** — persisted events must retain the full score breakdown, not just the final number, so a decision can be reconstructed later.

## 8. System Architecture

```
Camera Feed(s) [file / webcam / RTSP]
        |
        v
Ingestion Thread (per camera, ring-buffered)
        |
        v
YOLO11n Detection (person / vehicle) + ByteTrack (persistent IDs)
        |
        v
Event Layer (zone intrusion + loitering, from per-track position history)
        |
        v
Risk Scoring (explainable, weighted, additive rules)
        |
        v
SQLite (events + evidence) ---> WebSocket broadcast
                                        |
                                        v
                        Dashboard: live feed + map + alert feed + history
```

**Modules (as implemented):** the single-file `camera_worker.py` described in the original submission has since been decomposed into `detector.py` / `tracker.py` / `behavior.py` / `risk.py` / `incident.py` / `pipeline.py` / `services/camera_service.py`, each with one responsibility, plus a new `incidents` table separate from `events`. See `docs/architecture.md` §3-4 for the current module table and multi-camera concurrency model — this section is kept as the original hackathon-submission snapshot and is no longer fully accurate to the code.

**Concurrency model:** one Python thread per camera running its own capture + inference + risk loop; FastAPI's own asyncio loop handles the API/WebSocket layer; cross-thread events are handed to the event loop via `asyncio.run_coroutine_threadsafe`. No message queue, no multiprocessing — sufficient at 2-4 camera scale and avoids infrastructure the hackathon timeline doesn't need.

## 9. Risk Scoring Specification

Every signal is named and weighted; the total is clamped to 100 and mapped to a band.

| Signal | Condition | Weight |
|---|---|---|
| Zone intrusion | Track's center point inside the restricted-zone rectangle | +40 |
| Loitering (medium) | Dwell time > 60s | +10 |
| Loitering (high) | Dwell time > 180s (supersedes the medium band, not additive with it) | +25 |
| Vehicle in zone | Object class is a vehicle **and** zone intrusion is true | +10 |
| After-hours | Local time within 22:00–06:00 (or forced via config for daytime demos) | +15 |
| Erratic movement | Stdev of frame-to-frame displacement over the last ~30 positions exceeds a fixed threshold | +10 |

**Bands:** `< 30` LOW (green) · `30–50` MEDIUM (amber) · `> 50` HIGH (red, alert + evidence clip triggered)

**Worked example (real, captured from testing):** a person's tracked center enters the restricted zone during after-hours → `Zone intrusion: +40`, `After-hours: +15` → **score 55 → HIGH**. This is the actual output logged during validation, not a hypothetical.

**Calibration note:** the HIGH threshold was originally set at 60 (matching an illustrative "zone + loitering + after-hours = 80" example), but end-to-end testing against real footage showed that a genuinely serious real-world signal — zone intrusion after hours — only reaches 55, and would never have fired an alert under that threshold. The default was recalibrated to 50 based on this measurement. This is exposed as a runtime knob (`RISK_HIGH_BAND`), not hard-coded, because the correct threshold depends on camera angle and site footage, not on the pitch's illustrative numbers — the same principle applies to `FORCE_AFTER_HOURS` (daytime demos) and to per-camera zone rectangles.

## 10. Data Model

```sql
CREATE TABLE cameras (
    id TEXT PRIMARY KEY, name TEXT, source TEXT, lat REAL, lon REAL, zone_json TEXT
);
CREATE TABLE events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    camera_id TEXT, track_id INTEGER, object_class TEXT,
    score INTEGER, breakdown_json TEXT,
    started_at TEXT, ended_at TEXT,
    evidence_path TEXT,
    FOREIGN KEY(camera_id) REFERENCES cameras(id)
);
```

Deliberately excluded: a per-frame position-history table. Position history is transient, in-memory, per-track state (a `deque`) — only score-crossing *events* are persisted. Logging every frame's every bounding box was assessed as unnecessary write volume for what the product needs.

## 11. API Specification

| Method & path | Purpose | Notes |
|---|---|---|
| `GET /cameras` | List configured cameras | Returns id, name, source, lat/lon, zone |
| `GET /events?camera_id=&since=` | Query event history | Filterable; newest first |
| `GET /evidence/{event_id}.mp4` | Fetch an evidence clip | Served directly as `video/mp4` |
| `WS /ws/live` | Real-time alert stream | Server pushes a JSON message per HIGH-crossing event to every connected dashboard client |

**Example live event payload (real, captured from testing):**

```json
{
  "type": "event",
  "event_id": 2,
  "camera_id": "cam1",
  "track_id": 2,
  "object_class": "person",
  "score": 55,
  "breakdown": [
    "Zone intrusion (Restricted Zone): +40",
    "After-hours (22:00-06:00): +15"
  ]
}
```

## 12. Tech Stack & Rationale

| Layer | Choice | Why |
|---|---|---|
| Runtime | Python 3.11 (via a dedicated venv) | Ultralytics/torch wheels lag new CPython releases; the machine's default 3.14 was confirmed to be a real install blocker during setup |
| Detection + tracking | Ultralytics YOLO11n + bundled ByteTrack | Pretrained — no training data or time needed; tracker ships with the same library, no separate Re-ID/embedding dependency |
| Video I/O | OpenCV (`cv2`) | One API for file, webcam, and RTSP sources; also writes evidence clips (`mp4v`, no ffmpeg dependency needed) |
| Backend | FastAPI + uvicorn | Single process serves REST + WebSocket + static files, async-native |
| Storage | SQLite | Zero-ops, file-based, sufficient for demo/site scale; avoids Postgres/cloud infra with no corresponding need |
| Frontend | Vanilla HTML/JS + Leaflet (CDN) | No build step, no npm — nothing to break on a judge's or operator's network |
| Concurrency | One thread per camera | Sufficient for 2-4 feeds; avoids a message-queue/worker-fleet architecture the current scale doesn't justify |

Explicitly rejected as over-scoped at this stage: Docker/Kubernetes, Kafka/message queues, Postgres, a separate DeepSORT/Re-ID embedding model, a React/Vite build pipeline, WebRTC/HLS streaming.

## 13. Current Implementation Status

The MVP described in §5.1 is built and has been validated end-to-end, not just unit-tested in isolation:

- Environment: Python 3.11 venv, all dependencies installed and import-verified.
- Detection + tracking validated frame-by-frame against a real 768×432 pedestrian test clip (bounding boxes and stable track IDs confirmed).
- Risk engine self-checks pass (`backend/risk.py` `demo()`), and real (not synthetic) score transitions were captured from the actual clip — e.g. `40 (zone) + 15 (after-hours) = 55`, correctly re-classified back to LOW the moment the track leaves the zone.
- Storage layer self-checks pass (`backend/db.py` `demo()`).
- Full pipeline verified live: REST endpoints respond correctly, a WebSocket client receives a real event payload generated by the running pipeline (not a mock), and the linked evidence `.mp4` was confirmed to be a valid, readable video file.
- Dashboard confirmed reachable and serving static assets (200 responses) with the map, live feed, and alert feed wired to the same live backend.
- File-based sources loop automatically, so the same demo can be re-run without restarting the server.

**One incident from this validation is worth recording here directly:** loitering was initially computed from wall-clock processing time, which silently broke because CPU inference speed has nothing to do with a video's own timeline — a bug that would not have been visible without running the pipeline against real footage. It was found and fixed during testing, and is the reason §9's loitering signal is measured in *video-time*, not processing time.

## 14. Assumptions & Constraints

- Demo/development uses recorded video or a webcam; live RTSP is supported by the ingestion code path but has not yet been exercised against a real camera.
- Current concurrency model (one thread per camera, in-process SQLite) is scoped for 2-4 simultaneous feeds — a real multi-site deployment would need a different ingestion/storage architecture (explicitly out of scope for this phase).
- Restricted-zone rectangles are defined per camera in pixel coordinates and must be redrawn for each camera's actual resolution — they do not automatically transfer between cameras or footage sources.
- Risk-scoring weights and the HIGH threshold are a starting calibration (§9), expected to be tuned per deployment site, not treated as fixed constants.

## 15. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Rule-based scoring can false-positive (e.g. a legitimate visitor lingering near a zone) | Alert fatigue, operator distrust | Every alert carries its full breakdown so an operator can dismiss/justify in seconds, not guess; weights are tunable, not fixed |
| Track ID switches on occlusion (two people crossing paths) | A single "loitering" duration could reset or merge incorrectly | Acceptable at hackathon/demo scale with ByteTrack; flagged as a candidate for Re-ID work if pursued (§5.2) |
| Low-light / night footage reduces detection accuracy | Missed detections exactly when after-hours risk is highest | Out of scope for this phase; noted as a real deployment constraint requiring IR-capable cameras or a low-light-tuned model |
| **Unbounded evidence-clip storage growth** | A file-based demo source loops indefinitely; left running, it will keep writing new clips and can silently consume significant disk space over days (observed directly during this project: an unattended demo instance accumulated ~1,900 clips / 500MB+ over several idle days) | No retention policy currently exists — flagged explicitly in §5.2 as required before any always-on deployment; short-term mitigation is to stop the process when not actively demoing |
| Single-machine, single-process deployment | No redundancy if the process crashes | Acceptable for a hackathon prototype; out of scope for this phase |

## 16. Roadmap (Advanced / Future Work)

1. Number-plate reading (ANPR/OCR) where footage resolution permits
2. Cross-camera tracking and authorized-person Re-ID
3. Scaling ingestion to a real multi-site RTSP camera fleet
4. Domain-specific custom-trained detection (abandoned objects, weapons)
5. Predictive analytics from historical incident patterns
6. Dashboard authentication and role-based access
7. Evidence-clip retention policy and automated storage lifecycle management

## 17. Appendix

**Repository layout:**
```
sih-surveillance/
├── backend/        main.py, camera_worker.py, risk.py, db.py, config.py
├── frontend/       index.html, app.js, style.css
├── sample_videos/  demo input clips
├── evidence_clips/ auto-generated incident clips
├── data/           surveillance.db
└── docs/           architecture.md, PRD.md (this document)
```

**Run it:**
```bash
source .venv/bin/activate
uvicorn backend.main:app --host 127.0.0.1 --port 8000
```
Open `http://127.0.0.1:8000`.

**Glossary:**
- **ByteTrack** — a multi-object tracking algorithm that links per-frame detections into persistent identities across frames, bundled with Ultralytics YOLO.
- **COCO classes** — the standard 80-category object taxonomy used by common pretrained detectors (person, car, etc.).
- **Track-time / video-time** — elapsed time as measured within the footage itself (`frame_index / fps`), as opposed to wall-clock processing time.
- **Evidence clip** — a short `.mp4` automatically saved from the buffered recent frames when a tracked object's risk score crosses the HIGH band.
