"""Authenticated intelligence endpoints integrated into the existing Evidence API."""

import io
import json
import math
import re
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import select, func
from PIL import Image

from . import config
from .db import (
    DB,
    Frame,
    Observation,
    ModelRun,
    CameraRecord,
    SourceRecord,
    VideoConfiguration,
    AnalysisJob,
    DerivedArtifact,
    EnrichmentRecord,
    Event,
    CaseEvidence,
    FindingEvent,
    uid,
    now,
    serialize,
    audit,
)
from .security import current_user, writer, require_asset, require_case
from .intelligence import ensure_configuration, latest, graph_for_case, source_path, stable, lock
from .inspection import enqueue, CONCEPTS
from .media import MediaError, ffmpeg, sha256
from .retrieval import retrieve
from .evidence import PTS_TOLERANCE, matches_frame, source_frame_references, uploaded_source
from .portable_report import clock_label

router = APIRouter()


@router.get("/api/cases/{cid}/timeline")
def episode_timeline(
    cid: str,
    q: str = Query("", max_length=300),
    asset_id: str | None = None,
    start: float = Query(0, ge=0),
    end: float = Query(28800, ge=0),
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
    user=Depends(current_user),
):
    if end < start:
        raise HTTPException(422, "End must follow start")
    with DB() as db:
        require_case(db, user, cid)
        graph = graph_for_case(db, cid)
    episodes = []
    sources = {node["data"]["asset_id"]: node["data"] for node in graph["nodes"] if node["kind"] == "video"}
    for node in graph["nodes"]:
        d = node["data"]
        if node["kind"] != "event_episode" or (asset_id and d["asset_id"] != asset_id):
            continue
        if d["end"] < start or d["start"] > end or q.lower() not in json.dumps(d).lower():
            continue
        epoch = datetime.fromisoformat(d["clock"]["start"]) if d["clock"]["verified"] and d["clock"]["start"] else None
        from datetime import timedelta

        episodes.append(
            {
                **d,
                "clock_status": clock_label(
                    {"synthetic": sources[d["asset_id"]].get("synthetic"), "clock_mapping": d["clock"]}
                ),
                "camera_start": (epoch + timedelta(seconds=d["start"])).isoformat() if epoch else None,
                "camera_end": (epoch + timedelta(seconds=d["end"])).isoformat() if epoch else None,
            }
        )
    synchronized = bool(episodes) and all(e["camera_start"] for e in episodes)
    episodes.sort(
        key=lambda e: (
            datetime.fromisoformat(e["camera_start"]).timestamp() if synchronized else e["asset_id"],
            e["start"],
            e["id"],
        )
    )
    page = episodes[offset : offset + limit]
    selected = {e["id"] for e in page}
    edges = [e for e in graph["edges"] if e["source"] in selected or e["target"] in selected]
    references = selected | {e[k] for e in edges for k in ("source", "target")}
    return {
        "items": page,
        "recordings": [
            {"id": n["data"]["asset_id"], "name": n["label"]} for n in graph["nodes"] if n["kind"] == "video"
        ],
        "total": len(episodes),
        "offset": offset,
        "limit": limit,
        "chronology": "verified source clocks" if synchronized else "grouped by recording; clocks unverified",
        "chronology_description": (
            "Ordered by verified fixture clock mappings"
            if synchronized and all(e["clock_status"] == "VERIFIED_FOR_FIXTURE" for e in episodes)
            else "Ordered by configured clock mappings"
            if synchronized
            else "Grouped by recording and source-relative time"
        ),
        "graph": {"nodes": [n for n in graph["nodes"] if n["id"] in references], "edges": edges},
        "policy": "Derived episodes suppress repeated display records, not original evidence. UNRESOLVED is never confirmed theft.",
    }


def owner(db, user, aid):
    asset = require_asset(db, user, aid)
    if user.role != "admin" and asset.owner_id != user.id:
        raise HTTPException(403, "Only the source owner or administrator may modify analysis")
    return asset


