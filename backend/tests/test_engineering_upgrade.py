"""Evidence integrity, retrieval, and discovery completion regressions."""

import time
from sqlalchemy import select

from app import config
from app.db import DB, DerivedArtifact, Event, Frame, ModelRun, SourceRecord, WorkerHeartbeat, uid
from app.discovery import coverage_gaps
from app.intelligence import ensure_configuration
from app.media import sha256
from app.retrieval import retrieve
from conftest import case


def test_native_frame_stays_bound_after_selected_source_changes(client, asset):
    frame = client.get(f"/api/videos/{asset.id}").json()["frames"][0]
    endpoint = f"/api/frames/{frame['id']}/native"
    original = client.get(endpoint)
    assert original.status_code == 200
    alternate_file = config.DATA / asset.id / "alternate.mp4"
    alternate_file.write_bytes((config.DATA / asset.id / "original.mp4").read_bytes() + b"distinct bytes")
    with DB.begin() as db:
        alternate = SourceRecord(
            id=uid(),
            asset_id=asset.id,
            path=f"{asset.id}/alternate.mp4",
            sha256=sha256(alternate_file),
            size=alternate_file.stat().st_size,
            relationship="separately_supplied",
        )
        db.add(alternate)
        db.flush()
        setting = ensure_configuration(db, asset)
        old_source = setting.source_id
        setting.source_id = alternate.id
        alternate_id = alternate.id
        artifact = db.scalar(select(DerivedArtifact).where(DerivedArtifact.frame_id == frame["id"]))
        artifact_id = artifact.id
        artifact_path = config.DATA / artifact.path
    assert client.get(f"/api/videos/{asset.id}/native-media").headers["x-evidence-sha256"] != asset.sha256
    active = client.get(f"/api/videos/{asset.id}/intelligence").json()["playback"]
    assert active["source_id"] == alternate_id and frame["id"] not in active["frames"]
    events = client.get(f"/api/videos/{asset.id}").json()["events"]
    assert events and all(e["source_id"] == old_source for e in events)
    bound = client.get(f"/api/videos/{asset.id}/intelligence", params={"source_id": old_source}).json()["playback"]
    assert client.get(bound["url"]).headers["x-evidence-sha256"] == asset.sha256
    assert client.get(bound["frames"][frame["id"]]["url"]).content == original.content
    assert (
        client.get(f"/api/videos/{asset.id}/native-media", params={"source_id": old_source}).headers[
            "x-evidence-sha256"
        ]
        == asset.sha256
    )
    pinned = client.get(endpoint, params={"artifact_id": artifact_id})
    assert pinned.content == original.content and pinned.headers["x-source-sha256"] == asset.sha256
    assert client.get(endpoint, params={"artifact_id": artifact_id, "source_id": alternate_id}).status_code == 409
    assert client.get(endpoint).content == original.content
    artifact_path.unlink()
    assert client.get(endpoint, params={"artifact_id": artifact_id}).status_code == 410
    assert client.get(endpoint).status_code == 410


def test_health_counts_only_fresh_workers_from_current_launch(client, monkeypatch):
    monkeypatch.setenv("SENSA_WORKER_SESSION", "current")
    expiry = time.time() + 60
    with DB.begin() as db:
        db.add_all(
            [
                WorkerHeartbeat(id="current:worker", lease_until=expiry, concurrency=2),
                WorkerHeartbeat(id="old:worker", lease_until=expiry, concurrency=2),
                WorkerHeartbeat(id="current:expired", lease_until=expiry - 120, concurrency=2),
            ]
        )
    assert client.get("/api/health").json()["active_workers"] == 1


def test_native_decode_refuses_nearby_frame_at_a_different_pts(client, asset):
    with DB.begin() as db:
        frame = Frame(id=uid(), asset_id=asset.id, timestamp=0.012345, filename="sample-test.jpg")
        db.add(frame)
        fid = frame.id
    result = client.get(f"/api/frames/{fid}/native")
    assert result.status_code == 409
    with DB() as db:
        assert db.scalar(select(DerivedArtifact).where(DerivedArtifact.frame_id == fid)) is None


