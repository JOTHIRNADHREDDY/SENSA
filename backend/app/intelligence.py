"""Append-only intelligence snapshots and case-scoped evidence correlation."""

import hashlib
import json
import re
import threading
import math
from datetime import datetime, timedelta

from sqlalchemy import select

from . import config
from .db import (
    DB,
    Asset,
    CameraRecord,
    SourceRecord,
    VideoConfiguration,
    IntelligenceSnapshot,
    Observation,
    Frame,
    ModelRun,
    Event,
    FindingEvent,
    CaseEvidence,
    CaseVideo,
    FindingReview,
    Case,
    Report,
    EnrichmentRecord,
    uid,
    serialize,
)
from .media import sha256, MediaError
from .vision import VERSION, scan_video, associate, interactions, reinspection_plan, segment_at, mask_shape, center
from .association import deduplicate, frame_motion, event_episodes, category
from .registration import inverse, motion_matrix, transform_point
from .evidence import frame_reference, matches_frame, native_artifacts, uploaded_source

lock = threading.RLock()


def stable(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, default=str).encode()).hexdigest()


def ensure_configuration(db, asset):
    setting = db.get(VideoConfiguration, asset.id)
    if setting:
        return setting
    camera = CameraRecord(
        id=uid(),
        owner_id=asset.owner_id,
        label=asset.camera,
        metadata_json={"synchronization": "unverified", "cross_camera_association": "not inferred"},
    )
    source = uploaded_source(db, asset)
    db.add(camera)
    db.flush()
    setting = VideoConfiguration(asset_id=asset.id, camera_id=camera.id, source_id=source.id)
    db.add(setting)
    db.flush()
    return setting


def source_path(record):
    path = (config.DATA / record.path).resolve()
    if not path.is_relative_to(config.DATA) or not path.is_file():
        raise MediaError("Registered native source is missing or outside protected storage")
    if sha256(path) != record.sha256:
        raise MediaError("Registered source integrity verification failed")
    return path


def continuity_for(asset, source):
    path = source_path(source)
    folder = config.DATA / asset.id / "intelligence"
    folder.mkdir(exist_ok=True)
    cache = folder / f"continuity-{source.sha256[:20]}-{VERSION}.json"
    if cache.exists():
        result = json.loads(cache.read_text())
    else:
        result = scan_video(path, source.metadata_json.get("fps", asset.fps))
        cache.write_text(json.dumps(result), encoding="utf-8")
    return result


def rebuild(asset_id):
    with lock:
        return _rebuild(asset_id)


