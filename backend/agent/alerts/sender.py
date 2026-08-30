"""
SENSA AlertSender — delivers alerts via WhatsApp, email, webhook.
Handles offline queuing and all 3 storage modes.
"""
import asyncio
import json
import logging
import os
import time
import uuid
from pathlib import Path
from typing import Optional

import httpx

log = logging.getLogger("SENSA.sender")

TWILIO_SID    = os.getenv("TWILIO_SID", "")
TWILIO_AUTH   = os.getenv("TWILIO_AUTH", "")
TWILIO_WA_FROM= os.getenv("TWILIO_WA_FROM", "whatsapp:+14155238886")
SENDGRID_KEY  = os.getenv("SENDGRID_API_KEY", "")
FROM_EMAIL    = os.getenv("SENSA_FROM_EMAIL", "alerts@SENSA.io")

QUEUE_PATH = Path(os.getenv("SENSA_DATA_PATH", "/data")) / "alert_queue.jsonl"


class AlertSender:
    def __init__(self, config, storage_manager):
        self.config  = config
        self.storage = storage_manager
        self._queue_flush_task = None

    async def send(self, alert: dict, snapshot_bytes: bytes = b""):
        """
        Send alert via all configured channels.
        Saves snapshot, uploads if needed, then delivers notifications.
        """
        # Store snapshot and get URL
        snapshot_url = await self.storage.save_snapshot(
            alert_id=alert["id"],
            camera_id=alert["camera_id"],
            data=snapshot_bytes,
        )
        alert["snapshot_url"] = snapshot_url

        # Post alert to cloud API (for dashboard + WebSocket push)
        await self._post_to_api(alert)

        # Build message
        plate_line = f"\n🚗 Plate: *{alert['plate_number']}*" if alert.get("plate_number") else ""
        msg = (
            f"⚠ *SENSA ALERT*\n\n"
            f"📷 Camera: *{alert['camera_name']}*\n"
            f"📍 Zone: *{alert['zone_name']}*\n"
            f"🔍 Detected: *{alert['class_name']}* "
            f"({alert['confidence']:.0%} confidence){plate_line}\n\n"
            f"🕐 {_fmt_time(alert['triggered_at'])}"
        )

        # Webhook

        # Email
        if self.config.alert_email:
            asyncio.ensure_future(self._send_email(alert, msg, snapshot_url))

        # Webhook
        if self.config.alert_webhook:
            asyncio.ensure_future(self._send_webhook(alert))

    async def _post_to_api(self, alert: dict):
        """Post alert to cloud API for dashboard display and WebSocket push."""
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                await client.post(
                    f"{self.config.api_url}/api/v1/alerts",
                    headers={"X-API-KEY": self.config.api_key},
                    json={
                        "id":           alert["id"],
                        "camera_id":    alert["camera_id"],
                        "camera_name":  alert["camera_name"],
                        "zone_id":      alert["zone_id"],
                        "zone_name":    alert["zone_name"],
                        "class_name":   alert["class_name"],
                        "confidence":   alert["confidence"],
                        "snapshot_url": alert.get("snapshot_url"),
                        "triggered_at": alert["triggered_at"],
                        "bbox":         alert.get("bbox"),
                        "bbox_cx":      alert.get("bbox_cx"),
                        "bbox_cy":      alert.get("bbox_cy"),
                        "plate_number": alert.get("plate_number"),
                    },
                )
        except Exception as e:
            log.debug(f"API post failed (queued): {e}")
            self._enqueue(alert)

    def _enqueue(self, alert: dict):
        """Save alert to local queue for retry when network recovers."""
        try:
            with open(QUEUE_PATH, "a") as f:
                f.write(json.dumps(alert) + "\n")
        except Exception:
            pass

    async def _send_email(self, alert: dict, text: str, snapshot_url: Optional[str]):
        if not SENDGRID_KEY or not self.config.alert_email:
            return
        html = f"""
        <div style="font-family:monospace;background:#020609;color:#d0ecff;padding:24px;max-width:500px">
          <div style="color:#f43f5e;font-size:20px;font-weight:700">⚠ SENSA ALERT</div>
          <div style="margin:14px 0;color:#4f7aa0;line-height:1.8">{text.replace(chr(10),'<br>').replace('*','')}</div>
          {"<img src='"+snapshot_url+"' style='width:100%;margin-top:14px'>" if snapshot_url else ""}
        </div>"""
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                await client.post(
                    "https://api.sendgrid.com/v3/mail/send",
                    json={
                        "personalizations": [{"to": [{"email": self.config.alert_email}]}],
                        "from": {"email": FROM_EMAIL, "name": "SENSA Security"},
                        "subject": f"🚨 {alert['class_name'].title()} detected — {alert['camera_name']}",
                        "content": [{"type": "text/html", "value": html}],
                    },
                    headers={"Authorization": f"Bearer {SENDGRID_KEY}"},
                )
        except Exception as e:
            log.warning(f"Email send failed: {e}")

    async def _send_webhook(self, alert: dict):
        if not self.config.alert_webhook:
            return
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                await client.post(
                    self.config.alert_webhook,
                    json=alert,
                    headers={"Content-Type": "application/json"},
                )
        except Exception as e:
            log.debug(f"Webhook failed: {e}")


def _fmt_time(ts: float) -> str:
    from datetime import datetime, timezone
    return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%d %b %Y, %H:%M:%S UTC")
