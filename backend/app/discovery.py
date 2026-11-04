"""Case-level Describe -> Discover -> Reconstruct workflow. No identity/guilt inference."""

import json
import re
from datetime import datetime, timedelta, timezone
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import select, update, func
from . import config
from .db import (
    DB,
    Asset,
    CaseVideo,
    DiscoveryRun,
    FindingReview,
    AnalysisJob,
    CaseEvidence,
    Event,
    ModelRun,
    Report,
    SourceRecord,
    User,
    uid,
    serialize,
    audit,
    reserve_sources,
)
from .security import current_user, writer, require_case, require_asset
from .intelligence import ensure_configuration, rebuild, graph_for_case, latest, lock
from .inspection import run_job
from .association import category
from .evidence import frame_support_lookup
from .portable_report import build_pdf, clock_label, manifest, portable_snapshot, prepare

router = APIRouter()
guard = lock


def calendar_range(text):
    months = "january february march april may june july august september october november december".split()
    iso = re.search(r"(\d{4}-\d{2}-\d{2})\s+(?:to|through|until)\s+(\d{4}-\d{2}-\d{2})", text.lower())
    if iso:
        return iso[1], iso[2], None
    names = "|".join(months)
    match = re.search(
        r"("
        + names
        + r")\s+(\d{1,2})(?:,?\s+(\d{4}))?\s*(?:to|through|until|[-\u2013\u2014])\s*(?:("
        + names
        + r")\s+)?(\d{1,2})(?:,?\s+(\d{4}))?",
        text.lower(),
    )
    if match:
        year = int(match[6] or match[3] or datetime.now(timezone.utc).year)
        a = datetime(year, months.index(match[1]) + 1, int(match[2])).date().isoformat()
        b = datetime(year, months.index(match[4] or match[1]) + 1, int(match[5])).date().isoformat()
        return a, b, None if match[6] or match[3] else f"Year assumed {year}; confirm investigation scope."
    if any(re.search(r"\b" + m + r"\b", text.lower()) for m in months) or re.search(r"\d{4}-\d{2}-\d{2}", text):
        raise ValueError("Calendar constraint not understood; supply explicit start/end dates.")
    return None, None, None


def incident_plan(text):
    low = text.lower()
    concepts = ["person"]
    if any(w in low for w in ("package", "box", "boxes", "carton", "stock")):
        concepts += ["cardboard box", "pallet"]
    for noun in ("bag", "container", "trolley", "forklift", "door", "entrance"):
        if noun in low:
            concepts.append(noun)
    if "shel" in low:
        concepts.append("shelf")
    concepts = concepts[:4]
    quantity = re.search(r"\b(\d+)\s+(?:packages|boxes|cartons)", low)
    return {
        "incident": text,
        "concepts": concepts,
        "requested_missing_quantity": int(quantity[1]) if quantity else (20 if "twenty" in low else None),
        "quantity_verified": False,
        "policy": "Relevant intervals are investigation leads, not guilt or confirmed removal.",
    }


class DiscoveryRequest(BaseModel):
    incident: str = Field(min_length=10, max_length=3000)
    asset_ids: list[str] = Field(min_length=1, max_length=100)
    request_key: str = Field(default_factory=uid, min_length=8, max_length=100)
    mode: str = Field(default="existing", pattern="^(existing|meta)$")
    authorize_external_processing: bool = False
    start_date: str | None = None
    end_date: str | None = None
    max_requests: int = Field(default=48, ge=1, le=10000)
    reinspect: bool = True
    resume_from: str | None = None

    @model_validator(mode="after")
    def validate_scope(self):
        if not self.start_date and not self.end_date:
            self.start_date, self.end_date, _ = calendar_range(self.incident)
        if bool(self.start_date) != bool(self.end_date):
            raise ValueError("Both calendar dates required")
        if self.start_date:
            a = datetime.fromisoformat(self.start_date).date()
            b = datetime.fromisoformat(self.end_date).date()
            if a > b:
                raise ValueError("Start date must precede end date")
        return self


@router.get("/api/cases/{cid}/discovery")
def get_discovery(cid: str, user=Depends(current_user)):
    with DB() as db:
        require_case(db, user, cid)
        return {
            "runs": [
                serialize(r)
                for r in db.scalars(
                    select(DiscoveryRun)
                    .where(DiscoveryRun.case_id == cid)
                    .order_by(DiscoveryRun.created.desc())
                    .limit(30)
                )
            ],
            "asset_ids": list(db.scalars(select(CaseVideo.asset_id).where(CaseVideo.case_id == cid))),
        }


