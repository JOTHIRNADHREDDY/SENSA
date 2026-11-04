"""Workflow regressions use explicitly synthetic video; no external API is invoked."""

from sqlalchemy import delete
import pytest
from app.db import DB, CaseVideo, DiscoveryRun, Event, Report, uid
from app.discovery import calendar_range, incident_plan, run_discovery
from app.intelligence import rebuild
from conftest import case, account, sign_in


def test_incident_scope_and_calendar_parsing():
    a, b, note = calendar_range("Check all footage from October 20 to October 22 2026")
    assert (a, b) == ("2026-10-20", "2026-10-22") and note is None
    assert incident_plan("Twenty packages are missing")["requested_missing_quantity"] == 20
    assert "cardboard box" in incident_plan("Missing packages")["concepts"]
    assert calendar_range("October 20\u2013October 22 2026")[:2] == ("2026-10-20", "2026-10-22")


def existing_run(client, asset, incident="Packages are missing. Find relevant activity."):
    inv = case(client)
    with DB.begin() as db:
        db.add(CaseVideo(case_id=inv["id"], asset_id=asset.id))
        run = DiscoveryRun(
            id=uid(),
            case_id=inv["id"],
            owner_id=asset.owner_id,
            request_key=uid(),
            options={
                "incident": incident,
                "asset_ids": [asset.id],
                "mode": "existing",
                "start_date": None,
                "end_date": None,
                "max_requests": 4,
                "reinspect": False,
            },
        )
        db.add(run)
        db.flush()
        rid = run.id
    run_discovery(rid)
    with DB() as db:
        return inv, db.get(DiscoveryRun, rid)


def test_raw_recording_scope_exists_before_any_events(client, asset):
    inv = case(client)
    with DB.begin() as db:
        db.execute(delete(Event).where(Event.asset_id == asset.id))
        db.add(CaseVideo(case_id=inv["id"], asset_id=asset.id))
    graph = client.get(f"/api/cases/{inv['id']}/graph").json()
    assert any(n["kind"] == "video" and n["data"]["asset_id"] == asset.id for n in graph["nodes"])
    assert client.delete(f"/api/videos/{asset.id}").status_code == 409


def test_description_to_report_without_timestamp(client, asset):
    inv, run = existing_run(client, asset)
    assert run.status == "partial"  # existing-index mode never claims a full new scan
    assert run.result["provider_requests"] == 0 and run.result["report_id"]
    assert run.result["eligible_ranges"][0]["start"] == 0
    assert run.result["warnings"]
    with DB() as db:
        report = db.get(Report, run.result["report_id"])
        assert report.content["timeline"] and not report.content["human_conclusion"]
    pdf = client.get("/api/reports/" + run.result["report_id"] + "/pdf")
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF")
    assert client.get(f"/api/cases/{inv['id']}/discovery").status_code == 200


def test_calendar_query_never_ignores_date_constraint(client, asset):
    inv, run = existing_run(client, asset)
    path = f"/api/cases/{inv['id']}/search"
    ordinary = client.get(path, params={"q": "Show activity timeline"}).json()
    assert ordinary["items"]
    dated = client.get(path, params={"q": "Show activity timeline from October 20 to October 22 2026"}).json()
    assert dated["items"] == [] and dated["filters"]["start_date"] == "2026-10-20"
    assert "unverified" in dated["filters"]["reason"]
    cfg = client.get(f"/api/videos/{asset.id}/intelligence").json()["configuration"]
    assert (
        client.patch(
            f"/api/videos/{asset.id}/configuration",
            json={
                "label": "Synthetic test camera",
                "camera_id": cfg["camera_id"],
                "clock_start": "2026-10-21T01:00:00+00:00",
                "clock_verified": True,
                "clock_evidence": "Synthetic annotated source clock",
                "zones": [],
            },
        ).status_code
        == 200
    )
    rebuild(asset.id)
    assert client.get(path, params={"q": "Show activity timeline from October 20 to October 22 2026"}).json()["items"]
    assert (
        client.get(path, params={"q": "Show activity timeline from November 20 to November 22 2026"}).json()["items"]
        == []
    )


def test_clock_unknown_is_explicitly_unsearched(client, asset):
    inv = case(client)
    rebuild(asset.id)
    with DB.begin() as db:
        db.add(CaseVideo(case_id=inv["id"], asset_id=asset.id))
        r = DiscoveryRun(
            id=uid(),
            case_id=inv["id"],
            owner_id=asset.owner_id,
            request_key=uid(),
            options={
                "incident": "Packages missing October 20 to October 22 2026",
                "asset_ids": [asset.id],
                "mode": "existing",
                "start_date": "2026-10-20",
                "end_date": "2026-10-22",
                "max_requests": 4,
                "reinspect": False,
            },
        )
        db.add(r)
        db.flush()
        rid = r.id
    run_discovery(rid)
    with DB() as db:
        r = db.get(DiscoveryRun, rid)
        assert r.result["eligible_ranges"] == [] and "clock unverified" in r.result["warnings"][0]
        assert db.get(Report, r.result["report_id"]).content["timeline"] == []
        assert db.get(Report, r.result["report_id"]).content["possible_hypotheses"] == []
        assert db.get(Report, r.result["report_id"]).content["contradictory_evidence"] == []
    regenerated = client.post(f"/api/cases/{inv['id']}/reports")
    assert regenerated.status_code == 201
    assert regenerated.json()["content"]["timeline"] == []


