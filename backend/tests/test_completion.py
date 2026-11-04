"""Durability, visible-count uncertainty, privacy and anonymous association regressions."""

import json
import shutil
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import pytest
from sqlalchemy import select
from app import config
from app.db import DB, WorkItem, AnalysisJob, ModelRun, CaseVideo, Asset, Observation, Frame, uid
from app.worker import enqueue, claim, execute, recover_expired, reconcile
from app.intelligence import ensure_configuration, rebuild
from app.media import sha256
from app.vision import associate
from conftest import case, account, sign_in


def test_durable_claim_is_exclusive_and_enqueue_idempotent(client):
    wid = enqueue("inspection", "queued-reference")
    assert enqueue("inspection", "queued-reference") == wid
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(claim, ["worker-a", "worker-b"]))
    assert results.count(wid) == 1 and results.count(None) == 1
    with DB() as db:
        assert db.get(WorkItem, wid).state == "running"


def inspection(asset, state="queued"):
    with DB.begin() as db:
        job = AnalysisJob(
            id=uid(),
            asset_id=asset.id,
            owner_id=asset.owner_id,
            request_key=uid(),
            status=state,
            options={"mode": "local", "concepts": ["person"], "fps": 5, "max_requests": 4, "max_windows": 1},
        )
        db.add(job)
        db.flush()
        return job.id


def test_queued_work_survives_api_reconciliation(client, asset):
    jid = inspection(asset)
    wid = enqueue("inspection", jid)
    reconcile()
    reconcile()
    with DB() as db:
        assert db.get(AnalysisJob, jid).status == "queued"
        assert db.get(WorkItem, wid).state == "queued"
    assert claim("worker") == wid
    execute(wid)
    with DB() as db:
        assert db.get(AnalysisJob, jid).status == "succeeded"
        assert db.get(WorkItem, wid).state == "finished"


def test_expired_lease_preserves_unknown_usage_without_retry(client, asset):
    jid = inspection(asset, "running")
    wid = enqueue("inspection", jid)
    rid = uid()
    with DB.begin() as db:
        w = db.get(WorkItem, wid)
        w.state = "running"
        w.lease_until = time.time() - 1
        db.add(
            ModelRun(
                id=rid,
                asset_id=asset.id,
                provider="synthetic-test",
                model="test",
                status="running",
                routing="No external request",
            )
        )
        db.get(AnalysisJob, jid).result = {"run_ids": [rid]}
        fresh = WorkItem(
            id=uid(), kind="inspection", target_id="unrelated", state="running", lease_until=time.time() + 60
        )
        db.add(fresh)
        db.flush()
        fresh_id = fresh.id
    assert recover_expired() == 1
    assert claim("replacement") is None
    with DB() as db:
        assert db.get(AnalysisJob, jid).status == "interrupted"
        assert db.get(ModelRun, rid).raw["usage_status"] == "unknown after lease expiry"
        assert db.get(WorkItem, fresh_id).state == "running"


def test_reversible_retention_preserves_bytes(client, asset):
    path = config.DATA / asset.id / "original.mp4"
    digest = sha256(path)
    with DB.begin() as db:
        db.get(Asset, asset.id).created = "2020-01-01T00:00:00+00:00"
    assert client.put("/api/operations/retention", json={"enabled": True, "days": 30}).status_code == 200
    assert client.post("/api/operations/retention/run").json()["quarantined"] == [asset.id]
    assert not path.exists() and client.get(f"/api/videos/{asset.id}").status_code == 410
    assert client.post(f"/api/operations/quarantine/{asset.id}/restore").status_code == 200
    assert sha256(path) == digest
    assert client.post("/api/operations/retention/run").json()["quarantined"] == []
    assert client.get("/api/audit/verify").json()["valid"]


