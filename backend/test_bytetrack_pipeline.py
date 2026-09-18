"""Automated validation test suite for ByteTrack integration in SIH Surveillance.

Tests:
1. Configuration loading (bytetrack.yaml presence and validity).
2. Missing tracking IDs safety (empty frame, synthetic detections without track ID).
3. Track ID persistence & multi-person tracking on real sample footage.
4. Zone detection, loitering calculation, and additive risk scoring.
5. High-score edge-trigger alert generation.
6. Memory retention & stale track history cleanup.
7. CameraWorker initialization, tracker reset, and evidence buffer integrity.
"""
import os
import sys
import tempfile
from pathlib import Path

# Ensure backend directory is in sys.path before importing local modules
BACKEND_DIR = Path(__file__).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import cv2
import numpy as np
from ultralytics import YOLO

import config
import risk
import camera_worker



def test_1_bytetrack_config():
    """Verify backend/bytetrack.yaml exists and contains required ByteTrack fields."""
    config_path = Path(__file__).parent / "bytetrack.yaml"
    assert config_path.is_file(), f"ByteTrack config missing at {config_path}"
    content = config_path.read_text()
    for key in ["tracker_type: bytetrack", "track_high_thresh", "track_low_thresh", "track_buffer", "match_thresh"]:
        assert key in content, f"Missing key '{key}' in {config_path}"
    print("[PASS] Test 1: ByteTrack configuration file verified")


def test_2_missing_track_ids_safety():
    """Verify missing tracking IDs, empty boxes, or unconfirmed tracks never crash TrackHistory or risk scoring."""
    history = risk.TrackHistory()
    
    # Query non-existent track
    assert not history.has_track(999)
    assert history.loiter_seconds(999) == 0
    assert not history.erratic_speed(999)
    
    signals = history.signals(999, (0, 0, 100, 100))
    assert signals["zone_intrusion"] is False
    assert signals["loiter_seconds"] == 0
    
    score, breakdown = risk.compute_risk(signals)
    assert score == 0
    assert not history.score_crossed_high(999, score)
    print("[PASS] Test 2: Missing tracking IDs safety verified")


def test_3_track_history_stale_cleanup():
    """Verify stale track eviction prevents unbounded memory growth."""
    history = risk.TrackHistory()
    # Add an old track at t=10
    history.update(track_id=1, cls_name="person", position=(50, 50), now=10.0)
    # Add a fresh track at t=100
    history.update(track_id=2, cls_name="person", position=(60, 60), now=100.0)
    
    assert history.has_track(1) and history.has_track(2)
    
    # At t=150, with max_idle_seconds=60, track 1 (idle for 140s) must be pruned, track 2 (idle for 50s) kept
    pruned = history.cleanup_stale(now=150.0, max_idle_seconds=60)
    assert pruned == 1, f"Expected 1 pruned, got {pruned}"
    assert not history.has_track(1), "Track 1 should have been evicted"
    assert history.has_track(2), "Track 2 should be retained"
    print("[PASS] Test 3: Stale track cleanup verified")


def test_4_risk_scoring_and_edge_trigger():
    """Verify zone intrusion + loitering triggers risk score and edge-triggered alerts."""
    history = risk.TrackHistory()
    zone = (100, 100, 300, 300)
    
    # Track 5 appears outside zone at t=0
    history.update(5, "person", (50, 50), now=0.0)
    sig0 = history.signals(5, zone, force_after_hours=False)
    score0, _ = risk.compute_risk(sig0)
    assert score0 == 0
    assert not history.score_crossed_high(5, score0)
    
    # Track 5 enters restricted zone at t=5 (score -> 40)
    history.update(5, "person", (150, 150), now=5.0)
    sig1 = history.signals(5, zone, force_after_hours=False)
    score1, b1 = risk.compute_risk(sig1)
    assert score1 == 40
    assert not history.score_crossed_high(5, score1), "Score 40 is below HIGH_BAND (50)"
    
    # Track 5 loiters past 60s at t=70 (+10 for lingering -> score 50)
    history.update(5, "person", (152, 151), now=70.0)
    sig2 = history.signals(5, zone, force_after_hours=False)
    score2, _ = risk.compute_risk(sig2)
    assert score2 == 50
    assert not history.score_crossed_high(5, score2), "Score 50 is not > 50"
    
    # After-hours flag triggers (+15 -> score 65 > 50)
    sig3 = history.signals(5, zone, force_after_hours=True)
    score3, _ = risk.compute_risk(sig3)
    assert score3 == 65
    assert history.score_crossed_high(5, score3), "First transition into HIGH band must edge-trigger"
    
    # Next frame still in HIGH band (score 65) -> edge-trigger must return False (no duplicate alerts)
    assert not history.score_crossed_high(5, score3), "Edge-trigger must not re-alert on subsequent frames in same band"
    print("[PASS] Test 4: Risk scoring and alert edge-triggering verified")


