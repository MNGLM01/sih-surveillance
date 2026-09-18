import asyncio
import sys
from datetime import datetime, timezone
from pathlib import Path

import cv2
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

sys.path.insert(0, str(Path(__file__).parent))
from config import BASE_DIR, CAMERAS, EVIDENCE_DIR
from pipeline import SurveillancePipeline
from schemas import IncidentStatus
from services.camera_service import CameraService
import db

FRONTEND_DIR = BASE_DIR / "frontend"
LIVE_DIR = FRONTEND_DIR / "live"
LIVE_DIR.mkdir(parents=True, exist_ok=True)
EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)

VALID_INCIDENT_STATUSES = {
    IncidentStatus.NEW, IncidentStatus.ACKNOWLEDGED, IncidentStatus.INVESTIGATING,
    IncidentStatus.VERIFIED, IncidentStatus.FALSE_POSITIVE, IncidentStatus.RESOLVED,
}

app = FastAPI()

CONNECTIONS: list[WebSocket] = []
MAIN_LOOP: asyncio.AbstractEventLoop | None = None
CAMERA_SERVICE: CameraService | None = None


async def broadcast(message: dict):
    dead = []
    for ws in CONNECTIONS:
        try:
            await ws.send_json(message)
        except Exception:
            dead.append(ws)
    for ws in dead:
        CONNECTIONS.remove(ws)


def broadcast_threadsafe(message: dict):
    """Camera worker threads call this - never touch the asyncio loop directly."""
    if MAIN_LOOP:
        asyncio.run_coroutine_threadsafe(broadcast(message), MAIN_LOOP)


def on_frame(camera_id, annotated_frame):
    cv2.imwrite(str(LIVE_DIR / f"{camera_id}.jpg"), annotated_frame)


def on_event(camera_id, track_id, cls_name, score, breakdown):
    """Preserves the original events table/WS payload exactly, for the
    existing dashboard. Evidence saving is now async (pre+post buffered), so
    this returns where to write the clip and what to call once it lands,
    instead of blocking on it."""
    event_id = db.insert_event(
        camera_id, track_id, cls_name, score, breakdown,
        datetime.now(timezone.utc).isoformat(),
    )
    broadcast_threadsafe({
        "type": "event",
        "event_id": event_id,
        "camera_id": camera_id,
        "track_id": track_id,
        "object_class": cls_name,
        "score": score,
        "breakdown": breakdown,
    })

    evidence_path = EVIDENCE_DIR / f"{event_id}.mp4"

    def on_saved(path):
        db.update_event_evidence(event_id, path)

    return evidence_path, on_saved


def _incident_payload(incident) -> dict:
    return {
        "incident_id": incident.incident_id,
        "camera_id": incident.camera_id,
        "track_id": incident.track_id,
        "object_class": incident.object_class,
        "severity": incident.severity,
        "risk_score": incident.risk_score,
        "status": incident.status,
        "reasons": incident.reasons,
    }


def on_incident(incident, is_new):
    """New, additive: a correlated incident (dedup'd, with a lifecycle),
    separate from the legacy per-crossing `events` row on_event still writes."""
    if is_new:
        incident.incident_id = db.insert_incident(incident)
        broadcast_threadsafe({"type": "incident_created", "data": _incident_payload(incident)})
    else:
        db.update_incident(incident)
        broadcast_threadsafe({"type": "incident_updated", "data": _incident_payload(incident)})
    return incident.incident_id


def on_incident_evidence(incident_id, path):
    db.update_incident_evidence(incident_id, path)


@app.on_event("startup")
def startup():
    global MAIN_LOOP, CAMERA_SERVICE
    MAIN_LOOP = asyncio.get_event_loop()
    db.init_db(CAMERAS)
    CAMERA_SERVICE = CameraService(
        CAMERAS, SurveillancePipeline(),
        on_frame=on_frame, on_event=on_event,
        on_incident=on_incident, on_incident_evidence=on_incident_evidence,
    )
    CAMERA_SERVICE.start_all()


@app.on_event("shutdown")
def shutdown():
    if CAMERA_SERVICE:
        CAMERA_SERVICE.stop_all()


@app.get("/cameras")
def get_cameras():
    cams = db.list_cameras()
    if CAMERA_SERVICE:
        for cam in cams:
            cam["status"] = CAMERA_SERVICE.get_camera_status(cam["id"])["status"]
    return cams


@app.get("/cameras/{camera_id}/status")
def get_camera_status(camera_id: str):
    if not CAMERA_SERVICE:
        return {"error": "camera service not started"}
    return CAMERA_SERVICE.get_camera_status(camera_id)


@app.post("/cameras/{camera_id}/restart")
def restart_camera(camera_id: str):
    if not CAMERA_SERVICE:
        return {"error": "camera service not started"}
    CAMERA_SERVICE.restart_camera(camera_id)
    return CAMERA_SERVICE.get_camera_status(camera_id)


@app.get("/events")
def get_events(camera_id: str | None = None, since: str | None = None):
    return db.list_events(camera_id=camera_id, since=since)


@app.get("/evidence/{event_id}.mp4")
def get_evidence(event_id: int):
    events = db.list_events()
    match = next((e for e in events if e["id"] == event_id), None)
    if not match or not match["evidence_path"]:
        return {"error": "not found"}
    return FileResponse(match["evidence_path"], media_type="video/mp4")


@app.get("/incidents")
def get_incidents(camera_id: str | None = None, status: str | None = None):
    return db.list_incidents(camera_id=camera_id, status=status)


@app.patch("/incidents/{incident_id}")
def patch_incident_status(incident_id: int, status: str):
    if status not in VALID_INCIDENT_STATUSES:
        return {"error": f"invalid status, must be one of {sorted(VALID_INCIDENT_STATUSES)}"}
    db.update_incident_status(incident_id, status)
    updated = db.get_incident(incident_id)
    broadcast_threadsafe({"type": "incident_updated", "data": updated})
    return updated


@app.websocket("/ws/live")
async def ws_live(websocket: WebSocket):
    await websocket.accept()
    CONNECTIONS.append(websocket)
    try:
        while True:
            await websocket.receive_text()  # keep-alive; client doesn't need to send anything meaningful
    except WebSocketDisconnect:
        if websocket in CONNECTIONS:
            CONNECTIONS.remove(websocket)


app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
