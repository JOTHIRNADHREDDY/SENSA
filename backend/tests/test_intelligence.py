"""Baseline investigation failures are regression contracts, not theft labels."""

from sqlalchemy import select, text
from app.db import DB, Frame, Observation, ModelRun, Event, AnalysisJob, uid, engine, migrate
from app.intelligence import rebuild
from app.inspection import run_job
from app.vision import associate, scan_changes, interactions, reinspection_plan
from app.media import sha256
from app import config
from conftest import case, account, sign_in


def det(oid, fid, ts, box, label="person"):
    return {"id": oid, "frame_id": fid, "timestamp": ts, "box": box, "label": label, "track_id": "same-provider-id"}


def test_five_known_cuts_never_join_even_identical_boxes():
    cuts = [i / 30 for i in [149, 282, 433, 588, 709]]
    times = [0] + [t + d for t in cuts for d in [-1 / 30, 0]] + [25]
    frames = {str(i): {"timestamp": t} for i, t in enumerate(times)}
    obs = [det(str(i), str(i), t, [0.2, 0.2, 0.4, 0.8]) for i, t in enumerate(times)]
    tracks, assign, _, _ = associate(obs, frames, "C-camera", cuts, max_gap=10)
    assert len(tracks) == 6
    for a, b in zip(obs, obs[1:]):
        if any(a["timestamp"] < t <= b["timestamp"] + 1e-6 for t in cuts):
            assert assign[a["id"]]["track_id"] != assign[b["id"]]["track_id"]
    assert all(t["id"].startswith("C-camera:S") for t in tracks)
    assert all(t["identity"] == "not available" and t["unique_person"] is False for t in tracks)


def test_geometry_continuation_and_ambiguity_do_not_force_identity():
    frames = {"a": {"timestamp": 0}, "b": {"timestamp": 0.2}, "c": {"timestamp": 0.4}}
    obs = [det("a", "a", 0, [0.1, 0.1, 0.3, 0.8]), det("b", "b", 0.2, [0.11, 0.1, 0.31, 0.8])]
    tracks, _, _, _ = associate(obs, frames, "cam", [])
    assert len(tracks) == 1 and tracks[0]["states"][1]["state"] == "continued"
    obs += [det("c", "c", 0.4, [0.1, 0.1, 0.3, 0.8]), det("d", "c", 0.4, [0.11, 0.1, 0.31, 0.8])]
    tracks, _, hypotheses, _ = associate(obs, frames, "cam", [])
    assert len(tracks) == 3 and hypotheses
    assert all(h["state"] == "uncertain" for h in hypotheses)


def test_continuity_scan_repeat_and_pts_gap():
    samples = [(i / 30, bytes([0 if i < 3 else 180]) * 64) for i in range(7)]
    result = scan_changes(samples, 30)
    assert result["changes"][0]["index"] == 3
    assert result["duplicate_count"] > 0
    broken = scan_changes([(0, bytes(64)), (0.5, bytes(64))], 30)
    assert broken["pts_gaps"][0]["elapsed_cctv_time"] is None


def test_overlap_cropping_trigger_native_reinspection_without_handoff():
    frames = {"a": {"timestamp": 1}, "b": {"timestamp": 1.2}}
    obs = [
        det("a", "a", 1, [0, 0.1, 0.4, 0.8]),
        det("b", "a", 1, [0.2, 0.1, 0.5, 0.8]),
        det("c", "b", 1.2, [0, 0.1, 0.4, 0.8]),
    ]
    tracks, _, hypotheses, _ = associate(obs, frames, "cam", [])
    plan = reinspection_plan(tracks, hypotheses, {"changes": []}, [], 10)
    assert plan and plan[0]["fps"] == 5 and plan[0]["max_frames"] == 12
    assert any("cropped" in reason or "overlap" in reason for w in plan for reason in w["reasons"])
    assert not interactions(tracks, obs, frames, [])


