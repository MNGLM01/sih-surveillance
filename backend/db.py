import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "data" / "surveillance.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS cameras (
    id TEXT PRIMARY KEY, name TEXT, source TEXT, lat REAL, lon REAL, zones_json TEXT
);
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    camera_id TEXT, track_id INTEGER, object_class TEXT,
    score INTEGER, breakdown_json TEXT,
    started_at TEXT, ended_at TEXT,
    evidence_path TEXT,
    FOREIGN KEY(camera_id) REFERENCES cameras(id)
);
CREATE TABLE IF NOT EXISTS incidents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    camera_id TEXT, track_id TEXT, object_class TEXT,
    risk_score INTEGER, severity TEXT, status TEXT,
    created_at TEXT, updated_at TEXT,
    reasons_json TEXT, evidence_path TEXT,
    FOREIGN KEY(camera_id) REFERENCES cameras(id)
);
CREATE TABLE IF NOT EXISTS anpr_detections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    camera_id TEXT,
    track_id TEXT,
    vehicle_type TEXT,
    plate_number TEXT,
    raw_ocr_text TEXT,
    ocr_confidence REAL,
    plate_detection_confidence REAL,
    consensus_score REAL,
    vehicle_bbox TEXT,
    plate_bbox TEXT,
    timestamp TEXT,
    evidence_image_path TEXT,
    validation_status TEXT,
    FOREIGN KEY(camera_id) REFERENCES cameras(id)
);
CREATE INDEX IF NOT EXISTS idx_anpr_plate ON anpr_detections(plate_number);
CREATE INDEX IF NOT EXISTS idx_anpr_camera ON anpr_detections(camera_id);
CREATE INDEX IF NOT EXISTS idx_anpr_timestamp ON anpr_detections(timestamp);
"""


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db(cameras):
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = get_conn()
    conn.executescript(SCHEMA)
    for cam in cameras:
        conn.execute(
            "INSERT OR REPLACE INTO cameras (id, name, source, lat, lon, zones_json) VALUES (?, ?, ?, ?, ?, ?)",
            (cam["id"], cam["name"], cam["source"], cam["lat"], cam["lon"], json.dumps(cam["zones"])),
        )
    conn.commit()
    conn.close()


def list_cameras():
    conn = get_conn()
    rows = [dict(r) for r in conn.execute("SELECT * FROM cameras")]
    conn.close()
    for r in rows:
        r["zones"] = json.loads(r.pop("zones_json"))
    return rows


# --- events (legacy, score-crossing observations - unchanged shape for the existing dashboard) ---

def insert_event(camera_id, track_id, object_class, score, breakdown, started_at, evidence_path=None):
    conn = get_conn()
    cur = conn.execute(
        """INSERT INTO events (camera_id, track_id, object_class, score, breakdown_json, started_at, ended_at, evidence_path)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (camera_id, track_id, object_class, score, json.dumps(breakdown), started_at, started_at, evidence_path),
    )
    conn.commit()
    event_id = cur.lastrowid
    conn.close()
    return event_id


def update_event_evidence(event_id, evidence_path):
    conn = get_conn()
    conn.execute("UPDATE events SET evidence_path = ? WHERE id = ?", (str(evidence_path), event_id))
    conn.commit()
    conn.close()


def list_events(camera_id=None, since=None):
    query = "SELECT * FROM events"
    clauses, params = [], []
    if camera_id:
        clauses.append("camera_id = ?")
        params.append(camera_id)
    if since:
        clauses.append("started_at >= ?")
        params.append(since)
    if clauses:
        query += " WHERE " + " AND ".join(clauses)
    query += " ORDER BY started_at DESC"
    conn = get_conn()
    rows = [dict(r) for r in conn.execute(query, params)]
    conn.close()
    for r in rows:
        r["breakdown"] = json.loads(r.pop("breakdown_json"))
    return rows


# --- incidents (correlated security situations, with a lifecycle - separate from raw events) ---

