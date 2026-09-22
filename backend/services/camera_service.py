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
import config
import db
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
    anpr_engine: object = None  # ANPREngine or None if disabled
    evidence: object = None  # set once fps is known, by CameraWorker
    status: str = STATUS_STOPPED
    error: str | None = None
    is_restricted: bool = False


def build_camera_context(cfg: dict) -> CameraContext:
    try:
        detector = Detector()
    except Exception as exc:
        if ("out of memory" in str(exc).lower() or "cuda" in str(exc).lower()) and getattr(config, "YOLO_DEVICE", "cpu") != "cpu":
            import logging
            logging.getLogger("camera_service").warning(
                "Failed to initialize detector for camera %s on %s: %s; falling back to CPU",
                cfg.get("id"), getattr(config, "YOLO_DEVICE", "cuda"), exc,
            )
            config.YOLO_DEVICE = "cpu"
            detector = Detector()
        else:
            raise
    try:
        db_zones = db.get_camera_zones(cfg["id"])
    except Exception:
        db_zones = None
    raw_zones = db_zones if db_zones is not None else cfg.get("zones", [])
    zones = [Zone(name=z["name"], rect_norm=tuple(z["rect_norm"])) for z in raw_zones]


    try:
        is_restricted = db.get_camera_restricted(cfg["id"])
    except Exception:
        is_restricted = bool(cfg.get("is_restricted", False))

    anpr_engine = None
    if config.ANPR_ENABLED:
        from anpr import ANPREngine
        config.ANPR_EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
        anpr_engine = ANPREngine(
            plate_model_path=config.ANPR_PLATE_MODEL_PATH,
            plate_confidence=config.ANPR_PLATE_CONFIDENCE,
            ocr_confidence_threshold=config.ANPR_OCR_CONFIDENCE,
            min_consensus_readings=config.ANPR_MIN_CONSENSUS_READINGS,
            max_track_history=config.ANPR_MAX_TRACK_HISTORY,
            frame_interval=config.ANPR_FRAME_INTERVAL,
            save_evidence=config.ANPR_EVIDENCE_IMAGES,
            evidence_dir=config.ANPR_EVIDENCE_DIR,
        )

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
        anpr_engine=anpr_engine,
        is_restricted=is_restricted,
    )



class CameraService:
    """start_camera/stop_camera/restart_camera/get_camera_status/start_all/
    stop_all - the lifecycle surface main.py drives."""

    def __init__(self, camera_configs, pipeline, on_frame=None, on_event=None, on_incident=None, on_incident_evidence=None, on_anpr=None):
        self.pipeline = pipeline
        self.on_frame = on_frame
        self.on_event = on_event
        self.on_incident = on_incident
        self.on_incident_evidence = on_incident_evidence
        self.on_anpr = on_anpr
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
            on_anpr=self.on_anpr,
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

    def update_zones(self, camera_id: str, zones: list[Zone]):
        context = self.contexts.get(camera_id)
        if context:
            context.zones = zones

    def set_camera_restricted(self, camera_id: str, is_restricted: bool):
        context = self.contexts.get(camera_id)
        if context:
            context.is_restricted = is_restricted


    def stop_all(self):
        for camera_id in list(self._workers):
            self.stop_camera(camera_id)
