"""FastAPI contract tests. `TestClient` never triggers FastAPI's lifespan
without a `with` block (verified against the installed fastapi/starlette),
so `main.startup()` - which would build real Detector/YOLO instances and
spawn camera threads - never runs here. These are pure REST-contract tests
against a controlled temp DB, not an integration test of the live pipeline
(that was verified separately by running camera_worker.py against the
sample video).
"""
import sys
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

import db  # noqa: E402

db.DB_PATH = Path(tempfile.mkdtemp()) / "test_api.db"  # must precede importing main

import main  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from schemas import Incident, IncidentStatus  # noqa: E402


class TestApi(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(main.app)
        db.init_db([{
            "id": "cam1", "name": "Main Gate", "source": "x.mp4", "lat": 1.0, "lon": 2.0,
            "zones": [{"name": "Z", "rect_norm": (0, 0, 1, 1)}],
        }])

    def test_get_cameras_returns_configured_camera(self):
        resp = self.client.get("/cameras")
        self.assertEqual(resp.status_code, 200)
        cams = resp.json()
        self.assertEqual(len(cams), 1)
        self.assertEqual(cams[0]["id"], "cam1")

    def test_events_roundtrip(self):
        db.insert_event(
            "cam1", "cam1:P-1", "person", 55,
            ["Zone intrusion (Z): +40", "After-hours (22:00-06:00): +15"],
            datetime.now(timezone.utc).isoformat(),
        )
        resp = self.client.get("/events", params={"camera_id": "cam1"})
        self.assertEqual(resp.status_code, 200)
        events = resp.json()
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]["score"], 55)

    def test_evidence_not_found_for_unknown_event(self):
        resp = self.client.get("/evidence/999999.mp4")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("error", resp.json())

    def test_incident_create_list_and_status_patch(self):
        incident = Incident(
            incident_id=None, camera_id="cam1", track_id="cam1:P-9", object_class="person",
            risk_score=82, severity="HIGH", status=IncidentStatus.NEW,
            created_at=datetime.now(timezone.utc).isoformat(),
            updated_at=datetime.now(timezone.utc).isoformat(),
            reasons=["Zone intrusion (Z): +40", "Loitering 3min: +25", "After-hours (22:00-06:00): +15"],
        )
        incident_id = db.insert_incident(incident)

        resp = self.client.get("/incidents", params={"camera_id": "cam1"})
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(any(i["id"] == incident_id for i in resp.json()))

        patch_resp = self.client.patch(f"/incidents/{incident_id}", params={"status": "ACKNOWLEDGED"})
        self.assertEqual(patch_resp.status_code, 200)
        self.assertEqual(patch_resp.json()["status"], "ACKNOWLEDGED")

    def test_incident_patch_rejects_invalid_status(self):
        resp = self.client.patch("/incidents/1", params={"status": "NOT_A_REAL_STATUS"})
        self.assertEqual(resp.status_code, 200)
        self.assertIn("error", resp.json())


if __name__ == "__main__":
    unittest.main()
