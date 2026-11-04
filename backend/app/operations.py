"""Reversible retention, durable operations and explicitly configured live-camera capture."""

import json
import os
import re
import time
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from . import config
from .db import (
    DB,
    Asset,
    CaseVideo,
    CaseEvidence,
    Event,
    Report,
    AnalysisJob,
    DiscoveryRun,
    WorkItem,
    RetentionPolicy,
    QuarantinedAsset,
    WorkerHeartbeat,
    uid,
    now,
    audit,
    serialize,
)
from .security import administrator
from .media import ffmpeg

router = APIRouter()


def protected_assets(db):
    ids = set(db.scalars(select(CaseVideo.asset_id)))
    ids.update(db.scalars(select(Event.asset_id).join(CaseEvidence, CaseEvidence.event_id == Event.id)))
    ids.update(db.scalars(select(AnalysisJob.asset_id).where(AnalysisJob.status.in_(["queued", "running"]))))
    for run in db.scalars(select(DiscoveryRun).where(DiscoveryRun.status.in_(["queued", "running"]))):
        ids.update(run.options.get("asset_ids", []))
    for report in db.scalars(select(Report)):
        ids.update(row["asset_id"] for row in report.content.get("integrity", []) if row.get("asset_id"))
    return ids


def retention_preview(db, days):
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    protected = protected_assets(db)
    protected.update(db.scalars(select(QuarantinedAsset.asset_id).where(QuarantinedAsset.restored >= cutoff)))
    return [
        a
        for a in db.scalars(select(Asset).where(Asset.created < cutoff))
        if a.id not in protected and a.status not in ("queued", "running", "quarantined")
    ]


def paths(aid):
    # Both sides of each move resolve under the named private data directory. Never follow external symlinks.
    if not re.fullmatch(r"[a-zA-Z0-9-]{1,100}", aid):
        raise ValueError("Invalid recording identifier")
    live, archive = config.DATA / aid, config.DATA / "quarantine" / aid
    for path in (live, archive):
        if path.is_symlink() or not path.resolve().is_relative_to(config.DATA.resolve()):
            raise ValueError("Unsafe media path")
    return live, archive


def quarantine(days, actor=None):
    moved = []
    # Source reservation lock is shared with discovery/inspection requests.
    from .intelligence import lock

    try:
        with lock, DB.begin() as db:
            from .db import reserve_sources

            reserve_sources(db, list(db.scalars(select(Asset.id))))
            for asset in retention_preview(db, days):
                live, archive = paths(asset.id)
                if not live.is_dir() or archive.exists():
                    continue
                archive.parent.mkdir(exist_ok=True)
                live.rename(archive)
                previous = asset.status
                asset.status = "quarantined"
                record = db.get(QuarantinedAsset, asset.id)
                if not record:
                    db.add(QuarantinedAsset(asset_id=asset.id, prior_status=previous))
                else:
                    record.prior_status, record.quarantined, record.restored = previous, now(), None
                moved.append(asset.id)
    except Exception:
        # Reconcile filesystem moves if the transaction fails; never lose the restore path.
        for aid in reversed(moved):
            live, archive = paths(aid)
            if archive.is_dir() and not live.exists():
                archive.rename(live)
        raise
    for aid in moved:
        audit(actor or "system:retention", "retention.quarantine", aid, {"reversible": True, "days": days})
    return moved


class PolicyRequest(BaseModel):
    enabled: bool
    days: int = Field(ge=1, le=3650)


