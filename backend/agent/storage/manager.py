"""
SENSA StorageManager — handles all 3 storage modes.
Local Only: snapshots saved to disk, never uploaded.
Hybrid:     snapshots saved locally + synced to R2 after 48 hours.
Cloud:      snapshots uploaded to R2 immediately.
"""
import asyncio
import logging
import os
import time
from datetime import datetime
from pathlib import Path
from typing import Optional

log = logging.getLogger("SENSA.storage")


class StorageManager:
    def __init__(self, config):
        self.config = config
        self.snap_dir = Path(config.snapshot_path)
        self.snap_dir.mkdir(parents=True, exist_ok=True)

    async def save_snapshot(
        self,
        alert_id: str,
        camera_id: str,
        data: bytes,
    ) -> Optional[str]:
        """Save snapshot and return URL/path based on storage mode."""
        if not data:
            return None

        date_str  = datetime.now().strftime("%Y-%m-%d")
        local_dir = self.snap_dir / date_str / camera_id
        local_dir.mkdir(parents=True, exist_ok=True)
        local_path = local_dir / f"{alert_id}.jpg"
        local_path.write_bytes(data)

        mode = self.config.storage_mode
        if mode == "cloud":
            return await self._upload_to_r2(
                f"snapshots/{date_str}/{camera_id}/{alert_id}.jpg", data, "image/jpeg"
            ) or str(local_path)
        elif mode == "hybrid":
            # Upload happens in sync_loop after delay
            return str(local_path)
        else:
            return str(local_path)

    def _upload_to_r2(self, key: str, data: bytes, content_type: str) -> Optional[str]:
        """Upload bytes to Cloudflare R2 (synchronous — run in executor)."""
        import boto3
        from botocore.exceptions import ClientError
        try:
            account_id = os.getenv("CF_R2_ACCOUNT_ID", "")
            access_key = os.getenv("CF_R2_ACCESS_KEY", "")
            secret_key = os.getenv("CF_R2_SECRET_KEY", "")
            bucket     = os.getenv("CF_R2_BUCKET", "SENSA-snapshots")
            if not all([account_id, access_key, secret_key]):
                return None
            s3 = boto3.client(
                "s3",
                endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
                aws_access_key_id=access_key,
                aws_secret_access_key=secret_key,
            )
            s3.put_object(Bucket=bucket, Key=key, Body=data, ContentType=content_type)
            return f"https://{bucket}.{account_id}.r2.cloudflarestorage.com/{key}"
        except Exception as e:
            log.warning(f"R2 upload failed: {e}")
            return None

    async def sync_loop(self):
        """Hybrid mode: sync old snapshots to R2 every 15 minutes."""
        while True:
            await asyncio.sleep(900)  # 15 minutes
            if self.config.storage_mode != "hybrid":
                continue
            try:
                await self._sync_old_snapshots()
            except Exception as e:
                log.debug(f"Sync error: {e}")

    async def _sync_old_snapshots(self):
        """Upload snapshots older than sync_delay_hours to R2."""
        delay_secs = self.config.sync_delay_hours * 3600
        cutoff     = time.time() - delay_secs
        loop       = asyncio.get_event_loop()
        for jpg in self.snap_dir.rglob("*.jpg"):
            if jpg.stat().st_mtime < cutoff:
                # Derive R2 key from path
                rel  = jpg.relative_to(self.snap_dir)
                key  = f"snapshots/{rel}"
                data = jpg.read_bytes()
                url  = await loop.run_in_executor(
                    None, lambda: self._upload_to_r2(key, data, "image/jpeg")
                )
                if url:
                    log.debug(f"Synced: {rel}")

    async def cleanup_old(self, retention_days: int = 30):
        """Delete local snapshots older than retention_days."""
        cutoff = time.time() - (retention_days * 86400)
        for jpg in self.snap_dir.rglob("*.jpg"):
            if jpg.stat().st_mtime < cutoff:
                jpg.unlink(missing_ok=True)