def test_proximity_and_geometry_shift_are_not_touch_removal_or_handoff():
    frames = {"a": {"timestamp": 0}, "b": {"timestamp": 0.2}}
    obs = [
        det("p1", "a", 0, [0.1, 0.1, 0.4, 0.8]),
        det("o1", "a", 0, [0.2, 0.3, 0.45, 0.55], "cardboard box"),
        det("p2", "b", 0.2, [0.11, 0.1, 0.41, 0.8]),
        det("o2", "b", 0.2, [0.29, 0.3, 0.54, 0.55], "cardboard box"),
    ]
    tracks, _, _, _ = associate(obs, frames, "cam", [])
    rows = interactions(tracks, obs, frames, [])
    assert rows and all(r["state"] == "UNRESOLVED" for r in rows)
    assert all(r["kind"] not in ("handoff", "removal", "touch", "theft") for r in rows)
    assert all(r["observation_ids"] and r["frame_ids"] for r in rows)


def test_clothing_and_missing_detections_do_not_create_package_or_exit():
    frames = {"a": {"timestamp": 0}, "b": {"timestamp": 1}, "c": {"timestamp": 2}}
    tracks, _, _, _ = associate([det("p", "a", 0, [0.1, 0.1, 0.3, 0.8])], frames, "cam", [])
    assert len(tracks) == 1 and tracks[0]["category"] == "person"
    assert interactions(tracks, [det("p", "a", 0, [0.1, 0.1, 0.3, 0.8])], frames, []) == []
    assert tracks[0]["state"] == "terminated_at_visibility_boundary"


def test_snapshot_keeps_co_visible_people_clock_unknown_and_hash(asset):
    path = config.DATA / asset.id / "original.mp4"
    before = sha256(path)
    with DB.begin() as db:
        frame = db.scalars(select(Frame).where(Frame.asset_id == asset.id)).first()
        run = ModelRun(
            id=uid(),
            asset_id=asset.id,
            provider="unit-test",
            model="explicit-synthetic-test",
            status="succeeded",
            routing="Synthetic regression only",
        )
        db.add(run)
        db.flush()
        for i, b in enumerate([[0.1, 0.1, 0.25, 0.8], [0.5, 0.1, 0.7, 0.8]]):
            db.add(
                Observation(
                    id=uid(),
                    asset_id=asset.id,
                    run_id=run.id,
                    frame_id=frame.id,
                    timestamp=frame.timestamp,
                    label="person",
                    track_id=str(i),
                    box=b,
                    provenance="test_fixture",
                )
            )
        db.add(
            Event(
                asset_id=asset.id,
                run_id=run.id,
                title="Conflicting synthetic interpretation",
                description="No person is visible in the aisle",
                type="scene_analysis",
                category="inferred",
                start=frame.timestamp,
                end=frame.timestamp,
                provenance="test_fixture",
            )
        )
    one = rebuild(asset.id)
    two = rebuild(asset.id)
    assert one["id"] == two["id"]
    d = one["data"]
    assert d["summary"]["minimum_co_visible_people"] >= 2
    assert d["summary"]["unique_people"] is None
    assert d["contradictions"] and d["contradictions"][0]["observation_ids"]
    assert all(f["camera_timestamp"] is None for f in d["frames"])
    assert sha256(path) == before


def test_graph_references_and_search_are_scoped(client, asset):
    rebuild(asset.id)
    inv = case(client)
    event = client.get("/api/events").json()["items"][0]
    client.post(f"/api/cases/{inv['id']}/evidence", json={"event_id": event["id"]})
    g = client.get(f"/api/cases/{inv['id']}/graph").json()
    ids = {n["id"] for n in g["nodes"]}
    assert all(e["source"] in ids and e["target"] in ids for e in g["edges"])
    result = client.get(f"/api/cases/{inv['id']}/search", params={"q": "Show people carrying boxes"}).json()
    assert result["items"] == []
    clock = client.get(f"/api/cases/{inv['id']}/search", params={"q": "What happened between 1 AM and 3 AM?"}).json()
    assert clock["items"] == []
    assert "unverified" in clock["filters"].get("reason", "")
    report = client.post(f"/api/cases/{inv['id']}/reports").json()["content"]
    assert all(
        k in report
        for k in (
            "observations",
            "interpretations",
            "possible_hypotheses",
            "contradictory_evidence",
            "missing_evidence",
            "human_conclusion",
        )
    )
    account(client)
    sign_in(client, "operator@example.test")
    assert client.get(f"/api/cases/{inv['id']}/graph").status_code == 404
    assert client.get(f"/api/videos/{asset.id}/intelligence").status_code == 404
    assert (
        client.get(
            f"/api/frames/{next(n['data']['frame_id'] for n in g['nodes'] if n['kind'] == 'frame')}/native"
        ).status_code
        == 404
    )


