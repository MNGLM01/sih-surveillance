"""Owns the fleet of cameras: builds one isolated CameraContext per camera
(own detector, tracker, behavior history, incident dedup state, zones), and
starts/stops/restarts each one on its own thread so cameras run concurrently
and one camera's failure can't take another down (see camera_worker.py's
retry/backoff for the per-camera fault handling).
"""
import sys
import threading
from dataclasses import dataclass
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))
from behavior import BehaviorEngine
from camera_worker import STATUS_STOPPED, CameraWorker
from detector import Detector
from incident import IncidentManager
from schemas import Zone
from tracker import Tracker


@dataclass
class CameraContext:
    """Everything one camera's pipeline run needs, and nothing another
    camera's run should ever read or write."""
    camera_id: str
    name: str
    source: str
    lat: float
    lon: float
    zones: list[Zone]
    detector: Detector
    tracker: Tracker
    behavior_engine: BehaviorEngine
    incident_manager: IncidentManager
    evidence: object = None  # set once fps is known, by CameraWorker
    status: str = STATUS_STOPPED
    error: str | None = None


def build_camera_context(cfg: dict) -> CameraContext:
    detector = Detector()
    zones = [Zone(name=z["name"], rect_norm=z["rect_norm"]) for z in cfg.get("zones", [])]
    return CameraContext(
        camera_id=cfg["id"],
        name=cfg["name"],
        source=cfg["source"],
        lat=cfg["lat"],
        lon=cfg["lon"],
        zones=zones,
        detector=detector,
        tracker=Tracker(cfg["id"], detector),
        behavior_engine=BehaviorEngine(),
        incident_manager=IncidentManager(),
    )


class CameraService:
    """start_camera/stop_camera/restart_camera/get_camera_status/start_all/
    stop_all - the lifecycle surface main.py drives."""

    def __init__(self, camera_configs, pipeline, on_frame=None, on_event=None, on_incident=None, on_incident_evidence=None):
        self.pipeline = pipeline
        self.on_frame = on_frame
        self.on_event = on_event
        self.on_incident = on_incident
        self.on_incident_evidence = on_incident_evidence
        self.contexts: dict[str, CameraContext] = {cfg["id"]: build_camera_context(cfg) for cfg in camera_configs}
        self._workers: dict[str, CameraWorker] = {}
        self._threads: dict[str, threading.Thread] = {}

    def start_camera(self, camera_id: str):
        thread = self._threads.get(camera_id)
        if thread is not None and thread.is_alive():
            return
        context = self.contexts[camera_id]
        worker = CameraWorker(
            context, self.pipeline,
            on_frame=self.on_frame, on_event=self.on_event,
            on_incident=self.on_incident, on_incident_evidence=self.on_incident_evidence,
        )
        self._workers[camera_id] = worker
        thread = threading.Thread(target=worker.run, daemon=True, name=f"camera-{camera_id}")
        self._threads[camera_id] = thread
        thread.start()

    def stop_camera(self, camera_id: str):
        worker = self._workers.get(camera_id)
        if worker:
            worker.stop()

    def restart_camera(self, camera_id: str, join_timeout: float = 5.0):
        self.stop_camera(camera_id)
        thread = self._threads.get(camera_id)
        if thread:
            thread.join(timeout=join_timeout)
        self.start_camera(camera_id)

    def get_camera_status(self, camera_id: str) -> dict:
        context = self.contexts.get(camera_id)
        if context is None:
            return {"camera_id": camera_id, "status": "UNKNOWN", "error": "not configured"}
        return {"camera_id": camera_id, "status": context.status, "error": context.error}

    def start_all(self):
        for camera_id in self.contexts:
            self.start_camera(camera_id)

    def stop_all(self):
        for camera_id in list(self._workers):
            self.stop_camera(camera_id)