def _rebuild(asset_id):
    with DB.begin() as db:
        asset = db.get(Asset, asset_id)
        setting = ensure_configuration(db, asset)
        source = db.get(SourceRecord, setting.source_id)
        camera_id = setting.camera_id
        zones = setting.zones
        clock = {"start": setting.clock_start, "verified": setting.clock_verified, "evidence": setting.clock_evidence}
        frame_rows = {f.id: f for f in db.scalars(select(Frame).where(Frame.asset_id == asset_id))}
        native_images = {}
        if source.sha256 != asset.sha256:
            # Historical frame slots can have the same PTS in two different files.
            # Alternate-source analysis needs a native artifact bound to these bytes.
            for artifact in native_artifacts(db, asset_id):
                frame = frame_rows.get(artifact.frame_id)
                if frame is not None and matches_frame(artifact, source, frame) and frame.id not in native_images:
                    path = (config.DATA / artifact.path).resolve()
                    native_images[frame.id] = (
                        path
                        if path.is_relative_to(config.DATA) and path.is_file() and sha256(path) == artifact.sha256
                        else None
                    )
            frame_rows = {fid: frame_rows[fid] for fid in native_images}
        frames = {fid: serialize(frame) for fid, frame in frame_rows.items()}
        runs = {r.id: r for r in db.scalars(select(ModelRun).where(ModelRun.asset_id == asset_id))}
        compatible_runs = {
            rid for rid, run in runs.items() if (run.raw.get("source_sha256") or asset.sha256) == source.sha256
        }
        observations = [
            serialize(o, ("mask",))
            for o in db.scalars(select(Observation).where(Observation.asset_id == asset_id))
            if o.frame_id in frames and o.run_id in compatible_runs
        ]
        events = [
            serialize(e)
            for e in db.scalars(
                select(Event).where(Event.asset_id == asset_id, Event.provenance != "deterministic_geometry")
            )
            if e.run_id in compatible_runs
        ]
    duration = source.metadata_json.get("duration", asset.duration)

    def image_path(frame):
        if frame["id"] in native_images:
            return native_images[frame["id"]]
        return config.DATA / asset_id / "frames" / frame["filename"]

    continuity = continuity_for(asset, source)
    fingerprint = stable(
        {
            "version": VERSION,
            "source": source.sha256,
            "frame_binding_policy": "source-hash-v1",
            "available_native_images": [fid for fid, path in native_images.items() if path is not None],
            "observations": observations,
            "frames": list(frames),
            "camera": camera_id,
            "zones": zones,
            "clock": clock,
            "events": events,
            "query_runs": [
                {
                    "id": r.id,
                    "status": r.status,
                    "created": r.created,
                    "concept": r.raw.get("concept"),
                    "frames": r.raw.get("source_frames", r.raw.get("input_frames", [])),
                }
                for r in runs.values()
                if r.provider != "deterministic" and r.id in compatible_runs
            ],
        }
    )
    with DB() as db:
        cached = db.scalar(
            select(IntelligenceSnapshot).where(
                IntelligenceSnapshot.asset_id == asset_id, IntelligenceSnapshot.fingerprint == fingerprint
            )
        )
        if cached:
            return serialize(cached)
    # One inference batch per frame/category; retain all raw observations separately for audit.
    claims = {}
    for run in sorted(runs.values(), key=lambda r: (r.created, r.id)):
        if run.id not in compatible_runs:
            continue
        concept = run.raw.get("concept")
        if run.status == "succeeded" and concept and concept != "__spark__":
            for frame in run.raw.get("source_frames", run.raw.get("input_frames", [])):
                claims[(frame.get("id", frame.get("frame_id")), category(concept))] = run.id
    chosen = {}
    for o in observations:
        claim = claims.get((o["frame_id"], category(o["label"])))
        if claim and o["run_id"] != claim:
            continue
        key = (o["frame_id"], o["label"])
        run = runs[o["run_id"]]
        old = chosen.get(key)
        if old is None or run.created > runs[old[0]["run_id"]].created:
            chosen[key] = [o]
        elif run.id == old[0]["run_id"]:
            old.append(o)
    selected = [o for batch in chosen.values() for o in batch]
    selected, suppressed = deduplicate(selected)
    with DB() as db:
        for o in selected:
            raw = runs[o["run_id"]].raw
            o["detection_confidence"] = raw.get("detection_confidences", {}).get(
                o["frame_id"] + ":" + str(o["track_id"])
            )
            token = db.get(Observation, o["id"]).mask
            cache = config.DATA / asset_id / "intelligence" / ("mask-feature-0.1-" + stable(token) + ".json")
            if cache.exists():
                value = json.loads(cache.read_text())
                o["mask_shape"] = int(value["shape"]) if value["shape"] is not None else None
            else:
                o["mask_shape"] = mask_shape(token)
                cache.write_text(
                    json.dumps(
                        {
                            "shape": str(o["mask_shape"]) if o["mask_shape"] is not None else None,
                            "mask_sha256": stable(token),
                            "source_sha256": source.sha256,
                        }
                    ),
                    encoding="utf-8",
                )
    # Dense reinspection must not shorten continuity for independently sampled coarse frames.
    max_gap = 4
    motion_rows, motion_offsets = frame_motion(
        frames,
        selected,
        image_path,
        continuity["boundaries"],
        config.DATA / asset_id / "intelligence",
    )
    camera_namespace = "C" + camera_id.replace("-", "")[:10] + ":V" + asset.id.replace("-", "")[:10]
    tracks, assignments, hypotheses, track_gaps = associate(
        selected, frames, camera_namespace, continuity["boundaries"], max_gap, motion_offsets
    )
    for duplicate, canonical in suppressed.items():
        assignments[duplicate] = {**assignments[canonical], "duplicate_of": canonical}
    for track in tracks:
        first = motion_offsets[track["frame_ids"][0]]
        last = motion_offsets[track["frame_ids"][-1]]
        track["motion_compensated"] = first["group"] == last["group"]
        track["stabilized_displacement"] = (
            math.dist(
                transform_point(inverse(motion_matrix(first)), center(track["first_box"])),
                transform_point(inverse(motion_matrix(last)), center(track["last_box"])),
            )
            if track["motion_compensated"]
            else None
        )
    import bisect

    positions = sorted(continuity["positions"], key=lambda p: p["pts"])
    source_times = [p["pts"] for p in positions]
    for f in frames.values():
        index = bisect.bisect_left(source_times, f["timestamp"])
        position = min(
            positions[max(0, index - 1) : min(len(positions), index + 1)], key=lambda p: abs(p["pts"] - f["timestamp"])
        )
        f.update(
            source_frame_index=position["index"],
            source_pts=position["pts"],
            playback_timestamp=f["timestamp"],
            segment=segment_at(f["timestamp"], continuity["boundaries"]),
            camera_timestamp=(datetime.fromisoformat(clock["start"]) + timedelta(seconds=f["timestamp"])).isoformat()
            if clock["verified"] and clock["start"]
            else None,
            source_id=source.id,
        )
        start = max([b for b in continuity["boundaries"] if b <= f["timestamp"]] + [0])
        f["segment_relative_timestamp"] = f["timestamp"] - start
    contradictions = []
    for e in events:
        if e["type"] != "scene_analysis":
            continue
        detections = [o for o in selected if o["label"] == "person" and abs(o["timestamp"] - e["start"]) < 1e-5]
        empty = re.search(
            r"no (?:person|people|discernible person)|zero (?:people|persons|co-visible)|empty (?:scene|aisle)|count(?: is|:)?\s*0",
            e["description"],
            re.I,
        )
        single = re.search(r"only one person|single person", e["description"], re.I)
        count = re.search(r"Model estimated person count:\s*(\d+)", e["description"])
        disagrees = count is not None and int(count[1]) != len(detections)
        if (empty and detections) or (single and len(detections) > 1) or disagrees:
            contradictions.append(
                {
                    "id": "conflict:" + e["id"],
                    "timestamp": e["start"],
                    "event_id": e["id"],
                    "observation_ids": [o["id"] for o in detections],
                    "frame_ids": sorted(
                        {o["frame_id"] for o in detections}
                        or {f["id"] for f in frames.values() if abs(f["timestamp"] - e["start"]) < 1e-5}
                    ),
                    "state": "UNRESOLVED",
                    "description": "Scene interpretation conflicts with localized person evidence. Neither model is an independent verifier. Inspect native frames; retain both outputs.",
                }
            )
    findings = interactions(tracks, selected, frames, zones)
    # Compare only associated objects within the same continuous segment. Pixel changes are not inventory proof.
    from PIL import Image, ImageChops, ImageStat

    object_comparisons = []
    by_id = {o["id"]: o for o in selected}
    for track in tracks:
        if track["category"] == "person":
            continue
        exposures = []
        for model_run in runs.values():
            if model_run.raw.get("concept") != track["category"]:
                continue
            for frame in model_run.raw.get("source_frames", model_run.raw.get("input_frames", [])):
                if segment_at(frame["timestamp"], continuity["boundaries"]) == track["segment"]:
                    exposures.append(frame["timestamp"])
        track["visibility_state"] = (
            "inspection_boundary; no disappearance established"
            if not exposures or track["last"] >= max(exposures) - 0.00001
            else "unresolved_visibility_gap; occlusion or missed detection possible"
        )
        if len(track["observations"]) < 2:
            continue
        pair = [by_id[track["observations"][i]] for i in (0, -1)]
        crops = []
        for observation in pair:
            file = image_path(frames[observation["frame_id"]])
            if file is None or not file.exists():
                break
            with Image.open(file) as image:
                box = observation["box"]
                w, h = image.size
                crops.append(
                    image.convert("RGB")
                    .crop(
                        (
                            int(box[0] * w),
                            int(box[1] * h),
                            max(int(box[0] * w) + 1, int(box[2] * w)),
                            max(int(box[1] * h) + 1, int(box[3] * h)),
                        )
                    )
                    .resize((32, 32))
                )
        if len(crops) == 2:
            delta = sum(ImageStat.Stat(ImageChops.difference(*crops)).mean) / (3 * 255)
            object_comparisons.append(
                {
                    "object_track": track["id"],
                    "before_frame": pair[0]["frame_id"],
                    "after_frame": pair[-1]["frame_id"],
                    "appearance_difference": round(delta, 4),
                    "state": "UNRESOLVED",
                    "interpretation": "Crop appearance changed"
                    if delta > 0.2
                    else "No large crop appearance change resolved",
                    "uncertainty": "Lighting, occlusion, crop/segmentation drift and perspective are not controlled. This is not a stock count or confirmed removal.",
                }
            )

    plans = reinspection_plan(tracks, hypotheses, continuity, contradictions, duration)
    for finding in findings:
        finding["id"] = (
            "finding:"
            + stable(
                {
                    "asset": asset_id,
                    "kind": finding["kind"],
                    "start": finding["start"],
                    "end": finding["end"],
                    "frames": finding["frame_ids"],
                    "person": finding["person_track"],
                    "object": finding["object_track"],
                }
            )[:32]
        )
        finding["provenance"] = VERSION
    episodes = event_episodes(findings, events, tracks, frames, continuity["boundaries"], observations=selected)
    by_frame = {}
    for o in selected:
        if o["label"] == "person":
            by_frame[o["frame_id"]] = by_frame.get(o["frame_id"], 0) + 1
    data = {
        "version": VERSION,
        "camera_id": camera_id,
        "camera_namespace": camera_namespace,
        "clock": clock,
        "source": serialize(source),
        "time_policy": "Playback-relative source PTS; camera time only when explicitly verified. No cross-cut or cross-camera identity joining.",
        "continuity": {k: v for k, v in continuity.items() if k != "positions"},
        "segments": [
            {
                "id": f"{camera_namespace}:S{i + 1:03}",
                "camera_id": camera_id,
                "start": a,
                "end": b,
                "synchronization": "verified source clock" if clock["verified"] else "unverified",
            }
            for i, (a, b) in enumerate(zip([0] + continuity["boundaries"], continuity["boundaries"] + [duration]))
        ],
        "frames": list(frames.values()),
        "tracks": tracks,
        "assignments": assignments,
        "person_hypotheses": hypotheses,
        "track_gaps": track_gaps,
        "findings": findings,
        "episodes": episodes,
        "duplicate_observations": suppressed,
        "camera_motion": motion_rows,
        "object_comparisons": object_comparisons,
        "contradictions": contradictions,
        "reinspection_plan": plans,
        "summary": {
            "tracklets": sum(t["category"] == "person" for t in tracks),
            "object_tracks": sum(t["category"] != "person" for t in tracks),
            "event_episodes": len(episodes),
            "duplicate_detections_suppressed": len(suppressed),
            "minimum_co_visible_people": max(by_frame.values(), default=0),
            "unique_people": None,
            "unique_people_policy": "Tracklets are not unique people. Missed detections do not establish absence.",
            "reviewed_frames": len(frames),
            "unresolved_findings": len(findings) + len(contradictions) + len(hypotheses),
        },
        "limitations": [
            "Detection confidence unavailable from provider: null, never fabricated.",
            "Association scores are geometry heuristics, not calibrated probabilities.",
            "Full occlusion and cut boundaries can fragment tracks. No appearance-only merging.",
            "No automatic physical touch, package removal or handoff verification.",
            "Decoded mask shapes contribute at most 5% of geometric association score; invalid or over-budget masks are not used. Raw masks retained.",
            "A source PTS gap is measurable; seeking, CCTV missing time and replay causes remain unverified.",
        ],
    }
    with DB.begin() as db:
        snapshot = IntelligenceSnapshot(id=uid(), asset_id=asset_id, fingerprint=fingerprint, data=data)
        db.add(snapshot)
        local_run = ModelRun(
            id=uid(),
            asset_id=asset_id,
            provider="deterministic",
            model=VERSION,
            status="succeeded",
            routing="Cut-safe geometry association; no identity inference. No external request.",
            usage={"provider_requests": 0, "cost_usd": 0},
            raw={"snapshot_id": snapshot.id, "source_sha256": source.sha256},
        )
        db.add(local_run)
        db.flush()
        for f in findings:
            key = stable([asset_id, f["id"]])
            existing = db.get(FindingEvent, key)
            if not existing:
                event = Event(
                    id=uid(),
                    asset_id=asset_id,
                    run_id=local_run.id,
                    title=f["kind"].replace("_", " ").capitalize(),
                    description=f["uncertainty"],
                    type=f["kind"],
                    category=f["category"],
                    severity="info",
                    start=f["start"],
                    end=f["end"],
                    provenance="deterministic_geometry",
                )
                db.add(event)
                db.flush()
                db.add(FindingEvent(id=key, asset_id=asset_id, event_id=event.id))
                f["event_id"] = event.id
            else:
                f["event_id"] = existing.event_id
        snapshot.data = dict(data)
    return serialize(snapshot)