@router.get("/api/operations")
def status(user=Depends(administrator)):
    with DB() as db:
        policy = db.get(RetentionPolicy, 1)
        return {
            "queue": [
                serialize(w, ("payload",))
                for w in db.scalars(select(WorkItem).order_by(WorkItem.created.desc()).limit(100))
            ],
            "retention": serialize(policy) if policy else {"enabled": False, "days": 90},
            "retention_candidates": [serialize(a) for a in retention_preview(db, policy.days if policy else 90)],
            "quarantined": [
                serialize(q) for q in db.scalars(select(QuarantinedAsset).where(QuarantinedAsset.restored.is_(None)))
            ],
            "camera_sources": [{k: v for k, v in c.items() if k not in ("input_env",)} for c in camera_sources()],
            "worker_mode": os.getenv("SENSA_WORKER_MODE", "embedded"),
            "workers": [
                serialize(w)
                for w in db.scalars(select(WorkerHeartbeat).where(WorkerHeartbeat.lease_until > time.time()))
            ],
        }


@router.put("/api/operations/retention")
def policy(body: PolicyRequest, user=Depends(administrator)):
    with DB.begin() as db:
        p = db.get(RetentionPolicy, 1)
        if not p:
            p = RetentionPolicy(id=1)
            db.add(p)
        p.enabled, p.days, p.updated_by = body.enabled, body.days, user.id
    audit(user.id, "retention.policy", detail=body.model_dump())
    return {"enabled": body.enabled, "days": body.days, "mode": "reversible quarantine; case/report evidence protected"}


@router.post("/api/operations/retention/run")
def run_retention(user=Depends(administrator)):
    with DB() as db:
        p = db.get(RetentionPolicy, 1)
        if not p or not p.enabled:
            raise HTTPException(409, "Enable a retention policy first; preview is available without moving media")
        days = p.days
    return {"quarantined": quarantine(days, user.id)}


@router.post("/api/operations/quarantine/{aid}/restore")
def restore(aid: str, user=Depends(administrator)):
    from .intelligence import lock

    with lock, DB.begin() as db:
        q = db.get(QuarantinedAsset, aid)
        if not q or q.restored:
            raise HTTPException(404, "Quarantined recording not found")
        live, archive = paths(aid)
        if live.exists() or not archive.is_dir():
            raise HTTPException(409, "Media restore paths are unavailable")
        archive.rename(live)
        db.get(Asset, aid).status = q.prior_status
        q.restored = now()
    audit(user.id, "retention.restore", aid)
    return {"restored": aid}


def camera_sources():
    path = config.DATA / "camera-sources.json"
    if not path.exists():
        return []
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, list) or len(data) > 50:
        raise ValueError("Camera configuration must be an array of at most 50 sources")
    result = []
    for row in data:
        if not re.fullmatch(r"[a-zA-Z0-9_-]{1,50}", row.get("id", "")):
            raise ValueError("Invalid camera configuration identifier")
        if not re.fullmatch(r"SENSA_CAMERA_[A-Z0-9_]+", row.get("input_env", "")):
            raise ValueError("Camera connection must name a private environment variable")
        seconds, interval = int(row.get("segment_seconds", 30)), int(row.get("interval_seconds", 60))
        if not 5 <= seconds <= 120 or not seconds <= interval <= 86400:
            raise ValueError("Camera capture duration/interval out of bounds")
        result.append(
            {
                "id": row["id"],
                "label": str(row.get("label", row["id"]))[:80],
                "input_env": row["input_env"],
                "segment_seconds": seconds,
                "interval_seconds": interval,
                "enabled": bool(row.get("enabled", False)),
                "owner_id": row.get("owner_id"),
            }
        )
    return result


