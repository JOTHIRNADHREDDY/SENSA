"""Count visible detections and suggest anonymous links. Neither establishes stock loss or identity."""

import math
from collections import defaultdict
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, model_validator
from PIL import Image
from sqlalchemy import select
from . import config
from .db import (
    DB,
    DerivedArtifact,
    Frame,
    Observation,
    ModelRun,
    CaseVideo,
    EnrichmentRecord,
    serialize,
    audit,
    uid,
    SourceRecord,
)
from .intelligence import latest, stable, ensure_configuration
from .security import current_user, writer, require_asset, require_case
from .vision import iou, segment_at
from .association import register_images
from .registration import bounds, corners, inverse, motion_matrix, transform_point
from .evidence import frame_reference, native_artifacts, source_frame_references
from .media import sha256

router = APIRouter()
ALIASES = {"cardboard box": "package", "carton": "package", "package": "package", "flower pot": "plant"}


def group(label):
    return ALIASES.get(label, label)


def torso_signature(path, box):
    """Coarse clothing colour histogram; excludes the upper quarter/head region."""
    with Image.open(path) as image:
        w, h = image.size
        x1, y1, x2, y2 = box
        crop = image.convert("RGB").crop(
            (
                int((x1 + 0.1 * (x2 - x1)) * w),
                int((y1 + 0.25 * (y2 - y1)) * h),
                max(1, int((x2 - 0.1 * (x2 - x1)) * w)),
                max(1, int((y1 + 0.85 * (y2 - y1)) * h)),
            )
        )
        if crop.width < 2 or crop.height < 2:
            return None
        pixels = list(crop.resize((24, 32)).convert("HSV").get_flattened_data())
        bins = [0] * 128
        for hue, sat, val in pixels:
            bins[(hue // 32) * 16 + (sat // 64) * 4 + val // 64] += 1
        total = sum(bins)
        return [v / total for v in bins]


def similarity(a, b):
    return sum(math.sqrt(x * y) for x, y in zip(a, b))


def stock_inputs(db, asset_id, bindings):
    """Load the latest compatible query and its detections for each requested frame."""
    chosen = {fid: {} for fid in bindings}
    runs = {}
    for run in db.scalars(
        select(ModelRun)
        .where(ModelRun.asset_id == asset_id, ModelRun.status == "succeeded")
        .order_by(ModelRun.created.desc(), ModelRun.id.desc())
    ):
        concept = run.raw.get("concept")
        if not concept:
            continue
        for frame in run.raw.get("source_frames", run.raw.get("input_frames", [])):
            fid = frame.get("id", frame.get("frame_id"))
            if fid not in bindings:
                continue
            expected, uploaded = bindings[fid]
            if expected is not None and (run.raw.get("source_sha256") or uploaded) == expected:
                chosen[fid].setdefault(concept, run.id)
                runs[run.id] = run
    run_ids = {fid: set(concepts.values()) for fid, concepts in chosen.items()}
    selected = set().union(*run_ids.values())
    observations = defaultdict(list)
    if selected:
        for ob in db.scalars(select(Observation).where(Observation.asset_id == asset_id).order_by(Observation.id)):
            if ob.run_id in run_ids.get(ob.frame_id, ()):
                observations[ob.frame_id].append(ob)
    digests = {rid: stable(runs[rid].raw) for rid in selected}
    return {
        fid: (
            {group(concept) for concept in concepts},
            observations[fid],
            {rid: digests[rid] for rid in sorted(run_ids[fid])},
        )
        for fid, concepts in chosen.items()
    }


def count_view(frame, labels, roi, inputs, alignment=None, foreground=None):
    queried, observations, digests = inputs
    if foreground is not None:
        foreground.extend(o.box for o in observations if group(o.label) in {"person", "package", "bag", "trolley"})
    objects = []
    wanted = {group(label) for label in labels}
    roi_in_frame = bounds(corners(roi, alignment)) if alignment is not None else roi
    to_reference = inverse(alignment) if alignment is not None else None
    for ob in observations:
        center = ((ob.box[0] + ob.box[2]) / 2, (ob.box[1] + ob.box[3]) / 2)
        if to_reference is not None:
            center = transform_point(to_reference, center)
        if group(ob.label) not in wanted or not (roi[0] <= center[0] <= roi[2] and roi[1] <= center[1] <= roi[3]):
            continue
        if any(group(old.label) == group(ob.label) and iou(old.box, ob.box) >= 0.65 for old in objects):
            continue
        objects.append(ob)
    persons = [o for o in observations if o.label == "person" and iou(o.box, roi_in_frame) > 0]
    covered = wanted <= queried
    return {
        "frame_id": frame.id,
        "asset_id": frame.asset_id,
        "timestamp": frame.timestamp,
        "url": f"/api/frames/{frame.id}/native",
        "count": len(objects) if covered else None,
        "localized_objects": len(objects),
        "queried_groups": sorted(queried),
        "missing_concept_coverage": sorted(wanted - queried),
        "potential_occlusion": bool(persons),
        "occlusion_assessed": "person" in queried,
        "observation_ids": [o.id for o in objects],
        "boxes": [o.box for o in objects],
        "model_run_ids": list(digests),
        "raw_response_sha256": digests,
        "count_basis": "Deduplicated model-localized visible regions, not verified inventory",
    }


class StockRequest(BaseModel):
    before_frame_id: str
    after_frame_id: str
    labels: list[str] = Field(default=["cardboard box"], min_length=1, max_length=8)
    roi: list[float] = Field(default=[0, 0, 1, 1], min_length=4, max_length=4)
    independent_before: int | None = Field(default=None, ge=0, le=1000000)
    independent_after: int | None = Field(default=None, ge=0, le=1000000)
    inventory_reference: str = Field(default="", max_length=1000)

    @model_validator(mode="after")
    def valid(self):
        from .inspection import CONCEPTS

        if not set(self.labels) <= CONCEPTS or "person" in self.labels:
            raise ValueError("Choose supported object nouns")
        if not all(0 <= n <= 1 for n in self.roi) or self.roi[0] >= self.roi[2] or self.roi[1] >= self.roi[3]:
            raise ValueError("Invalid normalized region")
        if (self.independent_before is None) != (self.independent_after is None):
            raise ValueError("Both independent inventory counts are required together")
        if self.independent_before is not None and len(self.inventory_reference) < 10:
            raise ValueError("Independent inventory counts require a source reference")
        return self


@router.get("/api/videos/{aid}/stock-views")
def stock_views(aid: str, label: str = Query("cardboard box", max_length=50), user=Depends(current_user)):
    from .inspection import CONCEPTS

    if label not in CONCEPTS or label == "person":
        raise HTTPException(422, "Unsupported object label")
    with DB() as db:
        asset = require_asset(db, user, aid)
        sources = {s.id: s for s in db.scalars(select(SourceRecord).where(SourceRecord.asset_id == aid))}
        artifacts_by_frame = {}
        for artifact in native_artifacts(db, aid):
            artifacts_by_frame.setdefault(artifact.frame_id, []).append(artifact)
        frames = db.scalars(select(Frame).where(Frame.asset_id == aid).order_by(Frame.timestamp)).all()
        refs = {
            frame.id: frame_reference(asset, frame, artifacts_by_frame.get(frame.id, []), sources) for frame in frames
        }
        inputs = stock_inputs(db, aid, {fid: (ref.get("source_sha256"), asset.sha256) for fid, ref in refs.items()})
        return {
            "views": [
                {**count_view(frame, [label], [0, 0, 1, 1], inputs[frame.id]), **refs[frame.id]} for frame in frames
            ],
            "policy": "Unknown coverage is null, never zero. A count change is not confirmed removal.",
        }


@router.post("/api/cases/{cid}/stock-comparisons", status_code=201)
def stock_comparison(cid: str, body: StockRequest, user=Depends(writer)):
    with DB.begin() as db:
        require_case(db, user, cid)
        scope = set(db.scalars(select(CaseVideo.asset_id).where(CaseVideo.case_id == cid)))
        pair = [db.get(Frame, fid) for fid in (body.before_frame_id, body.after_frame_id)]
        if any(f is None or f.asset_id not in scope for f in pair):
            raise HTTPException(422, "Select source frames from this investigation's recording scope")
        if pair[0].asset_id == pair[1].asset_id and pair[0].timestamp >= pair[1].timestamp:
            raise HTTPException(422, "Before frame must precede the after frame")
        provenance, image_paths, exclusions = [], [], [[], []]
        bindings = defaultdict(dict)
        for frame in pair:
            asset = require_asset(db, user, frame.asset_id)
            sources = {s.id: s for s in db.scalars(select(SourceRecord).where(SourceRecord.asset_id == asset.id))}
            artifacts = list(native_artifacts(db, asset.id, frame.id))
            ref = frame_reference(asset, frame, artifacts, sources)
            provenance.append({**ref, "source_pts": frame.timestamp})
            bindings[asset.id][frame.id] = (ref.get("source_sha256"), asset.sha256)
            path = config.DATA / asset.id / "frames" / frame.filename
            if ref["binding"] == "native_artifact":
                path = (config.DATA / artifacts[0].path).resolve()
                if not path.is_relative_to(config.DATA) or not path.is_file() or sha256(path) != ref["frame_sha256"]:
                    path = None
            image_paths.append(path)
        inputs = {aid: stock_inputs(db, aid, sources) for aid, sources in bindings.items()}
        before, after = [
            count_view(f, body.labels, body.roi, inputs[f.asset_id][f.id], foreground=boxes)
            for f, boxes in zip(pair, exclusions)
        ]
        snap = latest(db, pair[0].asset_id)
        cuts = snap.data["continuity"]["boundaries"] if snap else []
        source_hash = provenance[0].get("source_sha256")
        same_view = (
            pair[0].asset_id == pair[1].asset_id
            and source_hash is not None
            and source_hash == provenance[1].get("source_sha256")
            and (snap is None or snap.data["source"]["sha256"] == source_hash)
            and segment_at(pair[0].timestamp, cuts) == segment_at(pair[1].timestamp, cuts)
        )
        alignment = {"state": "unregistered", "translation": None, "reason": "different source or continuity segment"}
        if same_view:
            if None in image_paths:
                alignment["reason"] = "source frame missing or failed integrity verification"
            try:
                if None not in image_paths:
                    with Image.open(image_paths[0]) as a, Image.open(image_paths[1]) as b:
                        alignment = register_images(a, b, *exclusions)
            except (OSError, ValueError):
                alignment["reason"] = "source frame unavailable"
        after_roi = list(body.roi)
        roi_visible = False
        matrix = motion_matrix(alignment)
        after_polygon = None
        if matrix is not None:
            after_polygon = corners(body.roi, matrix)
            after_roi = bounds(after_polygon)
            roi_visible = all(0 <= v <= 1 for point in after_polygon for v in point)
            if roi_visible:
                after = count_view(pair[1], body.labels, body.roi, inputs[pair[1].asset_id][pair[1].id], matrix)
        for view, ref in zip((before, after), provenance):
            view["url"] = ref["url"]
        known = same_view and before["count"] is not None and after["count"] is not None
        delta = after["count"] - before["count"] if known else None
        visibility_clear = all(
            view["occlusion_assessed"] and not view["potential_occlusion"] for view in (before, after)
        )
        if not roi_visible:
            comparison_reason = "Shelf region extends outside the after frame" if matrix else alignment["reason"]
        elif not visibility_clear:
            comparison_reason = "Shelf visibility is obstructed or lacks person-query coverage"
        elif delta is None:
            comparison_reason = "Object-query coverage is incomplete"
        else:
            comparison_reason = None
        independent_delta = (
            (body.independent_after - body.independent_before) if body.independent_before is not None else None
        )
        result = {
            "record_id": uid(),
            "before_reference": "frame:" + pair[0].id,
            "after_reference": "frame:" + pair[1].id,
            "before": before,
            "after": after,
            "roi": body.roi,
            "after_roi": after_roi,
            "after_roi_polygon": after_polygon,
            "camera_motion": alignment,
            "fixed_shelf_comparable": bool(same_view and roi_visible),
            "source_provenance": provenance,
            "labels": body.labels,
            "comparable_continuous_view": same_view,
            "visible_detection_delta": delta,
            "independent_inventory_delta": independent_delta,
            "visual_stock_discrepancy": {
                "visible_detection_delta": delta,
                "aligned_shelf_delta": delta if comparison_reason is None else None,
                "visibility_clear": visibility_clear,
                "availability": "available" if comparison_reason is None else "unavailable",
                "reason": comparison_reason,
                "state": "UNRESOLVED",
            },
            "inventory_discrepancy": {
                "delta": independent_delta,
                "reference": body.inventory_reference,
                "verified": False,
            },
            "possible_removal": {
                "state": "UNRESOLVED",
                "established": False,
                "basis": "Counts alone cannot establish removal or responsibility",
            },
            "human_conclusion": None,
            "inventory_reference": body.inventory_reference,
            "inventory_basis": "User-supplied record; independent authenticity/human verification required"
            if independent_delta is not None
            else "No independent inventory supplied",
            "count_change_agrees": delta == independent_delta
            if delta is not None and independent_delta is not None
            else None,
            "state": "UNRESOLVED",
            "confirmed_removal": False,
            "uncertainty": "Occlusion, detector misses, camera movement and stock hidden outside the region may change counts. A visual or inventory discrepancy does not establish responsibility.",
        }
        provenance_key = {
            "body": body.model_dump(),
            "before": before,
            "after": after,
            "registration": alignment,
            "visibility_policy": "assessed-clear-v1",
        }
        key = stable(provenance_key)
        prior = db.scalar(
            select(EnrichmentRecord).where(EnrichmentRecord.case_id == cid, EnrichmentRecord.source_sha256 == key)
        )
        if prior:
            return serialize(prior)
        record = EnrichmentRecord(
            id=uid(), case_id=cid, kind="stock_comparison", rows=[result], source_sha256=key, imported_by=user.id
        )
        db.add(record)
        db.flush()
    audit(user.id, "stock.comparison", cid, {"record_id": record.id, "state": "UNRESOLVED"})
    return serialize(record)


@router.get("/api/cases/{cid}/stock-comparisons")
def saved_stock_comparison(cid: str, user=Depends(current_user)):
    with DB() as db:
        require_case(db, user, cid)
        records = db.scalars(
            select(EnrichmentRecord)
            .where(EnrichmentRecord.case_id == cid, EnrichmentRecord.kind == "stock_comparison")
            .order_by(EnrichmentRecord.created.desc(), EnrichmentRecord.id.desc())
        )
        for record in records:
            if all(
                "?" in row.get("before", {}).get("url", "")
                and "?" in row.get("after", {}).get("url", "")
                and "visual_stock_discrepancy" in row
                for row in record.rows
            ):
                return serialize(record)
    return None


@router.get("/api/cases/{cid}/association-proposals")
def association_proposals(cid: str, max_gap: int = Query(300, ge=1, le=3600), user=Depends(current_user)):
    tracks, warnings = [], []
    with DB.begin() as db:
        require_case(db, user, cid)
        scope = list(db.scalars(select(CaseVideo.asset_id).where(CaseVideo.case_id == cid)))
        for aid in scope:
            asset = require_asset(db, user, aid)
            cfg = ensure_configuration(db, asset)
            if not cfg.clock_verified or not cfg.clock_start:
                warnings.append(
                    {"asset_id": aid, "reason": "Source clock unverified; cross-camera temporal matching blocked"}
                )
                continue
            snap = latest(db, aid)
            if not snap:
                continue
            if snap.data["source"]["id"] != cfg.source_id or snap.data["clock"] != {
                "start": cfg.clock_start,
                "verified": cfg.clock_verified,
                "evidence": cfg.clock_evidence,
            }:
                warnings.append({"asset_id": aid, "reason": "Source or clock changed since analysis; rebuild required"})
                continue
            references = source_frame_references(db, asset, db.get(SourceRecord, cfg.source_id))
            for t in snap.data["tracks"]:
                if t["category"] != "person":
                    continue
                samples, frame_refs = [], []
                for oid in (t["observations"][0], t["observations"][-1]):
                    ob = db.get(Observation, oid)
                    ref = references.get(ob.frame_id, {})
                    artifact = db.get(DerivedArtifact, ref["artifact_id"]) if ref.get("artifact_id") else None
                    if artifact is not None:
                        path = (config.DATA / artifact.path).resolve()
                        if (
                            not path.is_relative_to(config.DATA)
                            or not path.is_file()
                            or sha256(path) != artifact.sha256
                        ):
                            continue
                    elif (
                        asset.synthetic
                        and ob.provenance == "fixture_annotation"
                        and ref.get("binding") == "uploaded_source"
                    ):
                        frame = db.get(Frame, ob.frame_id)
                        path = config.DATA / aid / "frames" / frame.filename
                        if not path.is_file():
                            continue
                    else:
                        continue
                    samples.append(torso_signature(path, ob.box))
                    frame_refs.append(ref)
                if len(samples) == 2 and all(samples):
                    epoch = datetime.fromisoformat(cfg.clock_start)
                    tracks.append(
                        {
                            "asset_id": aid,
                            "camera_id": cfg.camera_id,
                            "source_clock_mapping": {
                                "source_pts_zero": cfg.clock_start,
                                "verified": cfg.clock_verified,
                                "evidence": cfg.clock_evidence,
                                "source_id": cfg.source_id,
                            },
                            "track": t,
                            "start": (epoch + timedelta(seconds=t["first"])).timestamp(),
                            "end": (epoch + timedelta(seconds=t["last"])).timestamp(),
                            "signatures": samples,
                            "frame_refs": frame_refs,
                        }
                    )
    proposals = []
    truncated = len(tracks) > 1000
    tracks = sorted(tracks, key=lambda t: t["start"])[:1000]
    for a in tracks:
        candidates = []
        for b in tracks:
            gap = b["start"] - a["end"]
            if a["camera_id"] == b["camera_id"] or not 0 <= gap <= max_gap:
                continue
            color = similarity(a["signatures"][-1], b["signatures"][0])
            if color < 0.8:
                continue
            candidates.append((0.85 * color + 0.15 * (1 - gap / max_gap), b, gap, color))
        candidates.sort(key=lambda c: -c[0])
        for score, b, gap, color in candidates[:3]:
            proposals.append(
                {
                    "from_reference": "track:" + a["track"]["id"],
                    "to_reference": "track:" + b["track"]["id"],
                    "from_asset": a["asset_id"],
                    "to_asset": b["asset_id"],
                    "from_frame": a["track"]["frame_ids"][-1],
                    "to_frame": b["track"]["frame_ids"][0],
                    "from_frame_url": a["frame_refs"][-1]["url"],
                    "to_frame_url": b["frame_refs"][0]["url"],
                    "gap_seconds": round(gap, 3),
                    "from_clock_mapping": a["source_clock_mapping"],
                    "to_clock_mapping": b["source_clock_mapping"],
                    "clothing_color_similarity": round(color, 4),
                    "ranking_score": round(score, 4),
                    "ambiguous": len(candidates) > 1 and candidates[0][0] - candidates[1][0] < 0.1,
                    "state": "UNRESOLVED",
                    "identity_verified": False,
                    "basis": "Verified source clocks and coarse clothing colour; no face/biometric matching. Clothing resemblance is not identity. Human review and scene topology required.",
                }
            )
    proposals.sort(key=lambda p: -p["ranking_score"])
    return {
        "proposals": proposals[:50],
        "warnings": warnings,
        "truncated": truncated or len(proposals) > 50,
        "policy": "Anonymous link proposals only. No track merging, real identity or guilt inference.",
    }
