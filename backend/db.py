import json
import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "data" / "surveillance.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS cameras (
    id TEXT PRIMARY KEY, name TEXT, source TEXT, lat REAL, lon REAL, zone_json TEXT
);
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    camera_id TEXT, track_id INTEGER, object_class TEXT,
    score INTEGER, breakdown_json TEXT,
    started_at TEXT, ended_at TEXT,
    evidence_path TEXT,
    FOREIGN KEY(camera_id) REFERENCES cameras(id)
);
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
            "INSERT OR REPLACE INTO cameras (id, name, source, lat, lon, zone_json) VALUES (?, ?, ?, ?, ?, ?)",
            (cam["id"], cam["name"], cam["source"], cam["lat"], cam["lon"], json.dumps(cam["zone"])),
        )
    conn.commit()
    conn.close()


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


def list_cameras():
    conn = get_conn()
    rows = [dict(r) for r in conn.execute("SELECT * FROM cameras")]
    conn.close()
    for r in rows:
        r["zone"] = json.loads(r.pop("zone_json"))
    return rows


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


def demo():
    import tempfile

    global DB_PATH
    orig = DB_PATH
    with tempfile.TemporaryDirectory() as tmp:
        DB_PATH = Path(tmp) / "test.db"
        init_db([{"id": "cam1", "name": "Test", "source": "x.mp4", "lat": 1.0, "lon": 2.0, "zone": (0, 0, 10, 10)}])
        eid = insert_event("cam1", 5, "person", 80, ["Zone intrusion: +40"], "2026-01-01T00:00:00")
        cams = list_cameras()
        events = list_events(camera_id="cam1")
        assert len(cams) == 1 and cams[0]["zone"] == [0, 0, 10, 10]
        assert len(events) == 1 and events[0]["id"] == eid and events[0]["score"] == 80
    DB_PATH = orig
    print("db.py self-check passed")


if __name__ == "__main__":
    demo()
