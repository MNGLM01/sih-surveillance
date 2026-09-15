import asyncio
import json
import sys
import threading
from datetime import datetime, timezone
from pathlib import Path

import cv2
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

sys.path.insert(0, str(Path(__file__).parent))
from config import CAMERAS
from camera_worker import CameraWorker
import db

BASE_DIR = Path(__file__).parent.parent
FRONTEND_DIR = BASE_DIR / "frontend"
EVIDENCE_DIR = BASE_DIR / "evidence_clips"
LIVE_DIR = FRONTEND_DIR / "live"
LIVE_DIR.mkdir(parents=True, exist_ok=True)
EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI()

CONNECTIONS: list[WebSocket] = []
MAIN_LOOP: asyncio.AbstractEventLoop | None = None
WORKERS: list[CameraWorker] = []


async def broadcast(message: dict):
    dead = []
    for ws in CONNECTIONS:
        try:
            await ws.send_json(message)
        except Exception:
            dead.append(ws)
    for ws in dead:
        CONNECTIONS.remove(ws)


def on_frame(camera_id, annotated_frame):
    cv2.imwrite(
        str(LIVE_DIR / f"{camera_id}.jpg"),
        annotated_frame,
        [cv2.IMWRITE_JPEG_QUALITY, 80],
    )


def on_event(camera_id, track_id, cls_name, score, breakdown, save_evidence):
    event_id = db.insert_event(
        camera_id, track_id, cls_name, score, breakdown,
        datetime.now(timezone.utc).isoformat(),
    )
    evidence_path = EVIDENCE_DIR / f"{event_id}.mp4"
    if save_evidence(evidence_path):
        conn = db.get_conn()
        conn.execute("UPDATE events SET evidence_path = ? WHERE id = ?", (str(evidence_path), event_id))
        conn.commit()
        conn.close()

    payload = {
        "type": "event",
        "event_id": event_id,
        "camera_id": camera_id,
        "track_id": track_id,
        "object_class": cls_name,
        "score": score,
        "breakdown": breakdown,
    }
    if MAIN_LOOP:
        asyncio.run_coroutine_threadsafe(broadcast(payload), MAIN_LOOP)


@app.on_event("startup")
def startup():
    global MAIN_LOOP
    MAIN_LOOP = asyncio.get_event_loop()
    db.init_db(CAMERAS)
    for cam_cfg in CAMERAS:
        worker = CameraWorker(cam_cfg, on_frame=on_frame, on_event=on_event)
        WORKERS.append(worker)
        threading.Thread(target=worker.run, daemon=True).start()


@app.get("/cameras")
def get_cameras():
    return db.list_cameras()


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
