"""
SENSA CameraNode — RTSP stream reader + YOLOv8n inference loop.

One CameraNode per camera. Runs as an asyncio task.
Reconnects automatically on stream drop (exponential backoff).
Pushes every frame to the FrameBuffer for clip recording.
Sends detections to ZoneAlertNode for false-alarm filtering.
"""
import asyncio
import logging
import time
from typing import Optional

import cv2
import numpy as np
from ultralytics import YOLO

from core.zone_alert import ZoneAlertNode
from core.clip_recorder import FrameBuffer, ClipRecorder
from alerts.sender import AlertSender

log = logging.getLogger("SENSA.camera")

# YOLOv8n model — loaded once and shared across all camera nodes
_model: Optional[YOLO] = None

def get_model() -> YOLO:
    global _model
    if _model is None:
        log.info("Loading YOLOv8n model…")
        _model = YOLO("yolov8n.pt")
        log.info("YOLOv8n loaded.")
    return _model


# COCO class IDs — human detection on all plans, vehicle detection Pro/Business only
DETECT_CLASSES_BASIC  = {0: "person"}
DETECT_CLASSES_PRO    = {0: "person", 2: "car", 5: "bus", 7: "truck"}
DETECT_CLASSES = DETECT_CLASSES_PRO   # default

def get_detect_classes(plan: str) -> dict:
    return DETECT_CLASSES_PRO if plan in ("pro", "business") else DETECT_CLASSES_BASIC

# Reconnect backoff: 5s → 10s → 20s → … → 120s max
RECONNECT_DELAYS = [5, 10, 20, 40, 60, 120]


class CameraNode:
    def __init__(self, cam_cfg, agent_cfg, sender: AlertSender,
                 clip_rec: ClipRecorder, frame_buf: FrameBuffer):
        self.cam     = cam_cfg
        self.config  = agent_cfg
        self.sender  = sender
        self.clip_rec= clip_rec
        self.buf     = frame_buf
        self.zone_alert = ZoneAlertNode(cam_cfg)
        self._retry  = 0

    async def run(self):
        """Main loop — reconnects on failure."""
        while True:
            try:
                await self._stream_loop()
            except asyncio.CancelledError:
                log.info(f"{self.cam.name}: stopped.")
                break
            except Exception as e:
                delay = RECONNECT_DELAYS[min(self._retry, len(RECONNECT_DELAYS)-1)]
                log.warning(f"{self.cam.name}: error ({e}). Reconnecting in {delay}s…")
                self._retry += 1
                await asyncio.sleep(delay)

    async def _stream_loop(self):
        log.info(f"{self.cam.name}: connecting to {self.cam.rtsp_url[:40]}…")
        loop   = asyncio.get_event_loop()
        cap    = await loop.run_in_executor(None, self._open_cap)

        if not cap or not cap.isOpened():
            raise ConnectionError(f"Cannot open stream: {self.cam.rtsp_url[:40]}")

        self._retry = 0
        log.info(f"{self.cam.name}: connected ✓")

        frame_interval = 1.0 / self.cam.fps_target
        last_frame_time = 0.0

        while True:
            now = time.monotonic()
            if now - last_frame_time < frame_interval:
                await asyncio.sleep(0.02)
                continue

            ret, frame = await loop.run_in_executor(None, cap.read)
            if not ret:
                cap.release()
                raise ConnectionError("Stream ended")

            last_frame_time = now
            ts = time.time()

            # Push to frame buffer for clip recording
            await self.buf.push(frame, ts)

            # Run YOLOv8n inference in thread pool
            detections = await loop.run_in_executor(None, self._infer, frame)

            # Check zones and trigger alerts
            for det in detections:
                alert = self.zone_alert.check(det, ts)
                if alert:
                    asyncio.ensure_future(self._handle_alert(alert, frame, ts))

    def _open_cap(self):
        cap = cv2.VideoCapture(self.cam.rtsp_url, cv2.CAP_FFMPEG)
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        return cap

    def _infer(self, frame: np.ndarray) -> list[dict]:
        """Run YOLOv8n on frame. Returns list of detections."""
        try:
            model   = get_model()
            h, w    = frame.shape[:2]
            results = model(frame, classes=list(get_detect_classes(getattr(self.config,"plan","basic")).keys()),
                           conf=self.cam.confidence, verbose=False)
            detections = []
            for box in results[0].boxes:
                cls_id = int(box.cls[0])
                if cls_id not in DETECT_CLASSES:
                    continue
                x1, y1, x2, y2 = box.xyxy[0].tolist()
                detections.append({
                    "class_id":   cls_id,
                    "class_name": DETECT_CLASSES[cls_id],
                    "confidence": float(box.conf[0]),
                    "bbox": [x1/w, y1/h, x2/w, y2/h],   # normalised
                    "bbox_cx": ((x1+x2)/2) / w,
                    "bbox_cy": ((y1+y2)/2) / h,
                    "bbox_area": ((x2-x1)*(y2-y1)) / (w*h),
                })
            return detections
        except Exception as e:
            log.debug(f"Inference error: {e}")
            return []

    async def _handle_alert(self, alert: dict, frame: np.ndarray, ts: float):
        """Save snapshot, run ALPR if vehicle, record clip, send alert."""
        alert_id = alert["id"]

        # Snapshot
        snapshot_bytes = self._encode_snapshot(frame, alert)

        # ALPR for vehicles
        plate = None
        if alert["class_name"] in ("car", "bus", "truck"):
            try:
                from recognition.alpr import get_recognizer
                plate = await get_recognizer().recognize(frame, alert["bbox"])
            except Exception:
                pass

        alert["plate_number"] = plate

        # Send alert (WhatsApp + email + webhook + storage)
        await self.sender.send(alert, snapshot_bytes)

        # Record video clip in background
        asyncio.ensure_future(
            self.clip_rec.record_clip(
                alert_id=alert_id,
                camera_id=self.cam.id,
                camera_name=self.cam.name,
                alert_time=ts,
                frame_buffer=self.buf,
            )
        )

    def _encode_snapshot(self, frame: np.ndarray, alert: dict) -> bytes:
        """Draw bounding box on frame and encode as JPEG."""
        try:
            import cv2 as cv
            h, w = frame.shape[:2]
            x1, y1, x2, y2 = alert["bbox"]
            px1, py1 = int(x1*w), int(y1*h)
            px2, py2 = int(x2*w), int(y2*h)
            color = (244, 63, 94) if alert["class_name"] == "person" else (245, 158, 11)
            vis = frame.copy()
            cv.rectangle(vis, (px1,py1), (px2,py2), color, 2)
            label = f"{alert['class_name']} {alert['confidence']:.0%}"
            cv.putText(vis, label, (px1, py1-8), cv.FONT_HERSHEY_SIMPLEX, 0.5, color, 1)
            _, buf = cv.imencode(".jpg", vis, [cv.IMWRITE_JPEG_QUALITY, 85])
            return bytes(buf)
        except Exception:
            return b""