def schedule_capture(source):
    from .worker import enqueue

    with DB() as db:
        pending = db.scalar(
            select(WorkItem)
            .where(
                WorkItem.kind == "capture",
                WorkItem.state.in_(["queued", "running"]),
                WorkItem.target_id.startswith(source["id"] + "/", autoescape=True),
            )
            .limit(1)
        )
        if pending:
            return pending.id
    slot = int(time.time() // source["interval_seconds"])
    return enqueue("capture", source["id"] + "/" + str(slot))


@router.post("/api/operations/cameras/{camera_id}/capture", status_code=202)
def capture_now(camera_id: str, user=Depends(administrator)):
    source = next((c for c in camera_sources() if c["id"] == camera_id), None)
    if not source or not source["enabled"]:
        raise HTTPException(409, "Configure and enable this source in private camera-sources.json first")
    audit(user.id, "camera.capture_requested", camera_id)
    return {"work_id": schedule_capture(source)}


def capture(target):
    cid = target.split("/")[0]
    source = next((c for c in camera_sources() if c["id"] == cid and c["enabled"]), None)
    if not source:
        raise ValueError("Camera source disabled or unavailable")
    connection = os.getenv(source["input_env"], "")
    # Connections are configured by a server operator, never supplied as arbitrary browser URLs.
    if urlparse(connection).scheme not in ("rtsp", "rtsps") or not urlparse(connection).hostname:
        raise ValueError("Configured camera must use RTSP/RTSPS")
    with DB() as db:
        from .db import User

        owner = db.get(User, source["owner_id"])
        if not owner or owner.role != "admin":
            raise ValueError("Camera needs a configured administrator owner")
    folder = config.DATA / uid()
    folder.mkdir()
    file = folder / "original.mp4"
    started = now()
    try:
        response = ffmpeg(
            [
                "-rtsp_transport",
                "tcp",
                "-rw_timeout",
                "15000000",
                "-i",
                connection,
                "-t",
                str(source["segment_seconds"]),
                "-an",
                "-c:v",
                "libx264",
                "-preset",
                "veryfast",
                "-movflags",
                "+faststart",
                "-y",
                str(file),
            ],
            timeout=source["segment_seconds"] + 30,
            protocols="file,pipe,rtsp,rtsps,tcp,udp,rtp,tls,crypto",
        )
    except Exception:
        raise ValueError("Camera capture failed or timed out; connection details are private") from None
    if response.returncode or not file.is_file():
        # Never persist ffmpeg stderr: stream URLs can include credentials.
        raise ValueError("Camera capture failed; connection details are private")
    from .workflows import ingest, submit

    asset = ingest(file, owner.id, source["label"] + " / " + started, source["label"])
    submit(asset.id, real=False)
    audit(
        owner.id,
        "camera.segment_ingested",
        asset.id,
        {
            "camera_id": cid,
            "capture_started": started,
            "clock_policy": "Capture receipt time is not a verified camera source clock",
            "model_requests": 0,
        },
    )


def maintenance():
    reconcile_quarantine()
    with DB() as db:
        p = db.get(RetentionPolicy, 1)
        days = p.days if p and p.enabled else None
    if days:
        quarantine(days)


def schedule_cameras():
    for source in camera_sources():
        if source["enabled"]:
            schedule_capture(source)


def reconcile_quarantine():
    """Recover a process crash between an atomic folder move and its DB commit."""
    folder = config.DATA / "quarantine"
    if not folder.is_dir() or folder.is_symlink():
        return
    recovered = []
    with DB.begin() as db:
        for archive in folder.iterdir():
            if not archive.is_dir() or archive.is_symlink():
                continue
            asset = db.get(Asset, archive.name)
            if not asset:
                continue
            live, checked = paths(asset.id)
            if live.exists() or checked != archive:
                continue
            row = db.get(QuarantinedAsset, asset.id)
            if not row or row.restored:
                if not row:
                    db.add(QuarantinedAsset(asset_id=asset.id, prior_status=asset.status))
                else:
                    row.prior_status, row.quarantined, row.restored = asset.status, now(), None
                asset.status = "quarantined"
                recovered.append(asset.id)
        for row in db.scalars(select(QuarantinedAsset).where(QuarantinedAsset.restored.is_(None))):
            live, archive = paths(row.asset_id)
            if live.is_dir() and not archive.exists():
                from .media import sha256

                asset = db.get(Asset, row.asset_id)
                original = live / "original.mp4"
                if original.is_file() and sha256(original) == asset.sha256:
                    asset.status, row.restored = row.prior_status, now()
                    recovered.append(asset.id)
    for aid in recovered:
        audit("system:retention", "retention.recovered_move", aid)