def test_report_uses_run_manifest_instead_of_all_frames_in_interval(client, asset):
    inv = case(client)
    with DB.begin() as db:
        ensure_configuration(db, asset)
        first, second = db.scalars(select(Frame).where(Frame.asset_id == asset.id).order_by(Frame.timestamp)).all()[:2]
        run = ModelRun(
            id=uid(),
            asset_id=asset.id,
            provider="fixture",
            model="test",
            status="succeeded",
            routing="test",
            raw={"source_sha256": asset.sha256, "source_frames": [{"id": first.id}]},
        )
        db.add(run)
        db.flush()
        event = Event(
            id=uid(),
            asset_id=asset.id,
            run_id=run.id,
            title="Interpreted sample",
            description="Fixture interpretation",
            category="inferred",
            type="scene_analysis",
            start=first.timestamp,
            end=second.timestamp,
            provenance="synthetic-test",
        )
        db.add(event)
        event_id, frame_id = event.id, first.id
    assert client.post(f"/api/cases/{inv['id']}/evidence", json={"event_id": event_id}).status_code < 300
    report = client.post(f"/api/cases/{inv['id']}/reports").json()
    references = report["content"]["timeline"][0]["source_frames"]
    assert [ref["frame_id"] for ref in references] == [frame_id]
    ref = references[0]
    assert client.get(ref["url"]).headers["x-source-sha256"] == asset.sha256


def test_episode_search_returns_only_its_own_frames_and_hides_duplicate_records():
    def node(key, kind, data):
        return {"id": key, "kind": kind, "label": key, "data": data}

    frame = {
        "asset_id": "A",
        "timestamp": 9.6,
        "frame_id": "f",
        "url": "/api/frames/f/native?artifact_id=exact",
        "source_sha256": "specific-source",
    }
    graph = {
        "nodes": [
            node("video:A", "video", {"asset_id": "A", "synthetic": True}),
            node("frame:f", "frame", frame),
            node("frame:later", "frame", {**frame, "frame_id": "later", "timestamp": 22}),
            node("track:p", "person_tracklet", {}),
            node("event:one", "ai_observation", {"type": "possible_carry"}),
            node(
                "episode:carry",
                "event_episode",
                {
                    "kind": "possible_carry",
                    "state": "UNRESOLVED",
                    "source_event_ids": ["one"],
                    "frame_ids": ["f"],
                },
            ),
            node("finding:other", "interaction", {"object_track": None, "state": "UNRESOLVED"}),
        ],
        "edges": [
            {"source": "event:one", "target": "frame:f"},
            {"source": "episode:carry", "target": "track:p"},
            {"source": "track:p", "target": "frame:later"},
        ],
    }
    rows, filters = retrieve(graph, "show possible carry")
    assert [row["id"] for row in rows] == ["episode:carry"]
    assert rows[0]["source_frames"] == [frame] and rows[0]["synthetic"]
    assert filters["matching_records_before_cap"] == 1
    assert retrieve(graph, "show shelf")[0] == []
    assert "Invalid" in retrieve(graph, "between 23 AM and 4 AM")[1]["reason"]


def test_coarse_coverage_gaps_distinguish_failure_from_unsearched_time():
    result = {
        "eligible_ranges": [{"asset_id": "A", "start": 0, "end": 10}],
        "coverage": [
            {"asset_id": "A", "phase": "coarse", "requested_start": 0, "requested_end": 2, "complete": True},
            {
                "asset_id": "A",
                "phase": "coarse",
                "requested_start": 4,
                "requested_end": 6,
                "complete": False,
                "status": "failed",
                "reason": "provider timeout",
            },
            {"asset_id": "A", "phase": "reinspection", "requested_start": 7, "requested_end": 10, "complete": True},
        ],
    }
    assert coverage_gaps(result) == [
        {"asset_id": "A", "start": 2, "end": 4, "status": "unsearched"},
        {"asset_id": "A", "start": 4, "end": 6, "status": "failed", "reason": "provider timeout"},
        {"asset_id": "A", "start": 6, "end": 10, "status": "unsearched"},
    ]