class InspectionRequest(BaseModel):
    mode: Literal["local", "meta"] = "local"
    authorize_external_processing: bool = False
    request_key: str = Field(default_factory=uid, min_length=8, max_length=100, pattern=r"^[A-Za-z0-9_-]+$")
    concepts: list[str] = Field(default=["person", "cardboard box", "shelf"], min_length=1, max_length=4)
    start: float | None = Field(default=None, ge=0, le=28800)
    end: float | None = Field(default=None, ge=0, le=28800)
    fps: float = Field(default=5, ge=0.5, le=10)
    max_windows: int = Field(default=2, ge=1, le=4)
    max_requests: int = Field(default=8, ge=1, le=12)

    @model_validator(mode="after")
    def valid(self):
        if not set(self.concepts) <= CONCEPTS or len(set(self.concepts)) != len(self.concepts):
            raise ValueError("Unsupported or duplicated noun concept")
        if (self.start is None) != (self.end is None):
            raise ValueError("Both time bounds required")
        if self.start is not None and not self.start < self.end <= self.start + 12:
            raise ValueError("Target window must be >0 and <=12 seconds")
        return self


@router.get("/api/videos/{aid}/intelligence")
def intelligence(aid: str, source_id: str | None = None, user=Depends(current_user)):
    with DB.begin() as db:
        asset = require_asset(db, user, aid)
        setting = ensure_configuration(db, asset)
        snap = latest(db, aid)
        source = db.get(SourceRecord, source_id or setting.source_id)
        if source is None or source.asset_id != aid:
            raise HTTPException(404, "Source recording not found")
        return {
            "snapshot": serialize(snap) if snap else None,
            "playback": {
                "source_id": source.id,
                "source_sha256": source.sha256,
                "url": f"/api/videos/{aid}/native-media?source_id={source.id}",
                "frames": source_frame_references(db, asset, source),
            },
            "configuration": serialize(setting),
            "sources": [serialize(r) for r in db.scalars(select(SourceRecord).where(SourceRecord.asset_id == aid))],
            "jobs": [
                serialize(j)
                for j in db.scalars(
                    select(AnalysisJob)
                    .where(AnalysisJob.asset_id == aid)
                    .order_by(AnalysisJob.created.desc())
                    .limit(30)
                )
            ],
            "concepts": sorted(CONCEPTS),
            "detection_confidence_policy": "Null unless provider explicitly reports confidence. Association scores are uncalibrated geometry heuristics.",
        }


@router.post("/api/videos/{aid}/intelligence/jobs", status_code=202)
def inspection(aid: str, body: InspectionRequest, user=Depends(writer)):
    with lock, DB.begin() as db:
        from .db import reserve_sources

        reserve_sources(db, [aid])
        asset = owner(db, user, aid)
        if body.end is not None and body.end > asset.duration:
            raise HTTPException(422, "Window exceeds source duration")
        existing = db.scalar(
            select(AnalysisJob).where(AnalysisJob.asset_id == aid, AnalysisJob.request_key == body.request_key)
        )
        if existing:
            if existing.options != body.model_dump():
                raise HTTPException(409, "Idempotency key was already used for different options")
            return serialize(existing)
        from .db import DiscoveryRun

        if any(
            aid in r.options.get("asset_ids", [])
            for r in db.scalars(select(DiscoveryRun).where(DiscoveryRun.status.in_(["queued", "running"])))
        ):
            raise HTTPException(409, "Source reserved by active case discovery")
        if asset.status in ("queued", "running"):
            raise HTTPException(409, "Wait for initial source decoding")
        if db.scalar(
            select(AnalysisJob.id).where(AnalysisJob.asset_id == aid, AnalysisJob.status.in_(["queued", "running"]))
        ):
            raise HTTPException(409, "This recording already has an active intelligence job")
        active = db.scalar(
            select(func.count())
            .select_from(AnalysisJob)
            .where(AnalysisJob.status.in_(["queued", "running"]), AnalysisJob.owner_id == user.id)
        )
        if active >= 2:
            raise HTTPException(429, "At most two active intelligence jobs per account")
        if body.mode == "meta" and (not body.authorize_external_processing or not config.MODEL_KEY):
            raise HTTPException(409, "Meta credentials and explicit external-processing authorization are required")
        job = AnalysisJob(
            id=uid(),
            asset_id=aid,
            owner_id=user.id,
            request_key=body.request_key,
            options=body.model_dump(),
            result={"provider_requests": 0, "usage_status": "no calls started"},
        )
        db.add(job)
        db.flush()
    try:
        enqueue(job.id)
    except MediaError as exc:
        with DB.begin() as db:
            j = db.get(AnalysisJob, job.id)
            j.status = "failed"
            j.error = str(exc)
            j.finished = now()
        raise HTTPException(429, str(exc)) from exc
    audit(
        user.id,
        "intelligence.job_requested",
        aid,
        {"job_id": job.id, "mode": body.mode, "max_requests": body.max_requests},
    )
    return serialize(job)


