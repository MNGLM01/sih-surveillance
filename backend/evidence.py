"""Per-camera evidence clip buffering: pre-event ring buffer + post-event
continuation, so a saved clip shows what led up to an incident and what
happened right after, not just the few seconds before the trigger fired.
"""
from collections import deque
from pathlib import Path

import cv2

import config


class EvidenceBuffer:
    """One instance per camera - the ring buffer and any in-flight clip are
    that camera's own state, never shared with another camera."""

    def __init__(self, fps: float, pre_seconds: float = config.EVIDENCE_PRE_SECONDS,
                 post_seconds: float = config.EVIDENCE_POST_SECONDS):
        self.fps = fps
        self.post_frames_needed = max(1, int(fps * post_seconds))
        self._pre = deque(maxlen=max(1, int(fps * pre_seconds)))
        self._pending: dict | None = None

    def append(self, frame):
        self._pre.append(frame)
        if self._pending is not None:
            self._pending["frames"].append(frame)
            self._pending["remaining"] -= 1
            if self._pending["remaining"] <= 0:
                self._flush_pending()

    def trigger(self, path: Path, on_saved=None) -> bool:
        """Starts a clip: everything already in the pre-buffer, plus frames
        still to come. Returns False without starting a second clip if one
        is already in flight.
        ponytail: one pending clip per camera - a second HIGH crossing while
        the first clip is still recording is dropped rather than queued.
        Add a small queue if overlapping incidents turn out to be common."""
        if self._pending is not None:
            return False
        self._pending = {"path": path, "frames": list(self._pre), "remaining": self.post_frames_needed, "on_saved": on_saved}
        if self._pending["remaining"] <= 0:
            self._flush_pending()
        return True

    def _flush_pending(self):
        pending = self._pending
        self._pending = None
        saved = self._write_clip(pending["path"], pending["frames"])
        if saved and pending["on_saved"]:
            pending["on_saved"](pending["path"])

    def _write_clip(self, path: Path, frames: list) -> bool:
        if not frames:
            return False
        h, w = frames[0].shape[:2]
        writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"mp4v"), self.fps, (w, h))
        for f in frames:
            writer.write(f)
        writer.release()
        return True


def demo():
    """Self-check: trigger() captures pre-buffer frames immediately and keeps
    appending until post_frames_needed more frames arrive, then flushes once."""
    import tempfile

    import numpy as np

    buf = EvidenceBuffer(fps=10, pre_seconds=0.2, post_seconds=0.3)  # 2 pre, 3 post
    frame = np.zeros((4, 4, 3), dtype=np.uint8)
    for _ in range(2):
        buf.append(frame)

    saved_paths = []
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "clip.mp4"
        assert buf.trigger(path, on_saved=saved_paths.append)
        assert not buf.trigger(Path(tmp) / "second.mp4"), "a second trigger while one is pending must be rejected"
        assert not saved_paths, "must not flush before post frames arrive"
        for _ in range(3):
            buf.append(frame)
        assert saved_paths == [path]
        assert path.exists() and path.stat().st_size > 0

    print("evidence.py self-check passed")


if __name__ == "__main__":
    demo()