@router.post("/api/cases/{cid}/discovery", status_code=202)
def discover(cid: str, body: DiscoveryRequest, user=Depends(writer)):
    with guard, DB.begin() as db:
        reserve_sources(db, body.asset_ids)
        require_case(db, user, cid)
        if body.resume_from:
            parent = db.get(DiscoveryRun, body.resume_from)
            if not parent or parent.case_id != cid or parent.status in ("queued", "running"):
                raise HTTPException(409, "Continuation requires a finished run from this case")
            keys = ("incident", "asset_ids", "mode", "start_date", "end_date")
            if any(parent.options.get(k) != body.model_dump().get(k) for k in keys):
                raise HTTPException(409, "Continuation must preserve the incident, sources and calendar scope")
        prior = db.scalar(
            select(DiscoveryRun).where(DiscoveryRun.case_id == cid, DiscoveryRun.request_key == body.request_key)
        )
        if prior:
            if prior.options != body.model_dump():
                raise HTTPException(409, "Request key already used with different scope")
            return serialize(prior)
        if db.scalar(
            select(DiscoveryRun.id).where(DiscoveryRun.case_id == cid, DiscoveryRun.status.in_(["queued", "running"]))
        ):
            raise HTTPException(409, "Case discovery already running")
        for active in db.scalars(select(DiscoveryRun).where(DiscoveryRun.status.in_(["queued", "running"]))):
            if set(active.options.get("asset_ids", [])) & set(body.asset_ids):
                raise HTTPException(409, "A selected source is already in an active discovery")
        for aid in set(body.asset_ids):
            if db.scalar(
                select(AnalysisJob.id).where(AnalysisJob.asset_id == aid, AnalysisJob.status.in_(["queued", "running"]))
            ):
                raise HTTPException(409, "A selected source has an active inspection")
            asset = require_asset(db, user, aid)
            if user.role != "admin" and asset.owner_id != user.id:
                raise HTTPException(403, "Source owner authorization required for discovery scope")
            if asset.status in ["queued", "running"]:
                raise HTTPException(409, "Wait for initial media validation")
            ensure_configuration(db, asset)
            if not db.get(CaseVideo, (cid, aid)):
                db.add(CaseVideo(case_id=cid, asset_id=aid))
        if body.mode == "meta" and not (body.authorize_external_processing and config.MODEL_KEY):
            raise HTTPException(409, "Meta authorization and configured credentials required")
        run = DiscoveryRun(
            id=uid(), case_id=cid, owner_id=user.id, request_key=body.request_key, options=body.model_dump()
        )
        db.add(run)
        db.flush()
    from .worker import enqueue

    enqueue("discovery", run.id)
    audit(user.id, "case.discovery_requested", cid, {"run_id": run.id, "request_ceiling": body.max_requests})
    return serialize(run)


@router.post("/api/discovery/{rid}/cancel")
def cancel_discovery(rid: str, user=Depends(writer)):
    with DB.begin() as db:
        r = db.get(DiscoveryRun, rid)
        if not r:
            raise HTTPException(404, "Discovery run not found")
        require_case(db, user, r.case_id)
        if user.role != "admin" and r.owner_id != user.id:
            raise HTTPException(403, "Only run owner may cancel")
        r.cancel_requested = True
        for child in r.result.get("child_jobs", []):
            job = db.get(AnalysisJob, child)
            if job and job.status in ["queued", "running"]:
                job.cancel_requested = True
    return {"cancel_requested": True}


def rank_candidates(db, asset_ids, concepts):
    candidates = []
    for aid in asset_ids:
        snap = latest(db, aid)
        if not snap:
            continue
        data = snap.data
        objects = {t["id"]: t["category"] for t in data["tracks"]}
        for finding in data.get("episodes", data["findings"]):
            if finding.get("object_track") and category(objects.get(finding["object_track"])) not in {
                category(c) for c in concepts
            }:
                continue
            score = 9 if finding["kind"].startswith("possible_carry") else (8 if "movement" in finding["kind"] else 4)
            candidates.append(
                {
                    "asset_id": aid,
                    "start": finding["start"],
                    "end": finding["end"],
                    "score": score,
                    "reason": finding["kind"],
                    "evidence_ids": [finding["id"]],
                    "frame_ids": finding["frame_ids"],
                    "state": "UNRESOLVED",
                }
            )
        for conflict in data["contradictions"]:
            candidates.append(
                {
                    "asset_id": aid,
                    "start": conflict["timestamp"],
                    "end": conflict["timestamp"],
                    "score": 5,
                    "reason": "conflicting interpretations",
                    "evidence_ids": [conflict["id"]],
                    "frame_ids": conflict["frame_ids"],
                    "state": "UNRESOLVED",
                }
            )
        for ev in db.scalars(select(Event).where(Event.asset_id == aid)):
            if any(ev.id in e.get("source_event_ids", []) for e in data.get("episodes", [])):
                continue
            text = (ev.title + " " + ev.description).lower()
            if ev.type in [
                "possible_carry",
                "possible_transfer",
                "possible_disappearance",
                "possible_open",
                "possible_remove",
            ] or ("shel" in text and ("reach" in text or "arm" in text)):
                frames = [f["id"] for f in data["frames"] if ev.start - 1e-5 <= f["timestamp"] <= ev.end + 1e-5]
                if frames:
                    candidates.append(
                        {
                            "asset_id": aid,
                            "start": ev.start,
                            "end": ev.end,
                            "score": 9 if ev.type.startswith("possible_") else 6,
                            "reason": ev.title,
                            "evidence_ids": ["event:" + ev.id],
                            "frame_ids": frames,
                            "state": "UNRESOLVED",
                        }
                    )
    return sorted(candidates, key=lambda c: (-c["score"], c["asset_id"], c["start"]))[:100]


