import pytest
from app import config
from app.db import DB, DerivedArtifact, ModelRun, Observation, Report, serialize
from app.portable_observations import validate_observation_links
from app.portable_report import (
    UNAVAILABLE,
    alignment_available,
    build_pdf,
    clock_label,
    episode_groups,
    interaction_clusters,
    prepare,
    stock_versions,
)
from conftest import case


def test_episode_export_preserves_children_without_joining_other_tracks_sources_or_segments():
    def entry(id_, **changes):
        data = {
            "id": id_,
            "asset_id": "a",
            "source_id": "src",
            "segment": 1,
            "kind": "possible_carry",
            "start": 4,
            "end": 5,
            "state": "UNRESOLVED",
            "person_track": "person",
            "object_track": "object",
            "frame_ids": ["frame"],
            "observation_ids": [id_],
            **changes,
        }
        ref = {"source_id": data["source_id"], "timestamp": 4, "frame_id": "frame"}
        return {"id": id_, "data": data, "source_frames": [ref, ref]}

    groups = episode_groups(
        {
            "event_episodes": [
                entry("a"),
                entry("b"),
                entry("c", asset_id="other", source_id="other"),
                entry("d", segment=2),
                entry("e", kind="person_object_proximity"),
                entry("f", object_track="another"),
            ]
        }
    )
    assert len(groups) == 5
    assert groups[0]["ids"] == ["a", "b"] and groups[0]["observation_ids"] == ["a", "b"]
    assert len(groups[0]["frames"]) == 1


def test_comparison_versions_are_distinct_and_obstructed_alignment_is_unavailable():
    row = {
        "record_id": "one",
        "fixed_shelf_comparable": True,
        "visual_stock_discrepancy": {"availability": "available", "aligned_shelf_delta": -1, "visibility_clear": False},
    }
    first = {"data": {"id": "record-1", "created": "1", "rows": [row, row]}}
    second = {"data": {"id": "record-2", "created": "2", "rows": [{**row, "record_id": "two"}]}}
    assert [v["comparison_id"] for v in stock_versions({"stock_comparisons": [first, second]})] == ["two", "one"]
    assert not alignment_available(row)
    assert clock_label({}) == "SOURCE_RELATIVE"
    assert (
        clock_label({"synthetic": True, "clock_mapping": {"start": "present", "verified": True}})
        == "VERIFIED_FOR_FIXTURE"
    )
    assert (
        clock_label({"synthetic": False, "clock_mapping": {"start": "present", "verified": True}})
        == "CONFIGURED_SOURCE_CLOCK"
    )


def test_proximity_review_cluster_keeps_separate_tracks_and_hypotheses():
    common = {
        "asset_id": "camera1",
        "source_id": "source1",
        "segment": 1,
        "person_track": "person",
        "kind": "person_object_proximity",
        "start": 4,
        "end": 8,
    }

    def row(id_, **changes):
        return {**common, "id": id_, "ids": [id_], "object_track": id_, **changes}

    clusters = interaction_clusters(
        [
            row("one"),
            row("two", start=8, end=10),
            row("three", start=9, end=12),
            row("separate", start=15, end=18),
            row("camera2", asset_id="camera2", source_id="source2"),
            row("same_asset_different_registration", source_id="replacement"),
            row("other_segment", segment=2),
            row("other_person", person_track="another"),
            row("carry", kind="possible_carry"),
            row("movement", kind="possible_object_movement"),
            row("disappearance", kind="possible_disappearance"),
        ]
    )
    assert len(clusters) == 1
    cluster = clusters[0]
    assert cluster["start"] == 4 and cluster["end"] == 12
    assert cluster["continuity"] == "UNVERIFIED"
    assert {candidate["object_track"]: candidate["episode_ids"] for candidate in cluster["alternatives"]} == {
        key: [key] for key in ("one", "two", "three")
    }


def test_observation_link_validation_rejects_dangling_episode_reference():
    content = {"event_episodes": [{"data": {"observation_ids": ["missing"]}}]}
    with pytest.raises(ValueError, match="missing"):
        validate_observation_links(content)
    content["observations"] = [{"id": "missing", "evidence_status": "unavailable"}]
    with pytest.raises(ValueError, match="missing"):
        validate_observation_links(content)
    content["observations"][0]["reason"] = "Observation record missing from storage."
    validate_observation_links(content)