def insert_incident(incident) -> int:
    conn = get_conn()
    cur = conn.execute(
        """INSERT INTO incidents (camera_id, track_id, object_class, risk_score, severity, status, created_at, updated_at, reasons_json, evidence_path)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (incident.camera_id, incident.track_id, incident.object_class, incident.risk_score, incident.severity,
         incident.status, incident.created_at, incident.updated_at, json.dumps(incident.reasons), incident.evidence_path),
    )
    conn.commit()
    incident_id = cur.lastrowid
    conn.close()
    return incident_id


def update_incident(incident):
    conn = get_conn()
    conn.execute(
        "UPDATE incidents SET risk_score = ?, severity = ?, status = ?, updated_at = ?, reasons_json = ?, evidence_path = ? WHERE id = ?",
        (incident.risk_score, incident.severity, incident.status, incident.updated_at,
         json.dumps(incident.reasons), incident.evidence_path, incident.incident_id),
    )
    conn.commit()
    conn.close()


def update_incident_evidence(incident_id, evidence_path):
    conn = get_conn()
    conn.execute("UPDATE incidents SET evidence_path = ? WHERE id = ?", (str(evidence_path), incident_id))
    conn.commit()
    conn.close()


def update_incident_status(incident_id, status):
    conn = get_conn()
    conn.execute(
        "UPDATE incidents SET status = ?, updated_at = ? WHERE id = ?",
        (status, datetime.now(timezone.utc).isoformat(), incident_id),
    )
    conn.commit()
    conn.close()


def get_incident(incident_id):
    conn = get_conn()
    row = conn.execute("SELECT * FROM incidents WHERE id = ?", (incident_id,)).fetchone()
    conn.close()
    if row is None:
        return None
    result = dict(row)
    result["reasons"] = json.loads(result.pop("reasons_json"))
    return result


def list_incidents(camera_id=None, status=None):
    query = "SELECT * FROM incidents"
    clauses, params = [], []
    if camera_id:
        clauses.append("camera_id = ?")
        params.append(camera_id)
    if status:
        clauses.append("status = ?")
        params.append(status)
    if clauses:
        query += " WHERE " + " AND ".join(clauses)
    query += " ORDER BY created_at DESC"
    conn = get_conn()
    rows = [dict(r) for r in conn.execute(query, params)]
    conn.close()
    for r in rows:
        r["reasons"] = json.loads(r.pop("reasons_json"))
    return rows


# --- ANPR detections ---

def insert_anpr_detection(
    camera_id, track_id, vehicle_type, plate_number, raw_ocr_text,
    ocr_confidence, plate_detection_confidence, consensus_score,
    vehicle_bbox, plate_bbox, timestamp, evidence_image_path, validation_status,
) -> int | None:
    """Insert an ANPR detection. Returns the row id, or None if a duplicate
    (same camera + track + plate) already exists."""
    conn = get_conn()
    existing = conn.execute(
        "SELECT id FROM anpr_detections WHERE camera_id = ? AND track_id = ? AND plate_number = ?",
        (camera_id, track_id, plate_number),
    ).fetchone()
    if existing:
        conn.close()
        return None  # duplicate
    cur = conn.execute(
        """INSERT INTO anpr_detections
           (camera_id, track_id, vehicle_type, plate_number, raw_ocr_text,
            ocr_confidence, plate_detection_confidence, consensus_score,
            vehicle_bbox, plate_bbox, timestamp, evidence_image_path, validation_status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (camera_id, track_id, vehicle_type, plate_number, raw_ocr_text,
         ocr_confidence, plate_detection_confidence, consensus_score,
         json.dumps(vehicle_bbox), json.dumps(plate_bbox), timestamp,
         evidence_image_path, validation_status),
    )
    conn.commit()
    row_id = cur.lastrowid
    conn.close()
    return row_id


def list_anpr_detections(camera_id=None, since=None, limit=100):
    query = "SELECT * FROM anpr_detections"
    clauses, params = [], []
    if camera_id:
        clauses.append("camera_id = ?")
        params.append(camera_id)
    if since:
        clauses.append("timestamp >= ?")
        params.append(since)
    if clauses:
        query += " WHERE " + " AND ".join(clauses)
    query += " ORDER BY timestamp DESC LIMIT ?"
    params.append(limit)
    conn = get_conn()
    rows = [dict(r) for r in conn.execute(query, params)]
    conn.close()
    for r in rows:
        if r.get("vehicle_bbox"):
            r["vehicle_bbox"] = json.loads(r["vehicle_bbox"])
        if r.get("plate_bbox"):
            r["plate_bbox"] = json.loads(r["plate_bbox"])
    return rows


def search_anpr_plate(plate_query, camera_id=None, limit=50):
    """Search ANPR detections by plate number (partial, case-insensitive)."""
    query = "SELECT * FROM anpr_detections WHERE plate_number LIKE ?"
    params = [f"%{plate_query.upper()}%"]
    if camera_id:
        query += " AND camera_id = ?"
        params.append(camera_id)
    query += " ORDER BY timestamp DESC LIMIT ?"
    params.append(limit)
    conn = get_conn()
    rows = [dict(r) for r in conn.execute(query, params)]
    conn.close()
    for r in rows:
        if r.get("vehicle_bbox"):
            r["vehicle_bbox"] = json.loads(r["vehicle_bbox"])
        if r.get("plate_bbox"):
            r["plate_bbox"] = json.loads(r["plate_bbox"])
    return rows


def demo():
    import tempfile

    global DB_PATH
    orig = DB_PATH
    with tempfile.TemporaryDirectory() as tmp:
        DB_PATH = Path(tmp) / "test.db"
        init_db([{"id": "cam1", "name": "Test", "source": "x.mp4", "lat": 1.0, "lon": 2.0,
                  "zones": [{"name": "Zone", "rect_norm": (0, 0, 1, 1)}]}])

        eid = insert_event("cam1", 5, "person", 80, ["Zone intrusion: +40"], "2026-01-01T00:00:00")
        cams = list_cameras()
        events = list_events(camera_id="cam1")
        assert len(cams) == 1 and cams[0]["zones"][0]["name"] == "Zone"
        assert len(events) == 1 and events[0]["id"] == eid and events[0]["score"] == 80

        class _FakeIncident:
            incident_id = None
            camera_id, track_id, object_class = "cam1", "cam1:P-5", "person"
            risk_score, severity, status = 80, "HIGH", "NEW"
            created_at = updated_at = "2026-01-01T00:00:00"
            reasons = ["Zone intrusion: +40"]
            evidence_path = None

        inc = _FakeIncident()
        incident_id = insert_incident(inc)
        inc.incident_id = incident_id
        inc.risk_score = 90
        update_incident(inc)
        update_incident_status(incident_id, "ACKNOWLEDGED")

        fetched = get_incident(incident_id)
        assert fetched["risk_score"] == 90 and fetched["status"] == "ACKNOWLEDGED"
        assert len(list_incidents(camera_id="cam1")) == 1
    DB_PATH = orig
    print("db.py self-check passed")


if __name__ == "__main__":
    demo()
