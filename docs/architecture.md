# AI-Powered Real-Time Video Surveillance — Solution & Architecture

## 1. Problem Summary

Manual CCTV monitoring doesn't scale: operators can't watch every feed continuously, risky events get missed in real time, and footage review only happens after the fact. Security teams need a system that watches every feed simultaneously and surfaces only what actually needs a human's attention.

## 2. Proposed Architecture

```
Camera Feed(s) [file / webcam / RTSP]
        |
        v
Ingestion Thread (per camera, ring-buffered)
        |
        v
YOLO Detection (person / vehicle) + ByteTrack (persistent IDs)
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

## 3. Core Modules

- **Ingestion** — opens each camera source (file, webcam, or RTSP — same `VideoCapture` call for all three), one thread per camera.
- **Detection + Tracking** — pretrained YOLO11n detects people/vehicles; ByteTrack (bundled with the detector) assigns persistent IDs across frames.
- **Event/Risk Engine** — derives zone intrusion and loitering directly from each track's position history, then combines signals into a transparent score.
- **Storage** — SQLite holds camera config and score-crossing incidents (not every frame — only events).
- **API** — FastAPI serves camera/event REST endpoints and a WebSocket for live alert push.
- **Dashboard** — map with camera pins colored by current risk, live annotated video, real-time alert feed, event history with evidence clip playback.

## 4. MVP vs. Advanced Features

**MVP (built and demoed):**
- Person + vehicle detection and multi-object tracking
- Restricted-zone intrusion detection
- Loitering detection
- Explainable, auditable risk scoring
- Real-time alerts over WebSocket
- Map + dashboard with camera locations and live incidents
- Evidence clips auto-saved on high-risk events

**Advanced / future work:**
- Automatic number-plate reading (ANPR/OCR) where footage permits
- Cross-camera tracking / authorized-person Re-ID
- Live multi-site RTSP fleet ingestion at scale
- Custom-trained models for domain-specific objects (e.g. abandoned bags, weapons)
- Predictive analytics from historical incident patterns

## 5. Example User Journey

An operator opens the dashboard and sees camera pins on a map, colored by current risk level. At 11pm, a person enters a restricted zone near the main gate and lingers. The system's risk engine combines "zone intrusion" (+40) and "after-hours" (+15) into a score of 55 — crossing the alert threshold. The operator sees a real-time alert with the exact score breakdown and a short evidence clip, without having had to watch that camera at all.

## 6. Tech Stack & Why

| Layer | Choice | Why |
|---|---|---|
| Detection + Tracking | Ultralytics YOLO11n + bundled ByteTrack | Pretrained — no training data or time needed; ByteTrack ships with the same library, no separate Re-ID/embedding dependency |
| Backend | FastAPI + uvicorn | Single process serves REST + WebSocket + static files, async-native |
| Storage | SQLite | Zero-ops, file-based, plenty for demo scale (2-4 cameras) |
| Frontend | Vanilla HTML/JS + Leaflet | No build step — nothing to break on a judge's wifi |
| Concurrency | One thread per camera | 2-4 demo feeds don't need a distributed worker fleet |

## 7. Key Differentiator

Unlike black-box AI alerting, every risk score here is a transparent sum of named, weighted factors — auditable by a human operator, not a mystery output. An operator (or an inquiry afterward) can see exactly why an incident was flagged: which zone, how long, what time, what kind of movement.
