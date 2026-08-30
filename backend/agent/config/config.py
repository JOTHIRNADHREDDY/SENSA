"""
SENSA Agent Config — pulls site configuration from cloud API.
Falls back to local JSON cache if the network is unavailable.
"""
import json
import logging
import os
from pathlib import Path
from typing import Optional

import httpx

log = logging.getLogger("SENSA.config")

CACHE_PATH = Path(os.getenv("SENSA_DATA_PATH", "/data")) / "config.json"


class CameraConfig:
    def __init__(self, data: dict):
        from cryptography.fernet import Fernet
        key     = os.getenv("SENSA_FERNET_KEY", "").encode()
        fernet  = Fernet(key) if key else None
        rtsp_raw = data.get("rtsp_url", "")
        if fernet and rtsp_raw:
            try:
                self.rtsp_url = fernet.decrypt(rtsp_raw.encode()).decode()
            except Exception:
                self.rtsp_url = rtsp_raw
        else:
            self.rtsp_url = rtsp_raw

        self.id           = data.get("id", "")
        self.name         = data.get("name", "Camera")
        self.fps_target   = data.get("fps_target", 5)
        self.confidence   = data.get("confidence", 0.65)
        self.enabled      = data.get("enabled", True)
        self.zones        = data.get("zones", [])


class AgentConfig:
    def __init__(self, api_key: str, api_url: str):
        self.api_key      = api_key
        self.api_url      = api_url.rstrip("/")
        self.site_id      = ""
        self.site_name    = "My Site"
        self.storage_mode = "hybrid"
        self.usage_blocked = False
        self.plan = "starter"
        self.human_detection = True
        self.vehicle_detection = False
        self.night_detection = False
        self.cameras: list[CameraConfig] = []
        self.snapshot_path = str(Path(os.getenv("SENSA_DATA_PATH", "/data")) / "snapshots")
        self.sync_delay_hours = 48
        self.manual_updates   = True
        Path(self.snapshot_path).mkdir(parents=True, exist_ok=True)

    async def load(self):
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                r = await client.get(
                    f"{self.api_url}/api/v1/sites/config",
                    headers={"X-API-KEY": self.api_key},
                )
                r.raise_for_status()
                data = r.json()
                self._apply(data)
                self._save_cache(data)
        except Exception as e:
            log.warning(f"Config load failed ({e}), using cache")
            self._load_cache()

    def _apply(self, data: dict):
        self.site_id       = data.get("site_id", self.site_id)
        self.site_name     = data.get("site_name", self.site_name)
        self.storage_mode  = data.get("storage_mode", self.storage_mode)
        self.usage_blocked = data.get("usage_blocked", False)
        self.plan          = data.get("plan", self.plan)
        capabilities       = data.get("capabilities", {})
        self.human_detection = capabilities.get("human_detection", True)
        self.vehicle_detection = capabilities.get("vehicle_detection", False)
        self.night_detection = capabilities.get("night_detection", False)
        self.manual_updates = data.get("manual_updates", True)
        self.sync_delay_hours = data.get("sync_delay_hours", 48)
        self.cameras = [
            CameraConfig(c) for c in data.get("cameras", [])
            if c.get("enabled", True)
        ]

    def _save_cache(self, data: dict):
        try:
            CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
            CACHE_PATH.write_text(json.dumps(data))
        except Exception:
            pass

    def _load_cache(self):
        try:
            if CACHE_PATH.exists():
                self._apply(json.loads(CACHE_PATH.read_text()))
        except Exception:
            pass