def test_portable_export_embeds_exact_native_artifact_and_refuses_modified_bytes(client, asset):
    inv = case(client)
    frame = client.get(f"/api/videos/{asset.id}").json()["frames"][0]
    assert client.get(f"/api/frames/{frame['id']}/native").status_code == 200
    with DB.begin() as db:
        from sqlalchemy import select

        artifact = db.scalar(select(DerivedArtifact).where(DerivedArtifact.frame_id == frame["id"]))
        source = {
            "asset_id": asset.id,
            "name": "Fixture",
            "synthetic": True,
            "sha256": asset.sha256,
            "native_source_id": artifact.source_id,
            "native_source_sha256": asset.sha256,
        }
        ref = {
            "asset_id": asset.id,
            "source_id": artifact.source_id,
            "source_sha256": asset.sha256,
            "frame_id": frame["id"],
            "artifact_id": artifact.id,
            "frame_sha256": artifact.sha256,
            "timestamp": frame["timestamp"],
        }
        run = ModelRun(asset_id=asset.id, provider="meta-standard", model="sam-3.1", status="succeeded", routing="test")
        db.add(run)
        db.flush()
        observation = Observation(
            asset_id=asset.id,
            run_id=run.id,
            frame_id=frame["id"],
            timestamp=frame["timestamp"],
            label="box",
            box=[0.1, 0.2, 0.3, 0.4],
            provenance="meta_inference",
        )
        db.add(observation)
        db.flush()
        report = Report(
            case_id=inv["id"],
            version=1,
            author_id=asset.owner_id,
            status="draft",
            content={
                "scope": "Search source http://127.0.0.1:3001/private",
                "integrity": [source],
                "models": [serialize(run, ("raw",))],
                "event_episodes": [
                    {
                        "id": "episode",
                        "source_frames": [ref],
                        "data": {
                            "id": "episode",
                            "kind": "possible_carry",
                            "state": "UNRESOLVED",
                            "asset_id": asset.id,
                            "source_id": artifact.source_id,
                            "segment": 1,
                            "frame_ids": [frame["id"]],
                            "observation_ids": [observation.id, "missing"],
                            "start": frame["timestamp"],
                            "end": frame["timestamp"],
                        },
                    }
                ],
            },
        )
        db.add(report)
        db.flush()
        report_id, observation_id, path = report.id, observation.id, config.DATA / artifact.path
    endpoint = f"/api/reports/{report_id}/portable"
    manifest = client.get(endpoint + "/manifest").json()
    assert manifest["images"][0]["frame_sha256"] == ref["frame_sha256"]
    assert manifest["images"][0]["embedding_status"] == "embedded"
    snapshot = client.get(endpoint + "/json").json()
    assert snapshot["id"] == report_id and snapshot["case_id"] == inv["id"]
    assert snapshot["evidence_manifest"] == manifest
    assert manifest["episode_ids"] == manifest["headline_episode_ids"] == ["episode"]
    assert manifest["unavailable_observation_ids"] == ["missing"]
    observations = {row["id"]: row for row in snapshot["content"]["observations"]}
    restored = observations[observation_id]
    assert restored["evidence_status"] == "available" and restored["source_frame"] == ref
    assert restored["model_provenance"]["model"] == "sam-3.1"
    assert restored["box"] == [0.1, 0.2, 0.3, 0.4]
    assert observations["missing"]["evidence_status"] == "unavailable"
    assert observations["missing"]["reason"]
    assert "127.0.0.1" not in snapshot["content"]["scope"]
    for kind in ("summary", "appendix"):
        pdf = client.get(endpoint + "/" + kind).content
        assert pdf.count(b"/Subtype /Image") == 1 and b"/URI" not in pdf
    path.write_bytes(b"corrupt")
    assert client.get(endpoint + "/manifest").json()["images"][0]["embedding_status"] == "unavailable"
    with DB() as db:
        report = db.get(Report, report_id)
        prepared = prepare(db, report)
        assert prepared[5][0][2] is None and UNAVAILABLE.endswith("NOT SUBSTITUTED")
        assert b"/Subtype /Image" not in build_pdf(report, prepared, "summary")
        assert b"/Subtype /Image" not in build_pdf(report, prepared, "appendix")