def test_retention_protects_case_sources_and_permissions(client, asset):
    inv = case(client)
    with DB.begin() as db:
        db.get(Asset, asset.id).created = "2020-01-01T00:00:00+00:00"
        db.add(CaseVideo(case_id=inv["id"], asset_id=asset.id))
    client.put("/api/operations/retention", json={"enabled": True, "days": 1})
    assert client.post("/api/operations/retention/run").json()["quarantined"] == []
    account(client)
    sign_in(client, "operator@example.test")
    assert client.get("/api/operations").status_code == 403
    assert client.put("/api/operations/retention", json={"enabled": True, "days": 1}).status_code == 403


def test_retention_rejects_path_traversal():
    from app.operations import paths

    with pytest.raises(ValueError):
        paths("../outside")


def test_stock_counts_unknown_are_not_zero(client, asset):
    views = client.get(f"/api/videos/{asset.id}/stock-views").json()["views"]
    assert views and all(v["count"] is None for v in views)


def test_quarantine_recovers_move_after_crash(client, asset):
    from app.operations import paths, reconcile_quarantine

    live, archive = paths(asset.id)
    digest = sha256(live / "original.mp4")
    archive.parent.mkdir(exist_ok=True)
    live.rename(archive)  # Simulate termination before the metadata transaction committed.
    reconcile_quarantine()
    assert client.get(f"/api/videos/{asset.id}").status_code == 410
    assert client.post(f"/api/operations/quarantine/{asset.id}/restore").status_code == 200
    assert sha256(live / "original.mp4") == digest


def test_capture_schedule_has_backpressure_and_idempotence(client):
    from app.operations import schedule_capture

    source = {"id": "test-camera", "interval_seconds": 5}
    wid = schedule_capture(source)
    assert schedule_capture(source) == wid
    with DB() as db:
        assert len(db.scalars(select(WorkItem).where(WorkItem.kind == "capture")).all()) == 1


def test_resume_preserves_completed_scope_without_provider_replay(client, asset, monkeypatch):
    from app.db import DiscoveryRun, Report, SourceRecord
    from app.discovery import run_discovery

    inv = case(client)
    with DB.begin() as db:
        db.get(Asset, asset.id).status = "partial"
        cfg = ensure_configuration(db, asset)
        db.add(CaseVideo(case_id=inv["id"], asset_id=asset.id))
        report = Report(
            id=uid(),
            case_id=inv["id"],
            version=1,
            author_id=asset.owner_id,
            content={
                "integrity": [
                    {
                        "asset_id": asset.id,
                        "sha256": asset.sha256,
                        "native_source_sha256": db.get(SourceRecord, cfg.source_id).sha256,
                    }
                ]
            },
        )
        db.add(report)
        opts = {
            "incident": "Packages are missing",
            "asset_ids": [asset.id],
            "mode": "meta",
            "start_date": None,
            "end_date": None,
            "max_requests": 4,
            "reinspect": False,
        }
        parent = DiscoveryRun(
            id=uid(),
            case_id=inv["id"],
            owner_id=asset.owner_id,
            request_key=uid(),
            options=opts,
            status="partial",
            result={
                "report_id": report.id,
                "provider_requests": 4,
                "coverage": [
                    {
                        "asset_id": asset.id,
                        "phase": "coarse",
                        "requested_start": 0,
                        "requested_end": asset.duration - 0.00001,
                        "complete": True,
                    }
                ],
            },
        )
        db.add(parent)
        db.flush()
        child = DiscoveryRun(
            id=uid(),
            case_id=inv["id"],
            owner_id=asset.owner_id,
            request_key=uid(),
            options={**opts, "resume_from": parent.id},
        )
        db.add(child)
        db.flush()
        cid = child.id

    def forbidden(_):
        raise AssertionError("Completed source scope must not be billed again")

    monkeypatch.setattr("app.discovery.run_job", forbidden)
    run_discovery(cid)
    with DB() as db:
        result = db.get(DiscoveryRun, cid)
        assert result.status == "succeeded" and result.result["provider_requests"] == 0
        assert result.result["previous_provider_requests"] == 4 and result.result["coverage"][0]["inherited"]
        assert db.get(Asset, asset.id).status == "succeeded"


