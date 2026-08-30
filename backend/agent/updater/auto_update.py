"""
SENSA AutoUpdater v2 — manual-by-default updates with instant notification pickup.

Two checks run on different cadences:
  1. Every 30 min: /api/agent/version — detects a new version exists at all,
     which is what triggers the backend to fire the one-time WhatsApp/email
     notification (see backend/api/updates.py::create_update_notification).
  2. Every 30 sec (only when a newer version is known and manual_updates=True):
     /api/agent/update-approved — checks whether the user clicked "Update Now"
     in the dashboard. The moment that flag flips, the agent installs within
     seconds rather than the user waiting for the next 30-minute cycle.

Security patches always install immediately regardless of manual_updates.
"""
import asyncio
import logging
import os
import sys
from packaging.version import Version

import httpx

log = logging.getLogger("SENSA.updater")

API_BASE = os.getenv("SENSA_API_URL", "https://api.SENSA.io")
VERSION_CHECK_INTERVAL = 1800   # 30 minutes — "is there a new version at all"
APPROVAL_POLL_INTERVAL = 30     # 30 seconds — "has the user clicked Update Now"


class AutoUpdater:
    def __init__(self, config, current_version: str):
        self.config = config
        self.current_version = current_version
        self._http = httpx.AsyncClient(timeout=10.0)
        self._known_newer_version: str | None = None
        self._known_changelog: str = ""
        self._known_download_url: str = ""

    async def run(self):
        """Two concurrent loops: slow version-check, fast approval-poll."""
        mode = "manual" if self.config.manual_updates else "auto"
        log.info(f"AutoUpdater running (current: v{self.current_version}, mode: {mode})")

        await asyncio.gather(
            self._version_check_loop(),
            self._approval_poll_loop(),
        )

    # ── SLOW LOOP: does a newer version exist at all? ───────────────────────────
    async def _version_check_loop(self):
        while True:
            try:
                await self._check_version()
            except asyncio.CancelledError:
                break
            except Exception as e:
                log.debug(f"Version check failed: {e}")
            await asyncio.sleep(VERSION_CHECK_INTERVAL)

    async def _check_version(self):
        r = await self._http.get(
            f"{API_BASE}/api/v1/telemetry/version",
            headers={"X-API-KEY": self.config.api_key},
        )
        r.raise_for_status()
        data = r.json()

        latest = data["latest"]
        is_security_patch = data.get("security_patch", False)
        download_url = data.get("download_url", "")
        changelog = data.get("changelog", "")

        if Version(latest) <= Version(self.current_version):
            self._known_newer_version = None
            return

        # A newer version exists. This GET call itself is what causes the
        # backend to create the one-time notification (WhatsApp/email/banner)
        # — see api/agent.py::version_check().
        self._known_newer_version = latest
        self._known_changelog = changelog
        self._known_download_url = download_url

        log.info(f"New version detected: v{latest} (current: v{self.current_version})")

        # Security patches bypass manual mode entirely and install right away
        if is_security_patch:
            log.warning(f"⚠ Security patch v{latest} — installing immediately (mandatory).")
            await self._install(download_url, latest)
            return

        # Fully automatic mode — no need to wait for dashboard approval
        if not self.config.manual_updates:
            log.info(f"Auto-update mode — installing v{latest} now…")
            await self._install(download_url, latest)

    # ── FAST LOOP: has the user clicked "Update Now"? ───────────────────────────
    async def _approval_poll_loop(self):
        """
        Only matters in manual_updates mode. Polls every 30 seconds once a
        newer version is known, so installation happens within seconds of
        the user clicking "Update Now" in the dashboard rather than waiting
        for the next 30-minute version-check cycle.
        """
        while True:
            await asyncio.sleep(APPROVAL_POLL_INTERVAL)
            if not self.config.manual_updates:
                continue
            if not self._known_newer_version:
                continue
            try:
                await self._check_approval()
            except asyncio.CancelledError:
                break
            except Exception as e:
                log.debug(f"Approval poll failed: {e}")

    async def _check_approval(self):
        r = await self._http.get(
            f"{API_BASE}/api/v1/telemetry/update-approved",
            headers={"X-API-KEY": self.config.api_key},
        )
        r.raise_for_status()
        data = r.json()

        if data.get("approved") and data.get("version") == self._known_newer_version:
            log.info(f"✓ Update v{self._known_newer_version} approved by user — installing now…")
            await self._install(
                data.get("download_url", self._known_download_url),
                self._known_newer_version,
            )

    # ── INSTALL ─────────────────────────────────────────────────────────────────
    async def _install(self, download_url: str, version: str):
        """
        Install new version via pip (works for Docker and Linux installs).
        For Windows .exe: a separate installer path handles this via
        Windows Service restart, triggered the same way through this same
        update-approved polling mechanism.
        """
        if not download_url:
            log.warning("No download URL in update payload — skipping.")
            return

        log.info(f"Downloading v{version} from {download_url[:80]}…")

        try:
            proc = await asyncio.create_subprocess_exec(
                sys.executable, "-m", "pip", "install",
                download_url, "--quiet", "--break-system-packages",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await proc.communicate()

            if proc.returncode != 0:
                log.error(f"pip install failed: {stderr.decode()[:500]}")
                return

            log.info(f"v{version} installed. Restarting agent…")
            # Exec replaces the current process with the new version
            os.execv(sys.executable, [sys.executable] + sys.argv)

        except Exception as e:
            log.error(f"Update install failed: {e}")
