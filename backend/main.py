import asyncio
import sys
import os
from datetime import datetime, timezone
from pathlib import Path

import cv2
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles

sys.path.insert(0, str(Path(__file__).parent))
from config import BASE_DIR, CAMERAS, EVIDENCE_DIR, ANPR_EVIDENCE_DIR, discover_cameras
import config
from pipeline import SurveillancePipeline
from schemas import IncidentStatus
from services.camera_service import CameraService
import db

FRONTEND_DIR = BASE_DIR / "frontend"
LIVE_DIR = FRONTEND_DIR / "live"
LIVE_DIR.mkdir(parents=True, exist_ok=True)
EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
ANPR_EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)

VALID_INCIDENT_STATUSES = {
    IncidentStatus.NEW, IncidentStatus.ACKNOWLEDGED, IncidentStatus.INVESTIGATING,
    IncidentStatus.VERIFIED, IncidentStatus.FALSE_POSITIVE, IncidentStatus.RESOLVED,
}

app = FastAPI()

CONNECTIONS: list[WebSocket] = []
MAIN_LOOP: asyncio.AbstractEventLoop | None = None
LATEST_JPEG_FRAMES: dict[str, bytes] = {}
CAMERA_SERVICE: CameraService | None = None

# Per-camera WebSocket frame subscribers for binary streaming
FRAME_SUBSCRIBERS: dict[str, set[WebSocket]] = {}


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


async def _push_frame_to_subscribers(camera_id: str, data: bytes):
    """Push binary JPEG frame to all WebSocket subscribers for a camera."""
    subs = FRAME_SUBSCRIBERS.get(camera_id)
    if not subs:
        return
    dead = []
    for ws in subs:
        try:
            await ws.send_bytes(data)
        except Exception:
            dead.append(ws)
    for ws in dead:
        subs.discard(ws)


def on_frame(camera_id, annotated_frame):
    # Downscale for streaming — much faster JPEG encode + smaller payload
    h, w = annotated_frame.shape[:2]
    max_w = config.STREAM_MAX_WIDTH
    if w > max_w:
        scale = max_w / w
        stream_frame = cv2.resize(annotated_frame, (max_w, int(h * scale)), interpolation=cv2.INTER_AREA)
    else:
        stream_frame = annotated_frame

    ok, buf = cv2.imencode(".jpg", stream_frame, [cv2.IMWRITE_JPEG_QUALITY, config.STREAM_JPEG_QUALITY])
    if not ok:
        return

    data = buf.tobytes()
    LATEST_JPEG_FRAMES[camera_id] = data

    # Push binary frame to all WebSocket subscribers (zero-copy, no HTTP overhead)
    has_ws_subs = bool(FRAME_SUBSCRIBERS.get(camera_id))
    if MAIN_LOOP and has_ws_subs:
        asyncio.run_coroutine_threadsafe(_push_frame_to_subscribers(camera_id, data), MAIN_LOOP)

    # Only write to disk if no WS subscribers (fallback for HTTP polling)
    if not has_ws_subs:
        try:
            target = LIVE_DIR / f"{camera_id}.jpg"
            tmp_path = LIVE_DIR / f"{camera_id}_tmp.jpg"
            with open(tmp_path, "wb") as f:
                f.write(data)
            os.replace(str(tmp_path), str(target))
        except Exception:
            pass



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


