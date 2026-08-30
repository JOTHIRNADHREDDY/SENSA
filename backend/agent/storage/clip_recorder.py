"""
SENSA Video Clip Recorder

When an alert fires, captures a 10-second video clip centred on the detection
moment (5 seconds before + 5 seconds after) using FFmpeg.

This gives customers video evidence, not just a snapshot.
Works in all 3 storage modes:
  Local  — clip saved to /data/clips/YYYY-MM-DD/camera_id/alert_id.mp4
  Hybrid — clip saved locally, synced to R2 after 48h
  Cloud  — clip uploaded to R2 immediately, URL included in alert

Architecture:
  CameraNode maintains a circular frame buffer (last 150 frames @ 5 FPS = 30s)
  When an alert fires, the buffer is flushed to FFmpeg to produce the clip.
  This runs in a background thread to avoid blocking the detection loop.
"""
import asyncio
import logging
import os
import subprocess
import tempfile
import time
import uuid
from collections import deque
from pathlib import Path
from typing import Optional

import cv2
import numpy as np

log = logging.getLogger("SENSA.clip")

CLIP_PRE_SECONDS  = 5     # seconds of footage BEFORE the alert
CLIP_POST_SECONDS = 5     # seconds of footage AFTER the alert
CLIP_FPS          = 5     # frames per second stored in buffer
BUFFER_SECONDS    = 35    # total ring buffer size (must be > pre + post)
BUFFER_MAX_FRAMES = BUFFER_SECONDS * CLIP_FPS   # 175 frames


class FrameBuffer:
    """
    Thread-safe circular frame buffer.
    CameraNode pushes every inference frame here.
    ClipRecorder reads from it when an alert fires.
    """
    def __init__(self):
        self._frames: deque = deque(maxlen=BUFFER_MAX_FRAMES)
        self._lock = asyncio.Lock()

    async def push(self, frame: np.ndarray, timestamp: float):
        async with self._lock:
            self._frames.append((timestamp, frame.copy()))

    async def get_clip_frames(
        self, alert_time: float
    ) -> list[tuple[float, np.ndarray]]:
        """
        Returns frames in the window [alert_time - pre, alert_time + post].
        We return pre-alert frames immediately (already in buffer) and wait
        for post-alert frames.
        """
        async with self._lock:
            start = alert_time - CLIP_PRE_SECONDS
            end   = alert_time + CLIP_POST_SECONDS
            return [
                (ts, frame) for ts, frame in self._frames
                if start <= ts <= end
            ]


class ClipRecorder:
    """
    Records a video clip from the frame buffer when an alert fires.
    Saves as H.264 MP4 to local disk, then optionally uploads to R2.
    """
    def __init__(self, config, storage_manager):
        self.config  = config
        self.storage = storage_manager
        self.clips_dir = Path(config.snapshot_path).parent / "clips"
        self.clips_dir.mkdir(parents=True, exist_ok=True)

    async def record_clip(
        self,
        alert_id: str,
        camera_id: str,
        camera_name: str,
        alert_time: float,
        frame_buffer: FrameBuffer,
    ) -> Optional[str]:
        """
        Wait for post-alert frames, then encode clip.
        Returns local file path (or R2 URL in cloud mode).
        """
        # Wait for post-alert footage to accumulate
        await asyncio.sleep(CLIP_POST_SECONDS + 1.0)

        frames = await frame_buffer.get_clip_frames(alert_time)
        if len(frames) < 5:
            log.warning(f"Not enough frames for clip (got {len(frames)})")
            return None

        # Encode in background thread
        local_path = await asyncio.get_event_loop().run_in_executor(
            None,
            self._encode_clip,
            alert_id, camera_id, frames
        )

        if not local_path:
            return None

        log.info(f"Clip saved: {local_path} ({len(frames)} frames)")

        # Upload to R2 if cloud/hybrid mode
        mode = self.config.storage_mode
        if mode == "cloud":
            return await self._upload_clip(alert_id, camera_id, local_path)
        elif mode == "hybrid":
            # Queue for delayed upload — same as snapshot sync
            asyncio.ensure_future(self._delayed_upload(alert_id, camera_id, local_path))

        return local_path

    def _encode_clip(
        self,
        alert_id: str,
        camera_id: str,
        frames: list[tuple[float, np.ndarray]],
    ) -> Optional[str]:
        """Encode frames to H.264 MP4 using OpenCV VideoWriter."""
        try:
            from datetime import datetime
            date_str = datetime.now().strftime("%Y-%m-%d")
            out_dir  = self.clips_dir / date_str / camera_id
            out_dir.mkdir(parents=True, exist_ok=True)
            out_path = str(out_dir / f"{alert_id}.mp4")

            h, w = frames[0][1].shape[:2]
            fourcc = cv2.VideoWriter_fourcc(*"mp4v")
            writer = cv2.VideoWriter(out_path, fourcc, CLIP_FPS, (w, h))

            for ts, frame in frames:
                writer.write(frame)

            writer.release()

            # Re-encode with FFmpeg for better H.264 compression if available
            self._try_ffmpeg_reencode(out_path)

            return out_path
        except Exception as e:
            log.error(f"Clip encode error: {e}")
            return None

    def _try_ffmpeg_reencode(self, path: str):
        """Re-encode with FFmpeg for better compression (optional)."""
        try:
            tmp = path + ".tmp.mp4"
            result = subprocess.run([
                "ffmpeg", "-y", "-i", path,
                "-c:v", "libx264", "-preset", "fast",
                "-crf", "28", "-movflags", "+faststart",
                tmp
            ], capture_output=True, timeout=30)
            if result.returncode == 0 and os.path.exists(tmp):
                os.replace(tmp, path)
        except (subprocess.TimeoutExpired, FileNotFoundError):
            pass  # ffmpeg not available — keep OpenCV output

    async def _upload_clip(self, alert_id: str, camera_id: str, local_path: str) -> str:
        """Upload clip to Cloudflare R2 and return presigned URL."""
        try:
            from datetime import datetime
            date_str = datetime.now().strftime("%Y/%m/%d")
            key = f"sites/{self.config.site_id}/clips/{date_str}/{camera_id}/{alert_id}.mp4"
            clip_bytes = Path(local_path).read_bytes()

            loop = asyncio.get_event_loop()
            url = await loop.run_in_executor(
                None,
                lambda: self.storage._upload_to_r2(key, clip_bytes, "video/mp4"),
            )
            return url
        except Exception as e:
            log.warning(f"Clip R2 upload failed: {e}")
            return local_path

    async def _delayed_upload(self, alert_id: str, camera_id: str, local_path: str):
        """Upload clip after delay (hybrid mode)."""
        await asyncio.sleep(self.config.sync_delay_hours * 3600)
        await self._upload_clip(alert_id, camera_id, local_path)