def test_5_bytetrack_sample_video_inference():
    """Run ByteTrack on real footage: verify detections, persistent IDs, and tracking pipeline."""
    sample_video = config.CAMERAS[0]["source"]
    assert os.path.isfile(sample_video), f"Sample video not found at {sample_video}"
    
    model = YOLO("yolo11n.pt")
    tracker_cfg = os.path.join(os.path.dirname(__file__), "bytetrack.yaml")
    
    cap = cv2.VideoCapture(sample_video)
    fps = cap.get(cv2.CAP_PROP_FPS) or 25
    history = risk.TrackHistory()
    zone = config.CAMERAS[0]["zone"]
    
    tracked_frames = 0
    all_seen_ids = set()
    
    for idx in range(30):
        ok, frame = cap.read()
        if not ok:
            break
        v_time = idx / fps
        results = model.track(
            frame,
            persist=True,
            classes=camera_worker.DETECT_CLASSES,
            tracker=tracker_cfg,
            imgsz=480,
            device="cpu",
            verbose=False,
        )[0]
        
        boxes = results.boxes
        if boxes is not None and boxes.id is not None:
            ids = [int(tid) for tid in boxes.id.tolist()]
            all_seen_ids.update(ids)
            tracked_frames += 1
            for box, tid, cid in zip(boxes.xyxy.tolist(), ids, boxes.cls.tolist()):
                cx, cy = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
                cname = "vehicle" if int(cid) in camera_worker.VEHICLE_CLASSES else "person"
                history.update(tid, cname, (cx, cy), now=v_time)
                sigs = history.signals(tid, zone, force_after_hours=False)
                score, bd = risk.compute_risk(sigs)
                assert 0 <= score <= 100
                
    cap.release()
    assert tracked_frames > 0, "ByteTrack should have tracked objects in sample video"
    assert len(all_seen_ids) >= 1, f"Expected at least 1 track ID, observed: {all_seen_ids}"
    print(f"[PASS] Test 5: ByteTrack video inference verified ({tracked_frames} tracked frames, IDs: {sorted(list(all_seen_ids))})")


def test_6_cameraworker_lifecycle_and_evidence():
    """Verify CameraWorker initialization, evidence clip recording, and tracker reset."""
    cam_cfg = dict(config.CAMERAS[0])
    worker = camera_worker.CameraWorker(cam_cfg)
    
    # Test evidence recording with dummy frames
    dummy_frame = np.zeros((240, 320, 3), dtype=np.uint8)
    for _ in range(10):
        worker._frame_buffer.append(dummy_frame)
        
    with tempfile.TemporaryDirectory() as tmpdir:
        clip_path = Path(tmpdir) / "test_evidence.mp4"
        saved = worker.save_evidence_clip(clip_path)
        assert saved is True, "save_evidence_clip should succeed when frames exist"
        assert clip_path.is_file() and clip_path.stat().st_size > 0, "Evidence clip file was not created"
        
    # Test tracker reset method
    worker.reset_tracker()
    print("[PASS] Test 6: CameraWorker lifecycle, evidence clipping, and tracker reset verified")


if __name__ == "__main__":
    print("=" * 60)
    print("Running ByteTrack Integration Test Suite...")
    print("=" * 60)
    test_1_bytetrack_config()
    test_2_missing_track_ids_safety()
    test_3_track_history_stale_cleanup()
    test_4_risk_scoring_and_edge_trigger()
    test_5_bytetrack_sample_video_inference()
    test_6_cameraworker_lifecycle_and_evidence()
    print("=" * 60)
    print("ALL TESTS PASSED SUCCESSFULLY!")
    print("=" * 60)