@pytest.mark.parametrize("condition", ["gap", "incomplete", "targeted", "changed_hash"])
def test_readiness_requires_full_coarse_coverage_and_source_hash(client, asset, condition):
    from app.db import Report, SourceRecord
    from app.discovery import mark_indexed_sources

    inv = case(client)
    with DB.begin() as db:
        current = db.get(Asset, asset.id)
        current.status = "partial"
        cfg = ensure_configuration(db, current)
        report = Report(
            id=uid(),
            case_id=inv["id"],
            version=1,
            author_id=asset.owner_id,
            content={
                "integrity": [
                    {
                        "asset_id": asset.id,
                        "native_source_sha256": "changed"
                        if condition == "changed_hash"
                        else db.get(SourceRecord, cfg.source_id).sha256,
                    }
                ]
            },
        )
        db.add(report)
        db.flush()
        result = {
            "report_id": report.id,
            "selected_assets": [asset.id],
            "coverage": [
                {
                    "asset_id": asset.id,
                    "phase": "reinspection" if condition == "targeted" else "coarse",
                    "requested_start": 1 if condition == "gap" else 0,
                    "requested_end": asset.duration,
                    "complete": condition != "incomplete",
                }
            ],
        }
        assert mark_indexed_sources(db, result) == []
        assert current.status == "partial"


def test_visible_stock_delta_deduplicates_but_never_confirms_removal(client, asset):
    inv = case(client)
    with DB.begin() as db:
        db.add(CaseVideo(case_id=inv["id"], asset_id=asset.id))
        frames = db.scalars(select(Frame).where(Frame.asset_id == asset.id).order_by(Frame.timestamp)).all()
        a, b = frames[1:3]
        for label in ["cardboard box", "carton"]:
            run = ModelRun(
                id=uid(),
                asset_id=asset.id,
                provider="synthetic-test",
                model="test",
                status="succeeded",
                routing="Synthetic count test",
                raw={
                    "concept": label,
                    "source_frames": [{"id": a.id, "timestamp": a.timestamp}, {"id": b.id, "timestamp": b.timestamp}],
                },
            )
            db.add(run)
            db.flush()
            for frame in [a, b]:
                db.add(
                    Observation(
                        id=uid(),
                        asset_id=asset.id,
                        run_id=run.id,
                        frame_id=frame.id,
                        timestamp=frame.timestamp,
                        label=label,
                        box=[0.1, 0.1, 0.3, 0.3],
                        provenance="synthetic-test",
                    )
                )
                if label == "cardboard box" and frame.id == a.id:
                    db.add(
                        Observation(
                            id=uid(),
                            asset_id=asset.id,
                            run_id=run.id,
                            frame_id=frame.id,
                            timestamp=frame.timestamp,
                            label=label,
                            box=[0.6, 0.1, 0.8, 0.3],
                            provenance="synthetic-test",
                        )
                    )
        before, after = a.id, b.id
    rebuild(asset.id)
    res = client.post(
        f"/api/cases/{inv['id']}/stock-comparisons",
        json={
            "before_frame_id": before,
            "after_frame_id": after,
            "labels": ["cardboard box", "carton"],
            "independent_before": 2,
            "independent_after": 1,
            "inventory_reference": "Explicit synthetic stock ledger",
        },
    )
    assert res.status_code == 201, res.text
    row = res.json()["rows"][0]
    assert row["before"]["count"] == 2 and row["after"]["count"] == 1 and row["visible_detection_delta"] == -1
    assert row["count_change_agrees"] is True and row["confirmed_removal"] is False and row["state"] == "UNRESOLVED"
    from app.intelligence import stable

    with DB() as db:
        for view in (row["before"], row["after"]):
            assert view["model_run_ids"] and view["observation_ids"]
            assert all(
                view["raw_response_sha256"][rid] == stable(db.get(ModelRun, rid).raw) for rid in view["model_run_ids"]
            )
    assert row["source_provenance"][0]["source_sha256"] == asset.sha256
    graph = client.get(f"/api/cases/{inv['id']}/graph").json()
    assert any(n["kind"] == "stock_comparison" for n in graph["nodes"])