def targeted_intervals(db, result, limit=2):
    choices = []
    for scope in result["eligible_ranges"]:
        snap = latest(db, scope["asset_id"])
        for w in snap.data.get("reinspection_plan", []) if snap else []:
            t = (w["start"] + w["end"]) / 2
            if scope["start"] <= t <= scope["end"]:
                choices.append(
                    {"asset_id": scope["asset_id"], "start": t, "score": 11, "reason": ", ".join(w["reasons"])}
                )
    choices.extend(result["candidates"])
    windows = []
    for c in sorted(choices, key=lambda c: (-c["score"], c["asset_id"], c["start"])):
        scope = next(
            s
            for s in result["eligible_ranges"]
            if s["asset_id"] == c["asset_id"] and s["start"] <= c["start"] <= s["end"]
        )
        cuts = latest(db, c["asset_id"]).data["continuity"]["boundaries"]
        left = max([scope["start"]] + [t for t in cuts if t <= c["start"]])
        right = min([scope["end"]] + [t - 1e-5 for t in cuts if t > c["start"]])
        a, b = max(left, c["start"] - 0.4), min(right, max(left, c["start"] - 0.4) + 1.6)
        if any(w["asset_id"] == c["asset_id"] and max(a, w["start"]) <= min(b, w["end"]) for w in windows):
            continue
        if b > a:
            windows.append({"asset_id": c["asset_id"], "start": a, "end": b, "reason": c["reason"], "fps": 5})
        if len(windows) >= limit:
            break
    return windows


def coverage_gaps(result):
    """Intervals without a completed coarse sample plan, even if dense clips overlap."""
    gaps = []
    for scope in result["eligible_ranges"]:
        aid, start, end = scope["asset_id"], scope["start"], scope["end"]
        cursor = start
        windows = sorted(
            (w for w in result["coverage"] if w["asset_id"] == aid and w["phase"] == "coarse"),
            key=lambda w: w["requested_start"],
        )
        for window in windows:
            left = max(start, window["requested_start"])
            right = min(end, window["requested_end"])
            if right <= cursor:
                continue
            if left > cursor + 0.0001:
                gaps.append({"asset_id": aid, "start": cursor, "end": left, "status": "unsearched"})
            if not window["complete"]:
                gaps.append(
                    {
                        "asset_id": aid,
                        "start": max(cursor, left),
                        "end": right,
                        "status": window["status"],
                        "reason": window.get("reason"),
                    }
                )
            cursor = right
        if cursor < end - 0.0001:
            gaps.append({"asset_id": aid, "start": cursor, "end": end, "status": "unsearched"})
    return gaps