def test_native_frame_mask_and_source_access(client, asset):
    frame = client.get(f"/api/videos/{asset.id}").json()["frames"][0]
    original = client.get(f"/api/frames/{frame['id']}/native")
    assert original.status_code == 200 and original.headers["content-type"] == "image/png"
    assert original.headers["x-time-basis"] == "playback-relative source PTS"
    assert original.headers["x-source-sha256"] == asset.sha256
    assert client.get(f"/api/videos/{asset.id}/native-media", headers={"Range": "bytes=0-31"}).status_code == 206


def test_local_job_is_append_only_idempotent_and_cancellable(client, asset, monkeypatch):
    jobs = []
    monkeypatch.setattr("app.intelligence_api.enqueue", lambda jid: jobs.append(jid))
    options = {"mode": "local", "request_key": "regression-request-01"}
    first = client.post(f"/api/videos/{asset.id}/intelligence/jobs", json=options)
    assert first.status_code == 202, first.text
    second = client.post(f"/api/videos/{asset.id}/intelligence/jobs", json=options)
    assert first.json()["id"] == second.json()["id"] and len(jobs) == 1
    with DB() as db:
        old_events = set(db.scalars(select(Event.id)))
    run_job(jobs[0])
    run_job(jobs[0])
    with DB() as db:
        job = db.get(AnalysisJob, jobs[0])
        assert job.status == "succeeded"
        assert job.result["provider_requests"] == 0
        assert old_events <= set(db.scalars(select(Event.id)))
    pending = client.post(
        f"/api/videos/{asset.id}/intelligence/jobs", json={**options, "request_key": "regression-request-02"}
    ).json()
    assert client.post(f"/api/intelligence/jobs/{pending['id']}/cancel").json()["status"] == "cancelled"
    assert (
        client.post(
            f"/api/videos/{asset.id}/intelligence/jobs", json={"mode": "meta", "authorize_external_processing": False}
        ).status_code
        == 409
    )


def test_enrichment_requires_real_graph_references_and_verified_video_clock(client, asset):
    inv = case(client)
    e = client.get("/api/events").json()["items"][0]
    client.post(f"/api/cases/{inv['id']}/evidence", json={"event_id": e["id"]})
    ref = client.get(f"/api/videos/{asset.id}").json()["frames"][0]["id"]
    base = {
        "kind": "inventory",
        "rows": [
            {
                "record_id": "synthetic-inventory-1",
                "identifier": "synthetic-SKU-1",
                "timestamp": "2026-11-01T01:00:00+05:30",
                "video_reference": "frame:" + ref,
            }
        ],
        "verified_identifiers": True,
        "clock_verified": True,
    }
    res = client.post(f"/api/cases/{inv['id']}/enrichment", json=base)
    assert res.status_code == 201, res.text
    assert "blocked" in res.json()["rows"][0]["correlation_status"]
    assert (
        client.post(
            f"/api/cases/{inv['id']}/enrichment", json={**base, "rows": [{"video_reference": "invented"}]}
        ).status_code
        == 422
    )


def test_migration_v1_to_v2_preserves_original_records(client, admin):
    from app.db import V2_TABLES, V3_TABLES, Base

    with engine.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            if table in V2_TABLES + V3_TABLES:
                table.drop(conn, checkfirst=True)
        conn.execute(text("DELETE FROM schema_migrations WHERE version>=2"))
    migrate()
    migrate()
    with engine.connect() as conn:
        assert conn.execute(text("SELECT id FROM users")).scalar() == admin["id"]
        assert conn.execute(text("SELECT version FROM schema_migrations ORDER BY version")).scalars().all() == [
            1,
            2,
            3,
            4,
        ]
