"""Resolve observation records against the evidence pinned by a saved report."""

from collections import defaultdict

from sqlalchemy import select

from .db import DerivedArtifact, Frame, ModelRun, Observation, SourceRecord, serialize
from .evidence import PTS_TOLERANCE, matches_frame


def records_in(value):
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from records_in(child)
    elif isinstance(value, list):
        for child in value:
            yield from records_in(child)


def observation_ids(content):
    ids = set()
    for row in records_in(content):
        if isinstance(row.get("observation_id"), str):
            ids.add(row["observation_id"])
        for key in ("observation_ids", "observations"):
            items = row.get(key)
            if isinstance(items, list):
                ids.update(item for item in items if isinstance(item, str))
    return ids


def indexed(db, model, ids):
    ids = sorted({key for key in ids if key})
    return {
        row.id: row
        for start in range(0, len(ids), 500)
        for row in db.scalars(select(model).where(model.id.in_(ids[start : start + 500])))
    }


def recover_observations(db, content, sources):
    refs = defaultdict(dict)
    for row in records_in(content):
        if row.get("frame_id") and row.get("source_id") and isinstance(row.get("timestamp"), (int, float)):
            key = (row["source_id"], row.get("artifact_id"), row.get("frame_sha256"), row["timestamp"])
            refs[row["frame_id"]][key] = row
    ids = observation_ids(content)
    observations = indexed(db, Observation, ids)
    frames = indexed(db, Frame, (row.frame_id for row in observations.values()))
    runs = indexed(db, ModelRun, (row.run_id for row in observations.values()))
    registrations = indexed(db, SourceRecord, (row.get("native_source_id") for row in sources.values()))
    artifacts = indexed(
        db, DerivedArtifact, (ref.get("artifact_id") for frame in frames for ref in refs[frame].values())
    )
    snapshot_runs = {row["id"]: row for row in content.get("models", [])}

    for id_ in sorted(ids):
        observation = observations.get(id_)
        if not observation:
            yield {"id": id_, "evidence_status": "unavailable", "reason": "Observation record missing from storage."}
            continue
        record = {"record_type": "detection", **serialize(observation)}
        run = runs.get(observation.run_id)
        saved_run = snapshot_runs.get(observation.run_id)
        source = sources.get(observation.asset_id, {})
        registration = registrations.get(source.get("native_source_id"))
        frame = frames.get(observation.frame_id)
        run_fields = ("asset_id", "provider", "model", "status")
        if not (
            run
            and saved_run
            and run.asset_id == observation.asset_id
            and all(saved_run.get(key) == getattr(run, key) for key in run_fields)
        ):
            reason = "Model run missing or inconsistent with the saved report."
        elif not (
            frame
            and registration
            and frame.asset_id == registration.asset_id == observation.asset_id
            and registration.sha256 == source.get("native_source_sha256")
            and registration.sha256 == (run.raw.get("source_sha256") or source.get("sha256"))
            and abs(frame.timestamp - observation.timestamp) <= PTS_TOLERANCE
        ):
            reason = "Source registration, frame, or timestamp could not be verified."
        else:
            matching = []
            for ref in refs[frame.id].values():
                if (
                    ref.get("asset_id") != observation.asset_id
                    or ref["source_id"] != registration.id
                    or ref.get("source_sha256") != registration.sha256
                    or abs(ref["timestamp"] - frame.timestamp) > PTS_TOLERANCE
                ):
                    continue
                artifact = artifacts.get(ref.get("artifact_id"))
                if artifact:
                    if (
                        artifact.kind != "native_frame"
                        or artifact.sha256 != ref.get("frame_sha256")
                        or not matches_frame(artifact, registration, frame)
                    ):
                        continue
                elif ref.get("artifact_id") or ref.get("binding") != "uploaded_source":
                    continue
                matching.append(ref)
            pinned = [ref for ref in matching if ref.get("artifact_id")]
            choices = pinned or matching
            if choices and len({ref.get("artifact_id") for ref in choices}) == 1:
                ref = choices[0]
                yield {
                    **record,
                    "evidence_status": "available",
                    "source_frame": ref,
                    "model_provenance": {key: saved_run[key] for key in run_fields},
                }
                continue
            reason = "Saved source-frame or artifact reference missing, ambiguous, or inconsistent."
        yield {**record, "evidence_status": "unavailable", "reason": reason}


def validate_observation_links(content):
    rows = [row for row in content.get("observations", []) if "evidence_status" in row]
    by_id = {row["id"]: row for row in rows}
    if len(by_id) != len(rows):
        raise ValueError("Duplicate portable observation ID")
    for id_ in sorted(observation_ids(content)):
        row = by_id.get(id_, {})
        if row.get("evidence_status") == "unavailable" and row.get("reason"):
            continue
        ref = row.get("source_frame", {})
        if not (
            row.get("evidence_status") == "available"
            and ref.get("source_id")
            and ref.get("source_sha256")
            and row.get("run_id")
            and row.get("model_provenance")
            and all(row.get(key) == ref.get(key) for key in ("asset_id", "frame_id"))
            and abs(row["timestamp"] - ref["timestamp"]) <= PTS_TOLERANCE
        ):
            raise ValueError(f"Unresolved portable observation reference: {id_}")