def snapshot_report(db, cid, result, owner, graph=None):
    if graph is None:
        graph = graph_for_case(db, cid)
    lookup = frame_support_lookup(graph)
    case = require_case(db, db.get(User, owner), cid)
    events = db.scalars(
        select(Event).join(CaseEvidence, CaseEvidence.event_id == Event.id).where(CaseEvidence.case_id == cid)
    ).all()
    configurations = {aid: ensure_configuration(db, db.get(Asset, aid)) for aid in result["selected_assets"]}
    rows = []
    for ev in events:
        if not any(
            scope["asset_id"] == ev.asset_id and scope["start"] <= ev.start <= ev.end <= scope["end"]
            for scope in result["eligible_ranges"]
        ):
            continue
        row = serialize(ev)
        row["camera"] = db.get(Asset, ev.asset_id).camera
        cfg = configurations.get(ev.asset_id)
        row["source_frames"] = lookup("event:" + ev.id)
        row["camera_timestamp"] = (
            (datetime.fromisoformat(cfg.clock_start) + timedelta(seconds=ev.start)).isoformat()
            if cfg
            and cfg.clock_verified
            and row["source_frames"]
            and all(f.get("source_id") == cfg.source_id for f in row["source_frames"])
            else None
        )
        rows.append(row)
    synchronized = bool(rows) and all(r["camera_timestamp"] for r in rows)
    rows.sort(
        key=lambda r: (
            datetime.fromisoformat(r["camera_timestamp"]).timestamp() if synchronized else r["asset_id"],
            r["start"],
        )
    )
    version = (db.scalar(select(func.max(Report.version)).where(Report.case_id == cid)) or 0) + 1

    # A case graph can contain evidence from earlier, wider investigations.
    # Include a hypothesis only when all its supporting frames belong to this run's scope.
    def supporting_frames(node):
        return lookup(node["id"])

    def in_scope(node):
        frames = supporting_frames(node)
        return bool(frames) and all(
            any(
                scope["asset_id"] == frame["asset_id"]
                and scope["start"] - 1e-5 <= frame["timestamp"] <= scope["end"] + 1e-5
                for scope in result["eligible_ranges"]
            )
            for frame in frames
        )

    scoped_findings = [
        n
        for n in graph["nodes"]
        if n["kind"] in ["finding", "interaction", "person_hypothesis", "contradiction"] and in_scope(n)
    ]
    finding_ids = {n["id"] for n in scoped_findings}
    scoped_findings = [{**n, "source_frames": supporting_frames(n)} for n in scoped_findings]
    content = {
        "scope": case.description,
        "purpose": case.purpose,
        "methodology": "Incident-directed bounded discovery; sampled coverage and omitted intervals are explicit.",
        "observations": [r for r in rows if r["category"] == "observed"],
        "interpretations": [r for r in rows if r["category"] != "observed"],
        "timeline": rows,
        "stock_comparisons": [
            {**n, "source_frames": supporting_frames(n)}
            for n in graph["nodes"]
            if n["kind"] == "stock_comparison" and in_scope(n)
        ],
        "anonymous_tracks": [n for n in graph["nodes"] if n["kind"] == "person_tracklet" and in_scope(n)],
        "object_tracks": [n for n in graph["nodes"] if n["kind"] == "object_track" and in_scope(n)],
        "event_episodes": [
            {**n, "source_frames": supporting_frames(n)}
            for n in graph["nodes"]
            if n["kind"] == "event_episode" and in_scope(n)
        ],
        "human_conclusion": "",
        "uncertainty": "Physical contact/removal and identity remain unverified. Unsearched intervals are not negative evidence.",
        "limitations": "Sampled discovery is not exhaustive per-frame verification.",
        "integrity": [
            {
                "asset_id": aid,
                "name": db.get(Asset, aid).name,
                "sha256": db.get(Asset, aid).sha256,
                "native_source_sha256": db.get(SourceRecord, configurations[aid].source_id).sha256,
                "native_source_id": configurations[aid].source_id,
                "native_source_relationship": db.get(SourceRecord, configurations[aid].source_id).relationship,
                "clock_mapping": {
                    "start": configurations[aid].clock_start,
                    "verified": configurations[aid].clock_verified,
                    "evidence": configurations[aid].clock_evidence,
                },
                "synthetic": db.get(Asset, aid).synthetic,
                "clock_status": clock_label(
                    {
                        "synthetic": db.get(Asset, aid).synthetic,
                        "clock_mapping": {
                            "start": configurations[aid].clock_start,
                            "verified": configurations[aid].clock_verified,
                        },
                    }
                ),
            }
            for aid in result["selected_assets"]
        ],
        "models": [
            serialize(r, ("raw",))
            for r in db.scalars(select(ModelRun).where(ModelRun.asset_id.in_(result["selected_assets"])))
        ],
        "possible_hypotheses": [
            n for n in scoped_findings if n["kind"] in ["finding", "interaction", "person_hypothesis"]
        ],
        "contradictory_evidence": [n for n in scoped_findings if n["kind"] == "contradiction"],
        "human_reviews": [
            n for n in graph["nodes"] if n["kind"] == "human_review" and n["data"].get("reference") in finding_ids
        ],
        "missing_evidence": result["warnings"],
        "discovery": result,
        "chronology_policy": "Source-relative evidence with configured clock mappings. Verified fixture mappings apply only to synthetic footage."
        if synchronized
        else "Source-relative evidence grouped by recording. Global chronology is unverified.",
    }
    report = Report(id=uid(), case_id=cid, version=version, author_id=owner, content=content, status="draft")
    db.add(report)
    db.flush()
    return report.id


def mark_indexed_sources(db, result):
    """Promote readiness only for complete coarse source coverage with matching provenance.

    Readiness describes a sampled index; it does not verify every frame or any incident.
    Targeted reviews and existing-index runs cannot establish full source coverage.
    """
    report = db.get(Report, result.get("report_id")) if result.get("report_id") else None
    if not report:
        return []
    hashes = {s["asset_id"]: s.get("native_source_sha256") for s in report.content.get("integrity", [])}
    indexed = []
    for aid in result.get("selected_assets", []):
        asset = db.get(Asset, aid)
        if not asset or not asset.duration or asset.status in {"running", "queued", "failed"}:
            continue
        cfg = ensure_configuration(db, asset)
        source = db.get(SourceRecord, cfg.source_id)
        if not hashes.get(aid) or source.sha256 != hashes[aid]:
            continue
        windows = sorted(
            (w["requested_start"], w["requested_end"])
            for w in result.get("coverage", [])
            if w.get("asset_id") == aid and w.get("phase") == "coarse" and w.get("complete")
        )
        cursor = 0.0
        for start, end in windows:
            if start > cursor + 1e-4:
                break
            cursor = max(cursor, end)
        if cursor >= asset.duration - 1e-4:
            asset.status = "succeeded"
            indexed.append(aid)
    return indexed


