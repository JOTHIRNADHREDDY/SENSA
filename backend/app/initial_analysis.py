"""Initial real inference uses cut-safe chunks and a hard 12-request budget."""

import shutil
import time
from collections import defaultdict

from sqlalchemy import select
from . import config
from .db import DB, ModelRun, Observation, Event, uid
from .intelligence import rebuild, stable
from .inspection import proxy_for, scene_review
from .providers import MetaProvider, ProviderError
from .media import sha256
from .vision import segment_at


def analyze(asset, frames):
    snapshot = rebuild(asset.id)["data"]
    groups = defaultdict(list)
    for f in sorted(frames, key=lambda f: f["timestamp"]):
        f = {**f, "sha256": sha256(f["path"])}
        groups[segment_at(f["timestamp"], snapshot["continuity"]["boundaries"])].append(f)
    chunks = [fs[i : i + 12] for fs in groups.values() for i in range(0, len(fs), 12)]
    tasks = [(fs, "person") for fs in chunks[:8]]
    relevant = sorted(chunks, key=lambda fs: (-len(fs), fs[0]["timestamp"]))[:2]
    if relevant:
        tasks.extend([(relevant[0], "cardboard box"), (relevant[0], "shelf")])
    tasks.extend((fs, "__spark__") for fs in relevant)
    provider = MetaProvider()
    failed = False
    grounding = []
    for fs, concept in tasks[:12]:
        model = config.MODEL_ANALYSIS if concept == "__spark__" else config.MODEL_PERCEPTION
        key = stable(
            {
                "version": "initial-cut-safe-v2",
                "model": model,
                "concept": concept,
                "source": asset.sha256,
                "frames": [(f["timestamp"], f["sha256"]) for f in fs],
            }
        )
        with DB() as db:
            cached = next(
                (
                    r
                    for r in db.scalars(
                        select(ModelRun).where(
                            ModelRun.asset_id == asset.id, ModelRun.model == model, ModelRun.status == "succeeded"
                        )
                    )
                    if r.raw.get("cache_key") == key
                ),
                None,
            )
            if cached:
                grounding.extend(
                    {"frame_id": o.frame_id, "category": o.label, "box": o.box}
                    for o in db.scalars(select(Observation).where(Observation.run_id == cached.id))
                )
                continue
        folder = config.DATA / asset.id / "intelligence" / ("proxy-" + uid())
        proxy, dimensions = proxy_for(fs, folder)
        rid = uid()
        before = time.monotonic()
        initial = {
            "cache_key": key,
            "source_sha256": asset.sha256,
            "source_frames": [{k: v for k, v in f.items() if k != "path"} for f in fs],
            "original_dimensions": [asset.width, asset.height],
            "inference_dimensions": dimensions,
            "prompt_version": "initial-cut-safe-v2",
            "concept": concept,
            "usage_status": "unknown",
            "completion_status": "running",
            "remote_file_cleanup": "unknown until response",
        }
        with DB.begin() as db:
            db.add(
                ModelRun(
                    id=rid,
                    asset_id=asset.id,
                    model=model,
                    provider="meta-standard",
                    status="running",
                    routing="Cut-safe bounded initial grounding. At most 12 requests; routine Spark receives a single continuous segment.",
                    raw=initial,
                )
            )
        try:
            if concept == "__spark__":
                review, meta = scene_review(
                    provider, fs, [g for g in grounding if g["frame_id"] in {f["id"] for f in fs}]
                )
                detections = []
            else:
                detections, meta = provider.segment_video(proxy, fs, *dimensions, prompt=concept)
            with DB.begin() as db:
                run = db.get(ModelRun, rid)
                run.status = "succeeded"
                run.raw = {**initial, **meta}
                run.usage = meta.get("usage", {})
                run.elapsed_ms = int((time.monotonic() - before) * 1000)
                for det in detections:
                    ob = Observation(
                        id=uid(), asset_id=asset.id, run_id=rid, label=concept, provenance="meta_inference", **det
                    )
                    db.add(ob)
                    db.flush()
                    grounding.append({"frame_id": det["frame_id"], "category": concept, "box": det["box"]})
                    db.add(
                        Event(
                            asset_id=asset.id,
                            observation_id=ob.id,
                            run_id=rid,
                            title=concept.capitalize() + " localized",
                            description="Prompted visual localization on a sampled frame. A detection is not a real identity, verified object handling or proof of absence elsewhere.",
                            type="person_presence" if concept == "person" else "object_presence",
                            start=ob.timestamp,
                            end=ob.timestamp,
                            provenance="meta_inference",
                        )
                    )
                if concept == "__spark__":
                    by_id = {f["id"]: f for f in fs}
                    for item in review.observations:
                        ts = by_id[item.frame_id]["timestamp"]
                        db.add(
                            Event(
                                asset_id=asset.id,
                                run_id=rid,
                                title="Scene interpretation",
                                description=(
                                    f"Model estimated person count: {item.visible_person_count}. "
                                    if item.visible_person_count is not None
                                    else ""
                                )
                                + item.description
                                + (
                                    " Object action " + item.object_action + " remains UNRESOLVED."
                                    if item.object_action not in ("none", "unresolved")
                                    else ""
                                ),
                                type="scene_analysis",
                                category="inferred",
                                start=ts,
                                end=ts,
                                provenance="meta_inference",
                            )
                        )
        except ProviderError as exc:
            failed = True
            with DB.begin() as db:
                run = db.get(ModelRun, rid)
                run.status = "failed"
                run.raw = {**initial, **exc.details, "error": str(exc)}
                run.usage = exc.details.get("usage", {})
                run.elapsed_ms = int((time.monotonic() - before) * 1000)
        finally:
            shutil.rmtree(folder, ignore_errors=True)
    rebuild(asset.id)
    return failed or len(chunks) > 8