def latest(db, asset_id):
    return db.scalars(
        select(IntelligenceSnapshot)
        .where(IntelligenceSnapshot.asset_id == asset_id)
        .order_by(IntelligenceSnapshot.created.desc())
        .limit(1)
    ).first()


def graph_for_case(db, case_id):
    case = db.get(Case, case_id)
    events = db.scalars(
        select(Event).join(CaseEvidence, CaseEvidence.event_id == Event.id).where(CaseEvidence.case_id == case_id)
    ).all()
    asset_ids = sorted(
        {e.asset_id for e in events} | set(db.scalars(select(CaseVideo.asset_id).where(CaseVideo.case_id == case_id)))
    )
    nodes, edges = {}, []
    inputs_by_run, frames_by_asset = {}, {}

    def node(key, kind, label, data=None):
        nodes[key] = {"id": key, "kind": kind, "label": label, "data": data or {}}

    def edge(a, b, rel):
        edges.append({"source": a, "target": b, "relationship": rel})

    def supports(event, reference):
        if event.observation_id and "observation:" + event.observation_id in nodes:
            edge(reference, "observation:" + event.observation_id, "supported_by")
            return
        manifest, source_hash = inputs_by_run.get(event.run_id, (set(), None))
        for frame in frames_by_asset[event.asset_id]:
            key = "frame:" + frame.id
            source = nodes[key]["data"].get("source_sha256")
            if (
                (not manifest or frame.id in manifest)
                and source is not None
                and source == source_hash
                and event.start - 1e-5 <= frame.timestamp <= event.end + 1e-5
            ):
                edge(reference, key, "source_interval_frame")

    root = "case:" + case_id
    node(root, "case", case.title)
    for aid in asset_ids:
        asset = db.get(Asset, aid)
        ak = "video:" + aid
        snap = latest(db, aid)
        node(
            ak,
            "video",
            asset.name,
            {
                "asset_id": aid,
                "sha256": asset.sha256,
                "synthetic": asset.synthetic,
                "clock": snap.data["clock"] if snap else {},
            },
        )
        edge(root, ak, "includes")
        sources = {s.id: s for s in db.scalars(select(SourceRecord).where(SourceRecord.asset_id == aid))}
        artifacts_by_frame = {}
        for artifact in native_artifacts(db, aid):
            artifacts_by_frame.setdefault(artifact.frame_id, []).append(artifact)
        frame_rows = db.scalars(select(Frame).where(Frame.asset_id == aid)).all()
        frames_by_asset[aid] = frame_rows
        for f in frame_rows:
            node(
                "frame:" + f.id,
                "frame",
                f"{f.timestamp:.6f}s",
                frame_reference(asset, f, artifacts_by_frame.get(f.id, []), sources),
            )
            edge(ak, "frame:" + f.id, "decoded_frame")
        for run in db.scalars(select(ModelRun).where(ModelRun.asset_id == aid)):
            manifest = run.raw.get("source_frames", run.raw.get("input_frames", []))
            inputs_by_run[run.id] = (
                {f.get("id", f.get("frame_id")) for f in manifest},
                run.raw.get("source_sha256") or asset.sha256,
            )
            rk = "run:" + run.id
            node(rk, "model_run", run.model, serialize(run, ("raw",)))
            edge(ak, rk, "processed_by")
        for ob in db.scalars(select(Observation).where(Observation.asset_id == aid)):
            ok = "observation:" + ob.id
            node(
                ok,
                "person_detection" if ob.label == "person" else "object_detection",
                ob.label,
                serialize(ob, ("mask",)),
            )
            edge(ok, "run:" + ob.run_id, "generated_by")
            frame_node = nodes.get("frame:" + (ob.frame_id or ""))
            if frame_node and frame_node["data"].get("source_sha256") == inputs_by_run[ob.run_id][1]:
                edge(ok, "frame:" + ob.frame_id, "observed_in")
        for scene in db.scalars(select(Event).where(Event.asset_id == aid, Event.type == "scene_analysis")):
            ek = "event:" + scene.id
            node(ek, "ai_observation", scene.title, serialize(scene))
            edge(ak, ek, "indexed_interpretation")
            edge(ek, "run:" + scene.run_id, "generated_by")
            supports(scene, ek)
        if snap:
            d = snap.data
            ck = "camera:" + d["camera_id"]
            node(ck, "camera", asset.camera, {"clock": d["clock"]})
            edge(ak, ck, "recorded_view")
            for s in d["segments"]:
                node("segment:" + s["id"], "video_segment", s["id"], s)
                edge(ak, "segment:" + s["id"], "contains_segment")
            for t in d["tracks"]:
                tk = "track:" + t["id"]
                node(tk, "person_tracklet" if t["category"] == "person" else "object_track", t["id"], t)
                edge(tk, "segment:" + f"{d['camera_namespace']}:S{t['segment']:03}", "within_segment")
                for oid in t["observations"]:
                    if "observation:" + oid in nodes:
                        edge(tk, "observation:" + oid, "associated_detection")
            for h in d["person_hypotheses"]:
                hk = "hypothesis:" + stable(h)[:24]
                node(hk, "person_hypothesis", "Uncertain track association", h)
                edge(hk, "track:" + h["from_track"], "possible_predecessor")
                edge(hk, "track:" + h["to_track"], "possible_successor")
            for f in d["findings"]:
                node(f["id"], "interaction" if f["person_track"] else "finding", f["kind"], f)
                for oid in f["observation_ids"]:
                    edge(f["id"], "observation:" + oid, "supported_by")
                if f["person_track"]:
                    edge(f["id"], "track:" + f["person_track"], "person_reference")
                if f["object_track"]:
                    edge(f["id"], "track:" + f["object_track"], "object_reference")
            for episode in d.get("episodes", []):
                node(
                    episode["id"],
                    "event_episode",
                    episode["kind"],
                    {
                        **episode,
                        "asset_id": aid,
                        "source_id": d["source"]["id"],
                        "source_sha256": d["source"]["sha256"],
                        "clock": d["clock"],
                    },
                )
                edge(ak, episode["id"], "derived_episode")
                for fid in episode["frame_ids"]:
                    frame_node = nodes.get("frame:" + fid)
                    if frame_node and frame_node["data"].get("source_sha256") == d["source"]["sha256"]:
                        edge(episode["id"], "frame:" + fid, "supported_by_frame")
                for eid in episode["source_event_ids"]:
                    event = db.get(Event, eid)
                    if event:
                        node("event:" + eid, "ai_observation", event.title, serialize(event))
                        edge(episode["id"], "event:" + eid, "aggregates_record")
                for key in episode["finding_ids"]:
                    edge(episode["id"], key, "aggregates_finding")
                for key in (episode.get("person_track"), episode.get("object_track")):
                    if key:
                        edge(episode["id"], "track:" + key, "associated_track")
            for conflict in d["contradictions"]:
                node(conflict["id"], "contradiction", conflict["description"], conflict)
                for oid in conflict["observation_ids"]:
                    edge(conflict["id"], "observation:" + oid, "conflicts_with_interpretation")
                for fid in conflict["frame_ids"]:
                    if "frame:" + fid in nodes:
                        edge(conflict["id"], "frame:" + fid, "requires_visual_inspection")
                event = db.get(Event, conflict["event_id"])
                if event:
                    node("event:" + event.id, "ai_observation", event.title, serialize(event))
                    edge(conflict["id"], "event:" + event.id, "disagrees_with")
    for e in events:
        ek = "event:" + e.id
        node(ek, "ai_observation" if e.category == "inferred" else "event", e.title, serialize(e))
        edge(root, ek, "selected_evidence")
        edge(ek, "run:" + e.run_id, "generated_by")
        supports(e, ek)
    for r in db.scalars(select(Report).where(Report.case_id == case_id)):
        rk = "report:" + r.id
        node(
            rk,
            "report",
            f"Report v{r.version}",
            {"status": r.status, "human_conclusion": r.content.get("human_conclusion", "")},
        )
        edge(root, rk, "report_snapshot")
        mapping = r.content.get("native_frame_mapping", {})
        for conflict in r.content.get("deep_investigation", {}).get("contradictions", []):
            refs = [
                "frame:" + mapping[fid]
                for fid in conflict.get("frame_ids", [])
                if fid in mapping and "frame:" + mapping[fid] in nodes
            ]
            if refs:
                key = "reported-conflict:" + stable([conflict["issue"], refs])[:24]
                timestamp = min(nodes[f]["data"]["timestamp"] for f in refs)
                node(
                    key,
                    "contradiction",
                    conflict["issue"],
                    {
                        "description": conflict["evidence"],
                        "resolution": conflict["resolution"],
                        "timestamp": timestamp,
                        "state": "UNRESOLVED",
                        "provenance": "prior draft report; not independent human verification",
                    },
                )
                edge(key, rk, "recorded_in_report")
                for ref in refs:
                    edge(key, ref, "supported_by_frame")
        if r.reviewer_id:
            node(
                "review:" + r.id,
                "human_review",
                r.status,
                {"reviewer_id": r.reviewer_id, "reviewed": r.reviewed, "notes": r.notes},
            )
            edge(rk, "review:" + r.id, "reviewed_by")
    for record in db.scalars(select(EnrichmentRecord).where(EnrichmentRecord.case_id == case_id)):
        key = "enrichment:" + record.id
        node(
            key,
            record.kind,
            ("Computed " if record.kind == "stock_comparison" else "Imported ") + record.kind,
            serialize(record),
        )
        edge(root, key, "enriched_by")
        for row in record.rows:
            if record.kind == "stock_comparison":
                for ref in (row.get("before_reference"), row.get("after_reference")):
                    if ref in nodes:
                        edge(key, ref, "supported_by_frame")
            elif record.kind == "cross_camera_association":
                for ref in (row.get("from_reference"), row.get("to_reference")):
                    if ref in nodes:
                        edge(key, ref, "human_spatiotemporal_reference; identity_unverified")
            elif row.get("video_reference") in nodes:
                edge(key, row["video_reference"], "imported_reference; causal_link_unverified")
    for review in db.scalars(
        select(FindingReview).where(FindingReview.case_id == case_id).order_by(FindingReview.created)
    ):
        key = "finding-review:" + review.id
        node(key, "human_review", review.disposition, serialize(review))
        edge(root, key, "finding_adjudication")
        if review.reference in nodes:
            nodes[review.reference]["data"] = {**nodes[review.reference]["data"], "human_review": serialize(review)}
            edge(key, review.reference, "reviews")
    invalid = [e for e in edges if e["source"] not in nodes or e["target"] not in nodes]
    if invalid:
        raise ValueError("Evidence graph contains a dangling reference")
    return {
        "nodes": list(nodes.values()),
        "edges": edges,
        "time_policy": "Playback-relative per recording; cross-camera joins are not inferred.",
        "case_id": case_id,
    }