def run_discovery(rid):
    with DB.begin() as db:
        claim = db.execute(
            update(DiscoveryRun).where(DiscoveryRun.id == rid, DiscoveryRun.status == "queued").values(status="running")
        )
        if not claim.rowcount:
            return
        run = db.get(DiscoveryRun, rid)
        opts = run.options
        cid = run.case_id
        owner = run.owner_id
    plan = incident_plan(opts["incident"])
    result = {
        "plan": plan,
        "selected_assets": opts["asset_ids"],
        "coverage": [],
        "eligible_ranges": [],
        "child_jobs": [],
        "warnings": [],
        "provider_requests": 0,
        "candidates": [],
        "resume_from": opts.get("resume_from"),
    }
    inherited = []
    inherited_hashes = {}
    if opts.get("resume_from"):
        with DB() as db:
            parent = db.get(DiscoveryRun, opts["resume_from"])
            inherited = [{**w, "inherited": True} for w in parent.result.get("coverage", []) if w.get("complete")]
            report = db.get(Report, parent.result.get("report_id")) if parent.result.get("report_id") else None
            inherited_hashes = (
                {s["asset_id"]: s.get("native_source_sha256", s["sha256"]) for s in report.content.get("integrity", [])}
                if report
                else {}
            )
            result["previous_provider_requests"] = parent.result.get("provider_requests", 0) + parent.result.get(
                "previous_provider_requests", 0
            )

    def save():
        with DB.begin() as db:
            db.get(DiscoveryRun, rid).result = dict(result)

    def cancelled():
        with DB() as db:
            return db.get(DiscoveryRun, rid).cancel_requested

    def inspect(aid, a, b, fps):
        remaining = opts["max_requests"] - result["provider_requests"]
        if remaining <= 0:
            return None
        child = AnalysisJob(
            id=uid(),
            asset_id=aid,
            owner_id=owner,
            request_key=f"{rid}-{len(result['child_jobs'])}",
            options={
                "mode": "meta",
                "concepts": plan["concepts"],
                "start": a,
                "end": b,
                "fps": fps,
                "max_windows": 1,
                "max_requests": min(remaining, len(plan["concepts"]) + 1),
            },
        )
        with DB.begin() as db:
            db.add(child)
        result["child_jobs"].append(child.id)
        save()
        run_job(child.id)
        with DB() as db:
            finished = db.get(AnalysisJob, child.id)
            payload = dict(finished.result)
            status = finished.status
        result["provider_requests"] += payload.get("provider_requests", 0)
        save()
        return {
            "asset_id": aid,
            "requested_start": a,
            "requested_end": b,
            "phase": "coarse" if fps == 0.5 else "reinspection",
            "status": status,
            "windows": payload.get("processed_segment_windows", []),
            "sampling_fps": fps,
            "complete": status == "succeeded" and not payload.get("budget_exhausted"),
            "reason": finished.error,
        }

    try:
        for aid in opts["asset_ids"]:
            if cancelled():
                break
            with DB.begin() as db:
                asset = db.get(Asset, aid)
                cfg = ensure_configuration(db, asset)
                source = db.get(SourceRecord, cfg.source_id)
                current_hash = source.sha256
                duration = source.metadata_json.get("duration", asset.duration)
                if inherited_hashes.get(aid) != current_hash:
                    inherited = [w for w in inherited if w["asset_id"] != aid]
            a, b = 0, duration
            if opts["start_date"]:
                if not cfg.clock_verified or not cfg.clock_start:
                    result["warnings"].append(f"{aid}: calendar scope blocked; source clock unverified")
                    continue
                epoch = datetime.fromisoformat(cfg.clock_start)
                lo = datetime.fromisoformat(opts["start_date"]).replace(tzinfo=epoch.tzinfo)
                hi = datetime.fromisoformat(opts["end_date"]).replace(tzinfo=epoch.tzinfo) + timedelta(days=1)
                a = max(0, (lo - epoch).total_seconds())
                b = min(duration, (hi - epoch).total_seconds())
                if a >= b:
                    result["warnings"].append(f"{aid}: outside selected calendar period")
                    continue
            result["eligible_ranges"].append({"asset_id": aid, "start": a, "end": b})
            snap = rebuild(aid)["data"]
            if opts["mode"] == "existing":
                result["coverage"].append(
                    {
                        "asset_id": aid,
                        "phase": "existing_index",
                        "complete": False,
                        "start": a,
                        "end": b,
                        "note": "Existing evidence only; no new video inference",
                    }
                )
                continue
            cuts = [t for t in snap["continuity"]["boundaries"] if a < t < b]
            reserve = min(4, opts["max_requests"] // 4) if opts["reinspect"] else 0
            for left, right in zip([a] + cuts, cuts + [b]):
                cursor = left
                while cursor < right - 1e-4:
                    end = min(right - 1e-5, cursor + 12)
                    prior = next(
                        (
                            w
                            for w in inherited
                            if w["asset_id"] == aid
                            and w["phase"] == "coarse"
                            and abs(w["requested_start"] - cursor) <= 1e-5
                            and abs(w["requested_end"] - end) <= 1e-5
                        ),
                        None,
                    )
                    if prior:
                        result["coverage"].append(prior)
                        cursor = end + 1e-5
                        continue
                    if (
                        cancelled()
                        or result["provider_requests"] + len(plan["concepts"]) + 1 > opts["max_requests"] - reserve
                    ):
                        break
                    end = min(right - 1e-5, cursor + 12)  # native windows, .5fps; <=7 coarse samples
                    coverage = inspect(aid, cursor, end, 0.5)
                    if coverage:
                        result["coverage"].append(coverage)
                    cursor = end + 1e-5
                    save()
                if cursor < right - 1e-4:
                    result["warnings"].append(
                        f"{aid}: unsearched {cursor:.3f}-{right:.3f}s; request budget/cancellation"
                    )
        with DB() as db:
            result["candidates"] = [
                c
                for c in rank_candidates(db, opts["asset_ids"], plan["concepts"])
                if any(
                    scope["asset_id"] == c["asset_id"] and scope["start"] <= c["start"] <= c["end"] <= scope["end"]
                    for scope in result["eligible_ranges"]
                )
            ]
        if opts["mode"] == "meta" and opts["reinspect"]:
            with DB() as db:
                targets = targeted_intervals(db, result)
            result["automatic_reinspection_targets"] = targets
            for candidate in targets:
                if cancelled() or result["provider_requests"] >= opts["max_requests"]:
                    break
                with DB() as db:
                    cuts = latest(db, candidate["asset_id"]).data["continuity"]["boundaries"]
                scope = next(
                    s
                    for s in result["eligible_ranges"]
                    if s["asset_id"] == candidate["asset_id"]
                    and s["start"] <= candidate["start"] <= candidate["end"] <= s["end"]
                )
                left = max([scope["start"]] + [t for t in cuts if t <= candidate["start"]])
                right = min([scope["end"]] + [t - 1e-5 for t in cuts if t > candidate["start"]])
                a = max(left, candidate["start"])
                b = min(right, candidate["end"])
                prior = next(
                    (
                        w
                        for w in inherited
                        if w["asset_id"] == candidate["asset_id"]
                        and w["phase"] == "reinspection"
                        and w["requested_start"] <= a + 1e-5
                        and w["requested_end"] >= b - 1e-5
                    ),
                    None,
                )
                if prior:
                    result["coverage"].append(prior)
                    continue
                coverage = inspect(candidate["asset_id"], a, b, 5)
                if coverage:
                    result["coverage"].append(coverage)
            remaining_targets = [
                t
                for t in targets
                if not any(
                    w.get("phase") == "reinspection"
                    and w.get("complete")
                    and w["asset_id"] == t["asset_id"]
                    and w["requested_start"] <= t["start"] + 1e-5
                    and w["requested_end"] >= t["end"] - 1e-5
                    for w in result["coverage"]
                )
            ]
            result["remaining_automatic_reinspection_targets"] = remaining_targets
            if remaining_targets:
                result["warnings"].append(
                    f"{len(remaining_targets)} automatic uncertainty review targets remain incomplete; explicit continuation required."
                )
        with DB.begin() as db:
            for event in db.scalars(select(Event).where(Event.asset_id.in_(opts["asset_ids"]))):
                if any(
                    scope["asset_id"] == event.asset_id and scope["start"] <= event.start <= event.end <= scope["end"]
                    for scope in result["eligible_ranges"]
                ) and not db.get(CaseEvidence, (cid, event.id)):
                    db.add(CaseEvidence(case_id=cid, event_id=event.id))
            db.flush()
            result["candidates"] = [
                c
                for c in rank_candidates(db, opts["asset_ids"], plan["concepts"])
                if any(
                    scope["asset_id"] == c["asset_id"] and scope["start"] <= c["start"] <= c["end"] <= scope["end"]
                    for scope in result["eligible_ranges"]
                )
            ]
            if not result["candidates"]:
                result["outcome"] = (
                    "No supported incident candidate found in the sampled evidence. This does not establish absence."
                )
            if opts["mode"] == "existing":
                result["warnings"].append("Existing-index mode does not establish full source coverage.")
            result["coverage_gaps"] = coverage_gaps(result)
            graph = graph_for_case(db, cid)
            support = frame_support_lookup(graph)
            for candidate in result["candidates"]:
                candidate["source_frames"] = [
                    frame
                    for evidence_id in candidate["evidence_ids"]
                    for frame in support(evidence_id)
                    if frame.get("source_id") and frame["frame_id"] in candidate["frame_ids"]
                ]
            result["report_id"] = snapshot_report(db, cid, result, owner, graph)
            run = db.get(DiscoveryRun, rid)
            run.result = dict(result)
            run.status = (
                "cancelled"
                if run.cancel_requested
                else (
                    "partial"
                    if result["warnings"]
                    or result["coverage_gaps"]
                    or any(not x.get("complete") for x in result["coverage"])
                    else "succeeded"
                )
            )
            if run.status == "succeeded":
                mark_indexed_sources(db, result)
    except Exception:
        import logging

        logging.getLogger("sensa").exception("Case discovery failed")
        with DB.begin() as db:
            run = db.get(DiscoveryRun, rid)
            run.status = "failed"
            run.result = {
                **result,
                "coverage_gaps": coverage_gaps(result),
                "error": "Discovery interrupted. Completed child evidence retained; see job diagnostics.",
            }
    audit(owner, "case.discovery_finished", cid, {"run_id": rid, "provider_requests": result["provider_requests"]})


class FindingDecision(BaseModel):
    reference: str = Field(min_length=3, max_length=200)
    disposition: str = Field(pattern="^(supported|rejected|unresolved)$")
    notes: str = Field(min_length=10, max_length=3000)


@router.post("/api/cases/{cid}/finding-reviews", status_code=201)
def finding_review(cid: str, body: FindingDecision, user=Depends(writer)):
    if user.role not in ("admin", "reviewer"):
        raise HTTPException(403, "Reviewer permission required")
    with DB.begin() as db:
        require_case(db, user, cid)
        g = graph_for_case(db, cid)
        if body.reference not in {n["id"] for n in g["nodes"]}:
            raise HTTPException(422, "Finding reference does not exist in case graph")
        record = FindingReview(
            id=uid(),
            case_id=cid,
            reference=body.reference,
            disposition=body.disposition,
            notes=body.notes,
            reviewer_id=user.id,
        )
        db.add(record)
        db.flush()
    audit(user.id, "case.finding_adjudicated", cid, {"review_id": record.id, "disposition": body.disposition})
    return serialize(record)


@router.get("/api/reports/{rid}/portable/{kind}")
def portable_report(rid: str, kind: Literal["summary", "appendix", "manifest", "json"], user=Depends(current_user)):
    with DB() as db:
        report = db.get(Report, rid)
        if not report:
            raise HTTPException(404, "Report not found")
        require_case(db, user, report.case_id)
        prepared = prepare(db, report)
        if kind == "manifest":
            return manifest(report, prepared)
        if kind == "json":
            return Response(
                json.dumps(portable_snapshot(report, prepared), indent=2),
                media_type="application/json",
                headers={"Content-Disposition": f'attachment; filename="sensa-portable-v{report.version}.json"'},
            )
        pdf = build_pdf(report, prepared, kind)
        return Response(
            pdf,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="sensa-{kind}-v{report.version}.pdf"',
            },
        )