def test_cancelled_discovery_never_starts_provider_work(client, asset, monkeypatch):
    inv = case(client)
    with DB.begin() as db:
        db.add(CaseVideo(case_id=inv["id"], asset_id=asset.id))
        run = DiscoveryRun(
            id=uid(),
            case_id=inv["id"],
            owner_id=asset.owner_id,
            request_key=uid(),
            cancel_requested=True,
            options={
                "incident": "Packages are missing",
                "asset_ids": [asset.id],
                "mode": "meta",
                "max_requests": 8,
                "reinspect": True,
                "start_date": None,
                "end_date": None,
            },
        )
        db.add(run)
        db.flush()
        rid = run.id

    def forbidden(_):
        raise AssertionError("Cancelled discovery must not invoke a child job")

    monkeypatch.setattr("app.discovery.run_job", forbidden)
    run_discovery(rid)
    with DB() as db:
        run = db.get(DiscoveryRun, rid)
        assert run.status == "cancelled" and run.result["provider_requests"] == 0
        assert run.result["child_jobs"] == []


def test_report_excludes_hypotheses_supported_outside_date_scope(client, asset, monkeypatch):
    from app.discovery import snapshot_report

    inv, run = existing_run(client, asset)
    graph = {
        "nodes": [
            {"id": "frame:in", "kind": "frame", "data": {"asset_id": asset.id, "timestamp": 2}},
            {"id": "frame:out", "kind": "frame", "data": {"asset_id": asset.id, "timestamp": 9}},
            {"id": "f:in", "kind": "finding", "data": {}},
            {"id": "f:out", "kind": "contradiction", "data": {}},
        ],
        "edges": [
            {"source": "f:in", "target": "frame:in", "relationship": "supported_by_frame"},
            {"source": "f:out", "target": "frame:out", "relationship": "supported_by_frame"},
        ],
    }
    monkeypatch.setattr("app.discovery.graph_for_case", lambda *_: graph)
    scoped = {**run.result, "eligible_ranges": [{"asset_id": asset.id, "start": 1, "end": 3}]}
    with DB.begin() as db:
        rid = snapshot_report(db, inv["id"], scoped, asset.owner_id)
    with DB() as db:
        content = db.get(Report, rid).content
        assert [n["id"] for n in content["possible_hypotheses"]] == ["f:in"]
        assert content["contradictory_evidence"] == []
        assert content["integrity"][0]["native_source_sha256"]


def test_finding_review_is_attributed_and_scoped(client, asset):
    inv, run = existing_run(client, asset)
    node = client.get(f"/api/cases/{inv['id']}/graph").json()["nodes"][0]
    res = client.post(
        f"/api/cases/{inv['id']}/finding-reviews",
        json={"reference": node["id"], "disposition": "unresolved", "notes": "Synthetic evidence remains insufficient"},
    )
    assert res.status_code == 201 and res.json()["reviewer_id"] == asset.owner_id
    account(client)
    sign_in(client, "operator@example.test")
    assert client.get("/api/reports/" + run.result["report_id"] + "/pdf").status_code == 404
    assert (
        client.post(
            f"/api/cases/{inv['id']}/finding-reviews",
            json={"reference": node["id"], "disposition": "supported", "notes": "Unauthorized review attempt"},
        ).status_code
        == 403
    )


def test_batch_upload_preserves_per_file_errors(client, admin, source):
    with (source / "original.mp4").open("rb") as f:
        response = client.post(
            "/api/videos/batch",
            files=[("files", ("good.mp4", f, "video/mp4")), ("files", ("bad.exe", b"bad", "application/octet-stream"))],
        )
    assert response.status_code == 202
    assert response.json()["accepted"] == 1 and response.json()["items"][1]["status"] == "failed"


@pytest.mark.parametrize(
    "action,query", [("possible_open", "opening"), ("possible_remove", "removal"), ("possible_transfer", "transfer")]
)
def test_possible_actions_are_retrievable_after_ten_minutes(action, query):
    from app.retrieval import retrieve
    from app.inspection import SceneItem
    from pydantic import ValidationError

    SceneItem(frame_id="f", description="Uncertain object action", object_action=action)
    with pytest.raises(ValidationError):
        SceneItem(frame_id="f", description="Unsupported conclusion", object_action="confirmed_theft")
    graph = {
        "nodes": [
            {
                "id": "event:e",
                "kind": "ai_observation",
                "label": action,
                "data": {
                    "asset_id": "a",
                    "type": action,
                    "start": 3601,
                    "end": 3601,
                    "category": "inferred",
                    "state": "UNRESOLVED",
                },
            },
            {
                "id": "frame:f",
                "kind": "frame",
                "label": "Source frame",
                "data": {"frame_id": "f", "timestamp": 3601, "asset_id": "a", "url": "/api/frames/f/native"},
            },
        ],
        "edges": [{"source": "event:e", "target": "frame:f", "relationship": "source_interval_frame"}],
    }
    rows, filters = retrieve(graph, f"Show possible {query} between 3600 and 3602 seconds")
    assert len(rows) == 1 and rows[0]["id"] == "event:e"
    assert filters["start_seconds"] == 3600 and filters["end_seconds"] == 3602