def on_anpr(camera_id, anpr_result):
    """ANPR callback: insert to DB, broadcast via WebSocket, save evidence image."""
    evidence_path = None
    if anpr_result.evidence_image is not None:
        try:
            img_name = f"{camera_id}_{anpr_result.track_id}_{anpr_result.plate_number}_{int(anpr_result.timestamp)}.jpg"
            img_name = img_name.replace(":", "-")  # sanitize track_id colons
            img_path = ANPR_EVIDENCE_DIR / img_name
            cv2.imwrite(str(img_path), anpr_result.evidence_image)
            evidence_path = str(img_path)
        except Exception:
            pass

    row_id = db.insert_anpr_detection(
        camera_id=camera_id,
        track_id=anpr_result.track_id,
        vehicle_type=anpr_result.vehicle_type,
        plate_number=anpr_result.plate_number,
        raw_ocr_text=anpr_result.raw_ocr_text,
        ocr_confidence=anpr_result.ocr_confidence,
        plate_detection_confidence=anpr_result.plate_detection_confidence,
        consensus_score=anpr_result.consensus_score,
        vehicle_bbox=anpr_result.vehicle_bbox,
        plate_bbox=anpr_result.plate_bbox,
        timestamp=datetime.now(timezone.utc).isoformat(),
        evidence_image_path=evidence_path,
        validation_status=anpr_result.validation_status,
    )
    if row_id is not None:
        broadcast_threadsafe({
            "type": "anpr_detection",
            "data": {
                "id": row_id,
                "camera_id": camera_id,
                "track_id": anpr_result.track_id,
                "vehicle_type": anpr_result.vehicle_type,
                "plate_number": anpr_result.plate_number,
                "ocr_confidence": anpr_result.ocr_confidence,
                "consensus_score": anpr_result.consensus_score,
                "validation_status": anpr_result.validation_status,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            },
        })


@app.on_event("startup")
def startup():
    global MAIN_LOOP, CAMERA_SERVICE
    MAIN_LOOP = asyncio.get_event_loop()
    active_cameras = discover_cameras(4)
    db.init_db(active_cameras)
    CAMERA_SERVICE = CameraService(
        active_cameras, SurveillancePipeline(),
        on_frame=on_frame, on_event=on_event,
        on_incident=on_incident, on_incident_evidence=on_incident_evidence,
        on_anpr=on_anpr,
    )
    CAMERA_SERVICE.start_all()


@app.on_event("shutdown")
def shutdown():
    if CAMERA_SERVICE:
        CAMERA_SERVICE.stop_all()


@app.get("/live/{camera_id}.jpg")
def get_live_frame(camera_id: str):
    data = LATEST_JPEG_FRAMES.get(camera_id)
    if data:
        return Response(
            content=data,
            media_type="image/jpeg",
            headers={"Cache-Control": "no-cache, no-store, must-revalidate", "Pragma": "no-cache", "Expires": "0"}
        )
    target = LIVE_DIR / f"{camera_id}.jpg"
    if target.exists():
        return FileResponse(
            str(target),
            media_type="image/jpeg",
            headers={"Cache-Control": "no-cache, no-store, must-revalidate"}
        )
    return Response(status_code=404)


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


@app.get("/anpr")
def get_anpr_detections(camera_id: str | None = None, since: str | None = None):
    return db.list_anpr_detections(camera_id=camera_id, since=since)


@app.get("/anpr/search")
def search_anpr(plate: str, camera_id: str | None = None):
    return db.search_anpr_plate(plate, camera_id=camera_id)


@app.get("/anpr/evidence/{filename}")
def get_anpr_evidence(filename: str):
    target = ANPR_EVIDENCE_DIR / filename
    if target.exists():
        return FileResponse(str(target), media_type="image/jpeg")
    return Response(status_code=404)


@app.websocket("/ws/stream/{camera_id}")
async def ws_stream(websocket: WebSocket, camera_id: str):
    """Binary frame streaming WebSocket: pushes raw JPEG bytes per frame.
    Much faster than HTTP polling — no request overhead, no connection setup."""
    await websocket.accept()
    if camera_id not in FRAME_SUBSCRIBERS:
        FRAME_SUBSCRIBERS[camera_id] = set()
    FRAME_SUBSCRIBERS[camera_id].add(websocket)
    try:
        while True:
            await websocket.receive_text()  # keep-alive
    except WebSocketDisconnect:
        FRAME_SUBSCRIBERS.get(camera_id, set()).discard(websocket)


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
