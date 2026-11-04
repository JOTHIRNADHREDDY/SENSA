"""Resolve frame links against stored file identity and presentation time."""

from sqlalchemy import select

from .db import DerivedArtifact, Frame, SourceRecord

PTS_TOLERANCE = 0.00001


def native_artifacts(db, asset_id, frame_id=None):
    query = select(DerivedArtifact).where(DerivedArtifact.asset_id == asset_id, DerivedArtifact.kind == "native_frame")
    if frame_id is not None:
        query = query.where(DerivedArtifact.frame_id == frame_id)
    return db.scalars(query.order_by(DerivedArtifact.id))


def matches_frame(artifact, source, frame):
    pts = artifact.provenance.get("source_pts")
    return (
        source is not None
        and source.asset_id == frame.asset_id == artifact.asset_id
        and artifact.source_id == source.id
        and artifact.frame_id == frame.id
        and artifact.provenance.get("source_sha256") == source.sha256
        and isinstance(pts, (int, float))
        and abs(pts - frame.timestamp) <= PTS_TOLERANCE
    )


def frame_reference(asset, frame, artifacts, sources):
    url = f"/api/frames/{frame.id}/native"
    data = {"asset_id": asset.id, "frame_id": frame.id, "timestamp": frame.timestamp, "url": url}
    if artifacts:
        artifact = artifacts[0]
        source = sources.get(artifact.source_id)
        if len({item.source_id for item in artifacts}) == 1 and matches_frame(artifact, source, frame):
            return {
                **data,
                "url": f"{url}?artifact_id={artifact.id}",
                "artifact_id": artifact.id,
                "source_id": source.id,
                "source_sha256": source.sha256,
                "frame_sha256": artifact.sha256,
                "binding": "native_artifact",
            }
        return {**data, "binding": "ambiguous_or_invalid"}
    if frame.filename.startswith("inspect-"):
        return {**data, "binding": "missing_native_artifact"}
    source = next((row for row in sources.values() if row.sha256 == asset.sha256), None)
    if source:
        data.update(url=f"{url}?source_id={source.id}", source_id=source.id)
    return {**data, "source_sha256": asset.sha256, "binding": "uploaded_source"}


def source_frame_references(db, asset, source):
    artifacts = {}
    for artifact in native_artifacts(db, asset.id):
        artifacts.setdefault(artifact.frame_id, []).append(artifact)
    references = {}
    for frame in db.scalars(select(Frame).where(Frame.asset_id == asset.id).order_by(Frame.timestamp)):
        ref = frame_reference(asset, frame, artifacts.get(frame.id, []), {source.id: source})
        if ref.get("source_id") == source.id:
            references[frame.id] = ref
    return references


def uploaded_source(db, asset):
    source = db.scalar(
        select(SourceRecord).where(SourceRecord.asset_id == asset.id, SourceRecord.sha256 == asset.sha256)
    )
    if source is None:
        source = SourceRecord(
            asset_id=asset.id,
            path=f"{asset.id}/original.mp4",
            sha256=asset.sha256,
            size=asset.size,
            metadata_json={key: getattr(asset, key) for key in ("name", "width", "height", "fps", "duration", "codec")},
        )
        db.add(source)
        db.flush()
    return source


def frame_support_lookup(graph):
    nodes = {node["id"]: node for node in graph["nodes"]}
    links = {}
    relations = {
        "supported_by",
        "supported_by_frame",
        "requires_visual_inspection",
        "conflicts_with_interpretation",
        "observed_in",
        "associated_detection",
        "possible_predecessor",
        "possible_successor",
        "source_interval_frame",
    }
    for edge in graph["edges"]:
        if edge["relationship"] in relations:
            links.setdefault(edge["source"], []).append(edge["target"])

    def lookup(key):
        pending, seen, frames = [key], set(), []
        while pending:
            current = pending.pop()
            if current in seen or current not in nodes:
                continue
            seen.add(current)
            node = nodes[current]
            if node["kind"] == "frame":
                frames.append(node["data"])
            pending.extend(links.get(current, ()))
        return sorted(frames, key=lambda frame: (frame["asset_id"], frame["timestamp"], frame.get("frame_id", "")))

    return lookup
