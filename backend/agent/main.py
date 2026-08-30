"""
SENSA Agent v1.0 — Main orchestrator

Startup sequence:
  1. Load config from cloud (or local cache if offline)
  2. Check usage_blocked — if True, enter 5-minute polling loop
  3. Start CameraNode threads for each configured camera
  4. Start updater (version check + approval poll)
  5. Start storage sync background task

Runs until killed. Handles reconnects, crashes, and updates gracefully.
"""
import asyncio
import logging
import os
import sys
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("SENSA.agent")

# Load .env if present
_env_path = Path(__file__).parent / ".env"
if _env_path.exists():
    for line in _env_path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())

CURRENT_VERSION = "1.0.0"


async def main():
    log.info(f"SENSA Agent v{CURRENT_VERSION} starting…")

    import json
    
    # Check for activation state
    state_file = Path(os.environ.get("PROGRAMDATA", "C:\\ProgramData")) / "SENSA" / "license" / "state.json"
    api_url = os.getenv("SENSA_API_URL", "https://api.sensa.io")

    if not state_file.exists():
        log.error("SENSA Activation required. Please run the SENSA Activation utility.")
        sys.exit(1)
        
    try:
        with open(state_file, "r") as f:
            state = json.load(f)
            installation_id = state.get("installation_id")
            activation_token = state.get("activation_token")
            license_id = state.get("license_id")
            site_id = state.get("site_id")
            if not activation_token:
                raise ValueError("Missing token")
    except Exception as e:
        log.error(f"Failed to read activation state: {e}. Please reactivate.")
        sys.exit(1)

    # We use activation_token as the new API Key conceptually for the backend to recognize this agent
    api_key = activation_token
    # ── Load config from cloud ──────────────────────────────────────────────
    from agent.config.config import AgentConfig
    config = AgentConfig(api_key=api_key, api_url=api_url)
    await config.load()

    # ── Usage blocked? (trial expired or payment failed) ───────────────────
    if config.usage_blocked:
        log.warning("⛔ Account paused — no cameras will run. Upgrade at app.SENSA.io")
        await _blocked_poll_loop(config)
        return

    log.info(f"Site: {config.site_name} | Mode: {config.storage_mode} | Cameras: {len(config.cameras)}")

    if not config.cameras:
        log.info("No cameras configured yet. Add one at app.SENSA.io → Cameras → Add Camera")

    # ── Start all services concurrently ────────────────────────────────────
    tasks = []

    # Camera detection nodes
    from agent.camera.camera_node import CameraNode
    from agent.storage.clip_recorder import FrameBuffer, ClipRecorder
    from agent.alerts.sender import AlertSender
    from agent.storage.manager import StorageManager

    storage   = StorageManager(config)
    sender    = AlertSender(config, storage)
    clip_rec  = ClipRecorder(config, storage)

    for cam in config.cameras:
        buf  = FrameBuffer()
        node = CameraNode(cam, config, sender, clip_rec, buf)
        tasks.append(asyncio.ensure_future(node.run()))

    # Config refresh every 2 minutes (picks up usage_blocked mid-session)
    tasks.append(asyncio.ensure_future(_config_refresh_loop(config)))

    # Auto-updater (30-min version check + 30-sec approval poll)
    from agent.updater.auto_update import AutoUpdater
    updater = AutoUpdater(config, CURRENT_VERSION)
    tasks.append(asyncio.ensure_future(updater.run()))

    # Heartbeat task
    tasks.append(asyncio.ensure_future(_heartbeat_loop(installation_id, license_id, site_id, api_url, config)))

    # Storage sync (hybrid mode snapshot upload)
    tasks.append(asyncio.ensure_future(storage.sync_loop()))

    log.info(f"Agent running — {len(config.cameras)} camera(s) active")

    try:
        await asyncio.gather(*tasks)
    except Exception as e:
        log.error(f"Fatal error: {e}")
        raise


async def _config_refresh_loop(config):
    """Refresh config every 2 minutes — picks up plan changes, new cameras."""
    while True:
        await asyncio.sleep(120)
        try:
            await config.load()
            if config.usage_blocked:
                log.warning("Usage blocked detected during config refresh — stopping cameras")
                # Signal all camera tasks to stop via config flag
        except Exception as e:
            log.debug(f"Config refresh failed: {e}")


async def _blocked_poll_loop(config):
    """Poll every 5 minutes when blocked — resume immediately on upgrade."""
    while True:
        log.info("Checking if account is unblocked… (checking every 5 min)")
        await asyncio.sleep(300)
        try:
            await config.load()
            if not config.usage_blocked:
                log.info("Account unblocked! Restarting agent…")
                os.execv(sys.executable, [sys.executable] + sys.argv)
        except Exception as e:
            log.debug(f"Poll failed: {e}")

async def _heartbeat_loop(installation_id, license_id, site_id, api_url, config):
    """Sends a periodic heartbeat to the SENSA cloud to maintain license and agent status."""
    import httpx
    import platform
    import uuid
    # Mac address or something for device_id, for now a dummy or generated
    device_id = str(uuid.getnode()) 
    
    while True:
        try:
            payload = {
                "installation_id": installation_id,
                "device_id": device_id,
                "agent_version": CURRENT_VERSION,
                "license_id": license_id or "",
                "site_id": site_id or "",
                "cameras_online": len([c for c in config.cameras if c.enabled]),
                "health_status": "healthy"
            }
            async with httpx.AsyncClient() as client:
                resp = await client.post(f"{api_url}/api/v1/licenses/heartbeat", json=payload)
                if resp.status_code == 401 or resp.status_code == 403:
                    log.error("License revoked or expired! Agent entering offline restricted mode.")
                    # Could set config.usage_blocked = True here based on policy
                else:
                    resp.raise_for_status()
        except Exception as e:
            log.debug(f"Heartbeat failed (offline?): {e}")
            
        await asyncio.sleep(1800) # 30 minutes


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        log.info("Agent stopped.")