@router.get("/api/reports/{rid}/pdf")
def report_pdf(rid: str, user=Depends(current_user)):
    import io
    from xml.sax.saxutils import escape
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, KeepTogether
    from reportlab.lib.styles import getSampleStyleSheet
    from fastapi.responses import Response

    with DB() as db:
        report = db.get(Report, rid)
        if not report:
            raise HTTPException(404, "Report not found")
        case = require_case(db, user, report.case_id)
        content = report.content
    styles = getSampleStyleSheet()
    origin = config.ORIGINS[0].rstrip("/")
    stream = io.BytesIO()
    story = []

    def paragraph(text, style="BodyText"):
        story.extend([Paragraph(escape(str(text)), styles[style]), Spacer(1, 7)])

    paragraph("SENSA - Investigation report", "Title")
    paragraph(f"{case.title} / v{report.version} / {report.status}", "Heading2")
    paragraph("Machine-assisted evidence review. Tracklets are not real identities. No guilt is inferred.")
    paragraph(content.get("scope", case.description))
    paragraph(content.get("methodology", "Selected evidence snapshot; source limitations apply."))
    models = sorted({str(r.get("model", "Unknown")) for r in content.get("models", [])})
    paragraph("Recorded processing models: " + (", ".join(models) or "No model records in this snapshot"))
    paragraph("Stock comparisons", "Heading1")
    for node in content.get("stock_comparisons", []):
        for row in node["data"].get("rows", []):
            paragraph(
                f"Before {row['before']['timestamp']:.3f}s / after {row['after']['timestamp']:.3f}s; visible detection change: {row['visible_detection_delta']}; independent inventory change: {row['independent_inventory_delta']}; state: {row['state']}"
            )
            paragraph(row["uncertainty"])
            comparison = row.get("visual_stock_discrepancy", {})
            if comparison.get("reason"):
                paragraph("Aligned shelf comparison unavailable. " + comparison["reason"])
            for key in ("before", "after"):
                href = origin + row[key]["url"]
                story.append(
                    Paragraph(f'<link href="{href}" color="blue">Original {key} frame</link>', styles["BodyText"])
                )
    paragraph("Aggregated event episodes", "Heading1")
    paragraph(
        "Repeated support records are grouped within continuous segments. Raw evidence and prior report versions are retained. An episode does not establish uninterrupted activity between samples."
    )
    for node in content.get("event_episodes", []):
        e = node["data"]
        paragraph(
            f"{e['start']:.3f}-{e['end']:.3f}s / {e['kind']} / {e['state']} / {e['sample_count']} sampled frames",
            "Heading3",
        )
        paragraph(e["uncertainty"])
        for frame in node.get("source_frames", []):
            href = origin + frame["url"]
            story.append(
                Paragraph(
                    f'<link href="{href}" color="blue">Original frame at {frame["timestamp"]:.3f}s</link>',
                    styles["BodyText"],
                )
            )
    for title, key in [("Anonymous person tracklets", "anonymous_tracks"), ("Object tracks", "object_tracks")]:
        paragraph(title, "Heading1")
        for node in content.get(key, []):
            track = node["data"]
            paragraph(node["label"], "Heading3")
            paragraph(
                f"Source-relative {track.get('first', 0):.3f}-{track.get('last', 0):.3f}s / segment {track.get('segment')} / {track.get('category')}"
            )
            paragraph("A visual association fragment; distinct-person count and real identity are not established.")
    for title, key in [
        ("Observed evidence", "observations"),
        ("AI interpretations", "interpretations"),
        ("Possible hypotheses", "possible_hypotheses"),
        ("Contradictory evidence", "contradictory_evidence"),
    ]:
        paragraph(title, "Heading1")
        for row in content.get(key, []):
            paragraph(row.get("title", row.get("label", "Evidence")), "Heading3")
            data = row.get("data", {})
            for field in ("person_track", "object_track", "from_track", "to_track", "state", "resolution"):
                if data.get(field) is not None:
                    paragraph(field.replace("_", " ") + ": " + str(data[field]))
            paragraph(
                row.get(
                    "description",
                    row.get("data", {}).get(
                        "uncertainty", row.get("data", {}).get("description", "Unresolved hypothesis")
                    ),
                )
            )
            sources = {f["source_id"] for f in row.get("source_frames", []) if f.get("source_id")}
            if row.get("asset_id") and len(sources) == 1:
                href = f"{origin}/api/videos/{row['asset_id']}/native-media?source_id={sources.pop()}#t={row.get('start', 0)}"
                story.append(
                    Paragraph(
                        f'<link href="{href}" color="blue">Video at {row.get("start", 0):.3f}s</link>',
                        styles["BodyText"],
                    )
                )
            for f in row.get("source_frames", [])[:8]:
                fid = f.get("frame_id", f.get("id"))
                href = origin + f.get("url", f"/api/frames/{fid}/native")
                story.append(
                    Paragraph(
                        f'<link href="{href}" color="blue">Native frame {escape(str(fid))} / {f.get("timestamp", 0):.6f}s</link>',
                        styles["BodyText"],
                    )
                )
    paragraph("Chronological incident timeline", "Heading1")
    for row in content.get("timeline", []):
        paragraph(
            f"{row.get('camera_timestamp') or row.get('camera', 'Recording')} / {row.get('start', 0):.3f}s - {row.get('end', 0):.3f}s: {row['title']}"
        )
    paragraph("Chronology and coverage", "Heading1")
    paragraph(content.get("chronology_policy", "Source-relative per recording; unverified source clocks."))
    discovery = content.get("discovery", {})
    for window in discovery.get("coverage", []):
        paragraph(
            f"{window.get('asset_id')} / {window.get('phase')} / {window.get('requested_start', window.get('start'))}-{window.get('requested_end', window.get('end'))}s / complete: {window.get('complete')}"
        )
    paragraph("Missing evidence / limitations", "Heading1")
    for gap in discovery.get("coverage_gaps", []):
        paragraph(f"{gap['asset_id']} / {gap['start']:.3f}-{gap['end']:.3f}s / {gap['status']}")
        if gap.get("reason"):
            paragraph(gap["reason"])
    for item in content.get("missing_evidence", []):
        paragraph(item)
    paragraph(content.get("uncertainty", ""))
    paragraph(content.get("limitations", ""))
    paragraph("Human finding adjudications", "Heading1")
    for review in content.get("human_reviews", []):
        paragraph(review["label"] + ": " + review["data"].get("notes", ""))
    paragraph("Human conclusion", "Heading1")
    paragraph(content.get("human_conclusion") or "No human conclusion recorded. Human verification required.")
    for index, source in enumerate(content.get("integrity", [])):
        source_lines = [source["name"], "Uploaded source SHA-256: " + source["sha256"]]
        if source.get("native_source_sha256"):
            source_lines.append("Registered native source SHA-256: " + source["native_source_sha256"])
        if source.get("native_source_relationship"):
            source_lines.append("Source registration: " + source["native_source_relationship"].replace("_", " "))
        clock = source.get("clock_mapping", {})
        if clock:
            source_lines.append("Source clock verified: " + ("yes" if clock["verified"] else "no"))
        heading = [Paragraph("Source integrity", styles["Heading1"])] if index == 0 else []
        story.append(KeepTogether(heading + [Paragraph(escape(line), styles["BodyText"]) for line in source_lines]))

    def footer(canvas, doc):
        canvas.setFont("Helvetica", 8)
        canvas.drawString(40, 25, "SENSA / " + report.status + " / playback times require source-clock verification")
        canvas.drawRightString(555, 25, str(doc.page))

    SimpleDocTemplate(
        stream, title="SENSA Investigation", leftMargin=40, rightMargin=40, topMargin=40, bottomMargin=45
    ).build(story, onFirstPage=footer, onLaterPages=footer)
    data = stream.getvalue()
    audit(user.id, "report.pdf_export", rid, {"sha256": __import__("hashlib").sha256(data).hexdigest()})
    return Response(
        data,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="sensa-report-v{report.version}.pdf"'},
    )