@router.post("/api/intelligence/jobs/{job_id}/cancel")
def cancel(job_id: str, user=Depends(writer)):
    with DB.begin() as db:
        job = db.get(AnalysisJob, job_id)
        if not job:
            raise HTTPException(404, "Job not found")
        owner(db, user, job.asset_id)
        if job.status in ("queued", "running"):
            job.cancel_requested = True
            if job.status == "queued":
                job.status = "cancelled"
                job.finished = now()
    audit(user.id, "intelligence.cancel_requested", job_id)
    return serialize(job)


class Zone(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    box: list[float] = Field(min_length=4, max_length=4)

    @model_validator(mode="after")
    def valid(self):
        if not all(0 <= v <= 1 for v in self.box) or self.box[0] >= self.box[2] or self.box[1] >= self.box[3]:
            raise ValueError("Invalid normalized image zone")
        return self


class CameraSettings(BaseModel):
    label: str = Field(min_length=1, max_length=80)
    camera_id: str | None = None
    clock_start: str | None = Field(default=None, max_length=80)
    clock_verified: bool = False
    clock_evidence: str = Field(default="", max_length=1000)
    zones: list[Zone] = Field(default=[], max_length=20)

    @model_validator(mode="after")
    def valid(self):
        if self.clock_start:
            clock = datetime.fromisoformat(self.clock_start)
            if clock.tzinfo is None:
                raise ValueError("Clock requires an explicit UTC offset")
        if self.clock_verified and (not self.clock_start or len(self.clock_evidence) < 5):
            raise ValueError("Verified clock requires timestamp and evidence notes")
        return self


@router.patch("/api/videos/{aid}/configuration")
def configure(aid: str, body: CameraSettings, user=Depends(writer)):
    with DB.begin() as db:
        asset = owner(db, user, aid)
        setting = ensure_configuration(db, asset)
        if body.camera_id:
            cam = db.get(CameraRecord, body.camera_id)
            if not cam or (user.role != "admin" and cam.owner_id != user.id):
                raise HTTPException(404, "Camera not found")
            setting.camera_id = cam.id
        else:
            cam = db.get(CameraRecord, setting.camera_id)
        cam.label = body.label
        asset.camera = body.label
        setting.clock_start = body.clock_start
        setting.clock_verified = body.clock_verified
        setting.clock_evidence = body.clock_evidence
        setting.zones = [z.model_dump() for z in body.zones]
    audit(
        user.id,
        "camera.configuration_updated",
        aid,
        {"camera_id": setting.camera_id, "clock_verified": setting.clock_verified, "zones": len(setting.zones)},
    )
    return serialize(setting)


@router.get("/api/videos/{aid}/native-media")
def native_media(aid: str, source_id: str | None = None, user=Depends(current_user)):
    with DB.begin() as db:
        asset = require_asset(db, user, aid)
        setting = ensure_configuration(db, asset)
        source = db.get(SourceRecord, source_id or setting.source_id)
        if source is None or source.asset_id != aid:
            raise HTTPException(404, "Source recording not found")
    try:
        path = source_path(source)
    except MediaError as exc:
        raise HTTPException(409, str(exc)) from exc
    audit(user.id, "native_source.access", aid, {"source_sha256": source.sha256})
    return FileResponse(
        path,
        media_type="video/webm" if source.metadata_json.get("codec") in ("vp8", "vp9") else "video/mp4",
        headers={"X-Evidence-SHA256": source.sha256},
    )


@router.get("/api/frames/{fid}/native")
def native_frame(fid: str, source_id: str | None = None, artifact_id: str | None = None, user=Depends(current_user)):
    with lock, DB.begin() as db:
        frame = db.get(Frame, fid)
        if not frame:
            raise HTTPException(404, "Frame not found")
        asset = require_asset(db, user, frame.asset_id)
        artifacts = db.scalars(
            select(DerivedArtifact)
            .where(
                DerivedArtifact.frame_id == fid,
                DerivedArtifact.kind == "native_frame",
            )
            .order_by(DerivedArtifact.id)
        ).all()
        if artifact_id:
            artifacts = [row for row in artifacts if row.id == artifact_id]
            if not artifacts:
                raise HTTPException(404, "Native frame artifact not found")
        if source_id:
            source = db.get(SourceRecord, source_id)
            if not source or source.asset_id != asset.id:
                raise HTTPException(404, "Source recording not found")
            artifacts = [row for row in artifacts if row.source_id == source_id]
            if artifact_id and not artifacts:
                raise HTTPException(409, "Frame artifact and source reference disagree")
        if len({row.source_id for row in artifacts}) > 1:
            raise HTTPException(409, "Frame is associated with multiple sources. Select a specific artifact.")
        artifact = artifacts[0] if artifacts else None
        if artifact:
            source = db.get(SourceRecord, artifact.source_id)
            if not matches_frame(artifact, source, frame):
                raise HTTPException(409, "Native frame provenance does not match its source or timestamp")
        else:
            if frame.filename.startswith("inspect-") or (source_id and source.sha256 != asset.sha256):
                raise HTTPException(409, "No native frame is bound to the requested source and timestamp")
            source = uploaded_source(db, asset)
            try:
                native = source_path(source)
            except MediaError as exc:
                raise HTTPException(409, str(exc)) from exc
            folder = config.DATA / asset.id / "native"
            folder.mkdir(exist_ok=True)
            path = folder / (fid + "-" + uid() + ".png")
            # FFmpeg prints six significant digits for pts_time. Seek just before the
            # rounding interval, then reject a frame with a different recorded PTS.
            rounding = 0.5 * 10 ** (math.floor(math.log10(max(1, frame.timestamp))) - 5)
            seek = max(0, frame.timestamp - max(PTS_TOLERANCE, rounding + 0.000001))
            result = ffmpeg(
                [
                    "-ss",
                    str(seek),
                    "-copyts",
                    "-start_at_zero",
                    "-i",
                    str(native),
                    "-vf",
                    f"select=gte(t\\,{seek}),showinfo",
                    "-frames:v",
                    "1",
                    "-y",
                    str(path),
                ],
                timeout=60,
            )
            pts = re.findall(r"\bn:\s*\d+\s+pts:.*?pts_time:([\d.e+-]+)", result.stderr.decode(errors="replace"))
            if result.returncode or not path.exists() or not pts:
                path.unlink(missing_ok=True)
                raise HTTPException(422, "Original frame could not be retrieved")
            actual = float(pts[0])
            if abs(actual - frame.timestamp) > PTS_TOLERANCE:
                path.unlink()
                raise HTTPException(409, "Decoded frame did not match the requested source timestamp")
            artifact = DerivedArtifact(
                id=uid(),
                asset_id=asset.id,
                source_id=source.id,
                frame_id=fid,
                kind="native_frame",
                path=str(path.relative_to(config.DATA)),
                sha256=sha256(path),
                provenance={
                    "source_pts": actual,
                    "requested_pts": frame.timestamp,
                    "source_sha256": source.sha256,
                    "operation": "Native source decode; no spatial resizing",
                },
            )
            db.add(artifact)
            db.flush()
        path = (config.DATA / artifact.path).resolve()
        if not path.is_relative_to(config.DATA):
            raise HTTPException(409, "Native frame path is outside protected storage")
        if not path.is_file():
            raise HTTPException(410, "Referenced native frame is unavailable")
        if sha256(path) != artifact.sha256:
            raise HTTPException(409, "Native frame integrity check failed")
        meta = dict(artifact.provenance)
    return FileResponse(
        path,
        media_type="image/png",
        headers={
            "X-Evidence-SHA256": artifact.sha256,
            "X-Source-SHA256": source.sha256,
            "X-Source-PTS": str(meta["source_pts"]),
            "X-Time-Basis": "playback-relative source PTS",
        },
    )


@router.get("/api/observations/{oid}/mask")
def mask(oid: str, user=Depends(current_user)):
    from meta_sam_parser import SegmentationMask, decode_mask_to_raster

    with DB() as db:
        ob = db.get(Observation, oid)
        if not ob:
            raise HTTPException(404, "Observation not found")
        require_asset(db, user, ob.asset_id)
        token = ob.mask or ""
    match = re.fullmatch(r"<\|mask;x=0;y=0;(?:c=[0-9.e+-]+;)?data=(\d+),(\d+),([~!])(.*?)\|>", token)
    if not match:
        raise HTTPException(422, "No decodable provider mask; bounding box remains available")
    h, w = int(match[1]), int(match[2])
    if w * h > 4_000_000:
        raise HTTPException(422, "Mask exceeds rendering budget")
    try:
        raster = decode_mask_to_raster(
            SegmentationMask("lossless" if match[3] == "~" else "one_bit", match[3] + match[4], w, h)
        )
    except Exception as exc:
        raise HTTPException(422, "Provider mask decoding failed; raw output retained") from exc
    alpha = Image.frombytes("L", (w, h), raster).point(lambda v: 140 if v else 0)
    im = Image.new("RGBA", (w, h), (60, 245, 176, 0))
    im.putalpha(alpha)
    out = io.BytesIO()
    im.save(out, format="PNG")
    return Response(
        out.getvalue(),
        media_type="image/png",
        headers={
            "X-Evidence-SHA256": __import__("hashlib").sha256(out.getvalue()).hexdigest(),
            "X-Provenance": "Decoded from stored SAM mask; positioned within stored normalized box",
        },
    )


@router.get("/api/cases/{cid}/graph")
def graph(cid: str, user=Depends(current_user)):
    with DB() as db:
        require_case(db, user, cid)
        result = graph_for_case(db, cid)
    audit(user.id, "evidence_graph.access", cid, {"nodes": len(result["nodes"]), "edges": len(result["edges"])})
    return result


@router.post("/api/cases/{cid}/intelligence/attach")
def attach(cid: str, user=Depends(writer)):
    with DB.begin() as db:
        require_case(db, user, cid)
        aids = set(
            db.scalars(
                select(Event.asset_id)
                .join(CaseEvidence, CaseEvidence.event_id == Event.id)
                .where(CaseEvidence.case_id == cid)
            )
        )
        count = 0
        for event in db.scalars(select(Event).where(Event.asset_id.in_(aids), Event.type == "scene_analysis")):
            if db.get(ModelRun, event.run_id).raw.get("job_id") and not db.get(CaseEvidence, (cid, event.id)):
                db.add(CaseEvidence(case_id=cid, event_id=event.id))
                count += 1
        for event_id in db.scalars(select(FindingEvent.event_id).where(FindingEvent.asset_id.in_(aids))):
            if not db.get(CaseEvidence, (cid, event_id)):
                db.add(CaseEvidence(case_id=cid, event_id=event_id))
                count += 1
    audit(user.id, "case.intelligence_attached", cid, {"added": count})
    return {"added": count}


@router.get("/api/cases/{cid}/search")
def search(cid: str, q: str = Query(..., min_length=3, max_length=500), user=Depends(current_user)):
    with DB() as db:
        require_case(db, user, cid)
        graph = graph_for_case(db, cid)
    rows, filters = retrieve(graph, q)
    return {
        "items": rows,
        "total": len(rows),
        "filters": filters,
        "notice": "No supporting evidence found."
        if not rows
        else "Stored evidence references only. No generated events or identities.",
    }


class ImportRecord(BaseModel):
    kind: Literal[
        "inventory", "goods_receipt", "dispatch", "stock_adjustment", "access_log", "incident_note", "human_testimony"
    ]
    rows: list[dict] = Field(min_length=1, max_length=500)
    verified_identifiers: bool = False
    clock_verified: bool = False


@router.post("/api/cases/{cid}/enrichment", status_code=201)
def enrichment(cid: str, body: ImportRecord, user=Depends(writer)):
    payload = json.dumps(body.model_dump(), sort_keys=True)
    if len(payload.encode()) > 1_000_000:
        raise HTTPException(413, "Enrichment input exceeds 1 MB")
    with DB.begin() as db:
        require_case(db, user, cid)
        graph = graph_for_case(db, cid)
        nodes = {n["id"]: n for n in graph["nodes"]}
        rows = []
        for row in body.rows:
            row = dict(row)
            if not isinstance(row.get("record_id"), str) or not 1 <= len(row["record_id"]) <= 200:
                raise HTTPException(422, "Each imported row needs a stable record_id")
            if body.verified_identifiers and not row.get("identifier"):
                raise HTTPException(422, "Verified identifier imports require an explicit identifier on every row")
            ref = row.get("video_reference")
            clock = row.get("timestamp")
            if ref and ref not in nodes:
                raise HTTPException(422, "Video reference does not exist in this investigation graph")
            if body.clock_verified:
                try:
                    if not clock or datetime.fromisoformat(clock).tzinfo is None:
                        raise ValueError()
                except (ValueError, TypeError):
                    raise HTTPException(422, "Verified logs require timezone-aware timestamps") from None
            state = "unresolved; verified identifier and synchronized source time required"
            if ref and body.verified_identifiers and body.clock_verified:
                # A reference and log clock are insufficient when the video clock is unknown.
                frame = nodes[ref] if nodes[ref]["kind"] == "frame" else None
                aid = frame["data"]["asset_id"] if frame else None
                setting = db.get(VideoConfiguration, aid) if aid else None
                if setting and setting.clock_verified:
                    video_time = datetime.fromisoformat(setting.clock_start) + __import__("datetime").timedelta(
                        seconds=frame["data"]["timestamp"]
                    )
                    delta = abs((video_time - datetime.fromisoformat(clock)).total_seconds())
                    state = (
                        "temporal/identifier lead; no causation or person attribution"
                        if delta <= 2
                        else "contradictory synchronized times; outside 2-second correlation tolerance"
                    )
                else:
                    state = "blocked: video source clock is unverified or reference is not a frame"
            row["correlation_status"] = state
            rows.append(row)
        digest = stable(body.model_dump())
        existing = db.scalar(
            select(EnrichmentRecord).where(EnrichmentRecord.case_id == cid, EnrichmentRecord.source_sha256 == digest)
        )
        if existing:
            return serialize(existing)
        record = EnrichmentRecord(
            id=uid(),
            case_id=cid,
            kind=body.kind,
            source_sha256=digest,
            rows=rows,
            verified_identifiers=body.verified_identifiers,
            clock_verified=body.clock_verified,
            imported_by=user.id,
        )
        db.add(record)
        db.flush()
    audit(
        user.id,
        "case.enrichment_import",
        cid,
        {"record_id": record.id, "kind": body.kind, "rows": len(rows), "sha256": digest},
    )
    return serialize(record)


class CameraAssociation(BaseModel):
    from_reference: str = Field(min_length=5, max_length=150)
    to_reference: str = Field(min_length=5, max_length=150)
    state: Literal["unverified", "human_verified_spatiotemporal"] = "unverified"
    evidence_notes: str = Field(min_length=10, max_length=2000)


@router.post("/api/cases/{cid}/camera-associations", status_code=201)
def camera_association(cid: str, body: CameraAssociation, user=Depends(writer)):
    from datetime import timedelta

    with DB.begin() as db:
        require_case(db, user, cid)
        graph = graph_for_case(db, cid)
        nodes = {n["id"]: n for n in graph["nodes"]}
        refs = [nodes.get(body.from_reference), nodes.get(body.to_reference)]
        if any(not n or n["kind"] != "frame" for n in refs):
            raise HTTPException(422, "Both references must be actual frame nodes in this case")
        settings = [db.get(VideoConfiguration, n["data"]["asset_id"]) for n in refs]
        if any(s is None for s in settings) or settings[0].camera_id == settings[1].camera_id:
            raise HTTPException(422, "Cross-camera association requires two configured distinct cameras")
        if body.state == "human_verified_spatiotemporal":
            if user.role not in ("admin", "reviewer"):
                raise HTTPException(403, "Reviewer or administrator must verify cross-camera associations")
            if not all(s.clock_verified and s.clock_start for s in settings):
                raise HTTPException(409, "Both source clocks must be independently verified")
            times = [
                datetime.fromisoformat(s.clock_start) + timedelta(seconds=n["data"]["timestamp"])
                for n, s in zip(refs, settings)
            ]
            if not 0 <= (times[1] - times[0]).total_seconds() <= 3600:
                raise HTTPException(
                    422, "Verified association has contradictory times or exceeds one-hour transit limit"
                )
        row = {
            **body.model_dump(),
            "reviewer_id": user.id,
            "identity_verified": False,
            "automatic_track_merge": False,
            "limitation": "Human spatiotemporal association only; no real identity or guilt inference.",
        }
        record = EnrichmentRecord(
            id=uid(),
            case_id=cid,
            kind="cross_camera_association",
            source_sha256=stable(row),
            rows=[row],
            verified_identifiers=False,
            clock_verified=body.state == "human_verified_spatiotemporal",
            imported_by=user.id,
        )
        db.add(record)
        db.flush()
    audit(user.id, "case.camera_association_recorded", cid, {"record_id": record.id, "state": body.state})
    return serialize(record)