def test_camera_matching_blocks_unknown_clocks(client, asset):
    inv = case(client)
    with DB.begin() as db:
        db.add(CaseVideo(case_id=inv["id"], asset_id=asset.id))
    r = client.get(f"/api/cases/{inv['id']}/association-proposals").json()
    assert r["proposals"] == [] and "unverified" in r["warnings"][0]["reason"]


def test_camera_links_are_only_anonymous_proposals(client, asset, source):
    from app.workflows import ingest, process

    inv = case(client)
    folder = config.DATA / uid()
    shutil.copytree(source, folder)
    second = ingest(folder / "original.mp4", asset.owner_id, "Synthetic second camera", "Synthetic camera B", True)
    process(second.id)
    with DB.begin() as db:
        for n, a in enumerate([asset, second]):
            cfg = ensure_configuration(db, a)
            cfg.clock_start = "2026-10-21T06:30:00+05:30" if n == 0 else "2026-10-21T01:00:15+00:00"
            cfg.clock_verified = True
            cfg.clock_evidence = "Controlled synthetic source clock"
            db.add(CaseVideo(case_id=inv["id"], asset_id=a.id))
    rebuild(asset.id)
    rebuild(second.id)
    r = client.get(f"/api/cases/{inv['id']}/association-proposals").json()
    assert r["proposals"] and all(not p["identity_verified"] and p["state"] == "UNRESOLVED" for p in r["proposals"])
    assert all(
        p["from_clock_mapping"]["source_pts_zero"].endswith("+05:30") and p["to_clock_mapping"]["verified"]
        for p in r["proposals"]
    )


def test_motion_prediction_handles_short_gap_without_crossing_cuts():
    boxes = [[0.1, 0.1, 0.3, 0.5], [0.2, 0.1, 0.4, 0.5], [0.4, 0.1, 0.6, 0.5]]
    times = [0, 0.5, 1.5]
    obs = [
        {"id": str(i), "frame_id": str(i), "timestamp": t, "label": "person", "box": box}
        for i, (t, box) in enumerate(zip(times, boxes))
    ]
    frames = {o["id"]: {"timestamp": o["timestamp"]} for o in obs}
    tracks, *_ = associate(obs, frames, "SyntheticCamera", [], 4)
    assert len(tracks) == 1 and len(tracks[0]["observations"]) == 3
    tracks, *_ = associate(obs, frames, "SyntheticCamera", [0.75], 4)
    assert len(tracks) == 2


def test_configured_camera_capture_never_exposes_connection(client, admin, source, monkeypatch):
    from app.operations import capture

    private = "rtsp://local-user:private-test-secret@127.0.0.1/video"
    monkeypatch.setenv("SENSA_CAMERA_TEST", private)
    (config.DATA / "camera-sources.json").write_text(
        json.dumps(
            [
                {
                    "id": "test",
                    "label": "Synthetic camera capture",
                    "input_env": "SENSA_CAMERA_TEST",
                    "owner_id": admin["id"],
                    "segment_seconds": 5,
                    "interval_seconds": 60,
                    "enabled": True,
                }
            ]
        )
    )

    def fake_ffmpeg(args, **kwargs):
        assert private in args and "rtsp" in kwargs["protocols"]
        shutil.copyfile(source / "original.mp4", Path(args[-1]))
        return type("Result", (), {"returncode": 0})()

    monkeypatch.setattr("app.operations.ffmpeg", fake_ffmpeg)
    capture("test/123")
    assert private not in client.get("/api/operations").text
    with DB() as db:
        assert db.scalar(select(Asset.id))
    (config.DATA / "camera-sources.json").unlink()
