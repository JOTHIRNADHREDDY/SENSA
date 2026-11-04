"""Controlled investigation contracts; synthetic geometry is never real-world ground truth."""

from copy import deepcopy
from PIL import Image, ImageChops, ImageFilter
from math import cos, radians, sin
import random
import pytest
from sqlalchemy import select
from app import config
from app.association import deduplicate, register_images, event_episodes, frame_motion
from app.registration import bounds, corners, inverse, transform_point
from app.vision import associate, interactions
from app.intelligence import rebuild, ensure_configuration
from app.db import DB, Frame, Observation, ModelRun, CaseVideo, uid
from conftest import case


def ob(oid, fid, ts, box, label="person", **kwargs):
    return {
        "id": oid,
        "frame_id": fid,
        "timestamp": ts,
        "box": box,
        "label": label,
        "run_id": "r",
        "track_id": oid,
        **kwargs,
    }


def textured():
    rng = random.Random(418)
    image = Image.new("L", (64, 48))
    image.putdata([rng.randrange(256) for _ in range(64 * 48)])
    return image


def test_global_pan_registration_and_textureless_visibility_abstention():
    a = textured()
    shifted = ImageChops.offset(a, 5, -3)
    result = register_images(a, shifted)
    assert result["state"] == "translation" and result["translation"] == [5 / 64, -3 / 48]
    assert register_images(a, a)["state"] == "static"
    assert register_images(Image.new("L", (64, 48)), Image.new("L", (64, 48)))["translation"] is None
    assert register_images(a, a, [[0, 0, 1, 1]])["state"] == "unregistered"
    zoomed = a.crop((8, 6, 56, 42)).resize(a.size)
    assert register_images(a, zoomed)["state"] == "unregistered"
    mixed = a.copy()
    shifted = ImageChops.offset(a, 5, 0)
    mixed.paste(shifted.crop((0, 0, 32, 48)), (0, 0))
    assert register_images(a, mixed)["state"] != "translation"


def similarity_fixture(angle, scale):
    source = Image.new("L", (144, 108))
    rng = random.Random(19)
    source.putdata([rng.randrange(256) for _ in range(source.width * source.height)])
    source = source.filter(ImageFilter.GaussianBlur(0.7))
    a = scale * cos(radians(angle))
    b = scale * sin(radians(angle))
    offset_x = 74 - a * 72 + b * 54
    offset_y = 53 - b * 72 - a * 54
    after = source.transform(
        source.size, Image.Transform.AFFINE, inverse((a, -b, offset_x, b, a, offset_y)), Image.Resampling.BILINEAR
    )
    matrix = (a, -b * 108 / 144, offset_x / 144, b * 144 / 108, a, offset_y / 108)
    return source, after, matrix


@pytest.mark.parametrize(("angle", "scale"), [(4, 1.045), (4, 1), (0, 1.06), (-5, 0.96)])
def test_similarity_registration_recovers_supported_background_motion(angle, scale):
    before, after, matrix = similarity_fixture(angle, scale)
    result = register_images(before, after)
    assert result["state"] == "similarity"
    assert result["rotation_degrees"] == pytest.approx(angle, abs=0.6)
    assert result["scale"] == pytest.approx(scale, abs=0.01)
    for point in ((0.2, 0.2), (0.5, 0.5), (0.8, 0.8)):
        assert transform_point(result["matrix"], point) == pytest.approx(transform_point(matrix, point), abs=0.012)


def test_similarity_registration_rejects_large_motion_and_split_background():
    before, after, _ = similarity_fixture(15, 1.25)
    assert register_images(before, after)["state"] == "unregistered"
    _, warped, _ = similarity_fixture(5, 1.05)
    mixed = before.copy()
    mixed.paste(warped.crop((0, 0, 72, 108)), (0, 0))
    assert register_images(before, mixed)["state"] != "similarity"


def test_similarity_motion_reaches_tracking_and_resets_at_cuts(tmp_path):
    before, after, matrix = similarity_fixture(4, 1.045)
    paths = {name: tmp_path / f"{name}.png" for name in ("a", "b", "c")}
    before.save(paths["a"])
    after.save(paths["b"])
    after.save(paths["c"])
    frames = {fid: {"id": fid, "timestamp": time} for time, fid in enumerate(paths)}
    box = [0.74, 0.72, 0.79, 0.77]
    projected = bounds(corners(box, matrix))
    observations = [ob("1", "a", 0, box, "package"), ob("2", "b", 1, projected, "package")]
    rows, offsets = frame_motion(frames, observations, lambda frame: paths[frame["id"]], [1.5])
    assert [row["state"] for row in rows] == ["segment_start", "similarity", "segment_start"]
    assert offsets["a"]["group"] == offsets["b"]["group"] != offsets["c"]["group"]
    tracks, _, _, _ = associate(observations, frames, "test", [1.5], motion=offsets)
    assert [track["observations"] for track in tracks] == [["1", "2"]]


def test_stock_comparison_projects_shelf_polygon_and_rejects_clipped_region(client, asset):
    source, warped, matrix = similarity_fixture(4, 1.045)
    roi = [0.33, 0.30, 0.66, 0.60]
    enclosing = bounds(corners(roi, matrix))
    # This center lies inside the projected bounding rectangle and outside the actual shelf.
    outsider = enclosing[0] + 0.002, enclosing[1] + 0.002
    inv = case(client)
    with DB.begin() as db:
        db.add(CaseVideo(case_id=inv["id"], asset_id=asset.id))
        before, after = db.scalars(select(Frame).where(Frame.asset_id == asset.id).order_by(Frame.timestamp)).all()[:2]
        folder = config.DATA / asset.id / "frames"
        source.save(folder / before.filename)
        warped.save(folder / after.filename)
        run = ModelRun(
            id=uid(),
            asset_id=asset.id,
            provider="synthetic-test",
            model="test",
            status="succeeded",
            routing="test",
            raw={"concept": "cardboard box", "source_frames": [{"id": frame.id} for frame in (before, after)]},
        )
        db.add(run)
        db.add(
            ModelRun(
                id=uid(),
                asset_id=asset.id,
                provider="synthetic-test",
                model="test",
                status="succeeded",
                routing="test",
                raw={"concept": "person", "source_frames": [{"id": frame.id} for frame in (before, after)]},
            )
        )
        db.flush()
        for frame, (x, y) in ((before, (0.5, 0.45)), (after, transform_point(matrix, (0.5, 0.45))), (after, outsider)):
            db.add(
                Observation(
                    id=uid(),
                    asset_id=asset.id,
                    frame_id=frame.id,
                    run_id=run.id,
                    timestamp=frame.timestamp,
                    label="cardboard box",
                    box=[x - 0.005, y - 0.005, x + 0.005, y + 0.005],
                    provenance="synthetic-test",
                )
            )
        body = {"before_frame_id": before.id, "after_frame_id": after.id, "roi": roi}
    endpoint = f"/api/cases/{inv['id']}/stock-comparisons"
    response = client.post(endpoint, json=body)
    assert response.status_code == 201
    result = response.json()["rows"][0]
    assert result["camera_motion"]["state"] == "similarity"
    assert result["fixed_shelf_comparable"]
    assert result["before"]["count"] == result["after"]["count"] == 1
    assert result["visual_stock_discrepancy"]["aligned_shelf_delta"] == 0
    assert result["state"] == "UNRESOLVED" and not result["confirmed_removal"]
    assert client.post(endpoint, json=body).json()["id"] == response.json()["id"]
    clipped = client.post(endpoint, json={**body, "roi": [0, 0, 1, 1]}).json()["rows"][0]
    assert not clipped["fixed_shelf_comparable"]
    assert clipped["visual_stock_discrepancy"]["aligned_shelf_delta"] is None
    with DB.begin() as db:
        run = next(
            r
            for r in db.scalars(select(ModelRun).where(ModelRun.asset_id == asset.id))
            if r.raw.get("concept") == "person"
        )
        db.add(
            Observation(
                id=uid(),
                asset_id=asset.id,
                frame_id=after.id,
                run_id=run.id,
                timestamp=after.timestamp,
                label="person",
                box=[0.45, 0.40, 0.49, 0.44],
                provenance="synthetic-test",
            )
        )
    obscured = client.post(endpoint, json=body).json()["rows"][0]
    assert obscured["fixed_shelf_comparable"]
    assert obscured["after"]["potential_occlusion"]
    assert obscured["visible_detection_delta"] == 0
    assert obscured["visual_stock_discrepancy"]["aligned_shelf_delta"] is None
    assert obscured["visual_stock_discrepancy"]["availability"] == "unavailable"


def test_camera_translation_continues_tracks_but_not_fixed_package_motion():
    frames = {"a": {"timestamp": 0}, "b": {"timestamp": 1}}
    obs = [ob("1", "a", 0, [0.1, 0.2, 0.2, 0.3], "package"), ob("2", "b", 1, [0.3, 0.2, 0.4, 0.3], "cardboard box")]
    offsets = {"a": {"group": 1, "offset": [0, 0]}, "b": {"group": 1, "offset": [0.2, 0]}}
    tracks, _, _, _ = associate(obs, frames, "C", [], motion=offsets)
    assert len(tracks) == 1
    tracks[0]["stabilized_displacement"] = 0
    assert not interactions(tracks, obs, frames, [])
    assert len(associate(obs, frames, "C", [0.5], motion=offsets)[0]) == 2


def test_dense_sampling_does_not_fragment_sparse_track_and_anchor_survives_new_observation_ids():
    frames = {str(t): {"timestamp": t} for t in [0, 0.2, 0.4, 2, 4]}
    rows = [ob(str(t), str(t), t, [0.1 + t * 0.005, 0.1, 0.3 + t * 0.005, 0.8]) for t in [0, 0.2, 0.4, 2, 4]]
    tracks, _, _, _ = associate(rows, frames, "C", [])
    assert len(tracks) == 1 and len(tracks[0]["observations"]) == 5
    changed = [{**o, "id": "new-" + o["id"]} for o in rows]
    assert associate(changed, frames, "C", [])[0][0]["id"] == tracks[0]["id"]


def test_duplicate_package_aliases_preserve_raw_ids_and_co_visible_people():
    rows = [
        ob("a", "f", 0, [0.1, 0.1, 0.4, 0.4], "package"),
        ob("b", "f", 0, [0.101, 0.1, 0.401, 0.4], "carton"),
        ob("c", "f", 0, [0.6, 0.1, 0.9, 0.4], "package"),
        ob("p1", "f", 0, [0.2, 0.2, 0.4, 0.9]),
        ob("p2", "f", 0, [0.2, 0.2, 0.4, 0.9]),
    ]
    original = deepcopy(rows)
    selected, duplicates = deduplicate(rows)
    assert len(selected) == 4 and duplicates == {"b": "a"} and rows == original
    assert len(associate(selected, {"f": {"timestamp": 0}}, "C", [])[0]) == 4


def test_coarse_provider_motion_requires_geometry_uniqueness_and_stops_at_cuts():
    frames = {"a": {"timestamp": 0}, "b": {"timestamp": 2}, "c": {"timestamp": 4}}
    rows = [
        ob(str(i), fid, i * 2, [0.1 + i * 0.26, 0.1, 0.2 + i * 0.26, 0.8], track_id="SAM-7")
        for i, fid in enumerate(frames)
    ]
    tracks = associate(rows, frames, "C", [])[0]
    assert len(tracks) == 1
    assert len(associate(rows, frames, "C", [3])[0]) == 2
    far = [{**rows[1], "box": [0.8, 0.1, 0.9, 0.8]}]
    assert len(associate(rows[:1] + far, frames, "C", [])[0]) == 2
    ambiguous = rows[:2] + [{**rows[1], "id": "competing", "box": [0.37, 0.1, 0.47, 0.8]}]
    assert len(associate(ambiguous, frames, "C", [])[0]) == 3


def test_carry_episode_deduplicates_records_and_keeps_frames_events_and_cut_boundaries():
    frames = {str(t): {"id": str(t), "timestamp": t} for t in [0, 0.2, 0.4, 4]}
    tracks = [{"id": "P1", "category": "person", "frame_ids": list(frames)}]
    events = [{"id": str(i), "type": "possible_carry", "start": t, "end": t} for i, t in enumerate([0, 0, 0.2, 0.4, 4])]
    episodes = event_episodes([], events, tracks, frames, [0.3])
    assert len(episodes) == 3
    assert episodes[0]["source_event_ids"] == ["0", "1", "2"]
    assert episodes[0]["frame_ids"] == ["0", "0.2"]
    assert all(
        e["state"] == "UNRESOLVED" and not e["confirmed_removal"] and e["human_conclusion"] is None for e in episodes
    )


def test_unknown_participants_do_not_imply_same_person_across_frames():
    frames = {"a": {"id": "a", "timestamp": 0}, "b": {"id": "b", "timestamp": 0.2}}
    events = [
        {"id": "1", "type": "possible_carry", "start": 0, "end": 0},
        {"id": "2", "type": "possible_carry", "start": 0.2, "end": 0.2},
    ]
    assert len(event_episodes([], events, [], frames, [])) == 2


def test_episode_pdf_preserves_unresolved_snapshot_and_native_frame_links(client, asset):
    from app.db import Report

    inv = case(client)
    with DB.begin() as db:
        frame = db.scalars(select(Frame).where(Frame.asset_id == asset.id)).first()
        content = {
            "event_episodes": [
                {
                    "data": {
                        "start": frame.timestamp,
                        "end": frame.timestamp,
                        "kind": "possible_carry",
                        "state": "UNRESOLVED",
                        "confirmed_removal": False,
                        "sample_count": 1,
                        "uncertainty": "Human verification required",
                    },
                    "source_frames": [{"url": f"/api/frames/{frame.id}/native", "timestamp": frame.timestamp}],
                }
            ],
            "human_conclusion": "",
        }
        report = Report(id=uid(), case_id=inv["id"], version=1, author_id=asset.owner_id, content=content)
        db.add(report)
        db.flush()
        rid = report.id
        fid = frame.id
    response = client.get(f"/api/reports/{rid}/pdf")
    assert response.status_code == 200 and response.content.startswith(b"%PDF")
    assert client.get(f"/api/frames/{fid}/native").status_code == 200
    with DB() as db:
        assert db.get(Report, rid).content == content


def test_stock_provenance_separates_inventory_visual_and_human(client, asset):
    inv = case(client)
    with DB.begin() as db:
        db.add(CaseVideo(case_id=inv["id"], asset_id=asset.id))
        fs = db.scalars(select(Frame).where(Frame.asset_id == asset.id).order_by(Frame.timestamp)).all()[:2]
        ids = [f.id for f in fs]
    response = client.post(
        f"/api/cases/{inv['id']}/stock-comparisons",
        json={
            "before_frame_id": ids[0],
            "after_frame_id": ids[1],
            "independent_before": 20,
            "independent_after": 19,
            "inventory_reference": "Synthetic stock ledger for regression",
        },
    )
    assert response.status_code == 201, response.text
    row = response.json()["rows"][0]
    assert row["source_provenance"][0]["source_sha256"] == asset.sha256
    assert row["inventory_discrepancy"]["delta"] == -1 and not row["inventory_discrepancy"]["verified"]
    assert row["possible_removal"]["established"] is False and row["human_conclusion"] is None
    assert "aligned_shelf_delta" in row["visual_stock_discrepancy"]
    assert "raw_response_sha256" in row["before"]


def test_latest_negative_query_does_not_resurrect_old_package(client, asset):
    rebuild(asset.id)
    with DB.begin() as db:
        f = db.scalars(select(Frame).where(Frame.asset_id == asset.id)).first()
        for i in [1, 2]:
            run = ModelRun(
                id=uid(),
                asset_id=asset.id,
                provider="test",
                model="test",
                status="succeeded",
                routing="regression",
                created=f"2026-01-0{i}",
                raw={"concept": "cardboard box", "input_frames": [{"id": f.id, "timestamp": f.timestamp}]},
            )
            db.add(run)
            db.flush()
            if i == 1:
                db.add(
                    Observation(
                        id=uid(),
                        asset_id=asset.id,
                        run_id=run.id,
                        frame_id=f.id,
                        timestamp=f.timestamp,
                        label="cardboard box",
                        box=[0.1, 0.1, 0.3, 0.3],
                        provenance="test",
                    )
                )
    result = rebuild(asset.id)["data"]
    assert not any(t["category"] == "cardboard box" for t in result["tracks"])


def test_uncertain_reinspection_is_bounded_nonoverlapping_and_cut_safe(monkeypatch):
    from types import SimpleNamespace
    from app.discovery import targeted_intervals

    snapshot = SimpleNamespace(
        data={
            "continuity": {"boundaries": [5]},
            "reinspection_plan": [
                {"start": 3.9, "end": 5.1, "reasons": ["model_disagreement"]},
                {"start": 4, "end": 5, "reasons": ["overlap"]},
                {"start": 7, "end": 8, "reasons": ["fragmented_track"]},
            ],
        }
    )
    monkeypatch.setattr("app.discovery.latest", lambda db, aid: snapshot)
    targets = targeted_intervals(
        None, {"eligible_ranges": [{"asset_id": "A", "start": 0, "end": 10}], "candidates": []}
    )
    assert len(targets) == 2 and targets[0]["reason"] == "model_disagreement"
    assert all(w["end"] - w["start"] <= 1.6 + 1e-6 and not w["start"] < 5 < w["end"] for w in targets)
    assert targets[0]["end"] < targets[1]["start"]


def test_episode_does_not_bridge_a_long_visibility_gap():
    frames = {"a": {"id": "a", "timestamp": 0}, "b": {"id": "b", "timestamp": 8}}
    finding = {
        "id": "f",
        "kind": "person_object_proximity",
        "person_track": "P",
        "object_track": "O",
        "start": 0,
        "end": 8,
        "frame_ids": ["a", "b"],
        "observation_ids": ["oa", "ob"],
        "uncertainty": "Unresolved",
    }
    obs = [{"id": "oa", "frame_id": "a"}, {"id": "ob", "frame_id": "b"}]
    episodes = event_episodes([finding], [], [], frames, [], observations=obs)
    assert len(episodes) == 2 and episodes[0]["observation_ids"] == ["oa"]


def test_episode_timeline_clock_mapping_search_and_case_access(client, asset):
    from app.db import Event

    inv = case(client)
    with DB.begin() as db:
        db.add(CaseVideo(case_id=inv["id"], asset_id=asset.id))
        cfg = ensure_configuration(db, asset)
        cfg.clock_start = "2026-11-02T05:30:00+05:30"
        cfg.clock_verified = True
        cfg.clock_evidence = "Controlled UTC reference"
        frame = db.scalars(select(Frame).where(Frame.asset_id == asset.id).order_by(Frame.timestamp)).first()
        run = ModelRun(id=uid(), asset_id=asset.id, provider="test", model="test", status="succeeded", routing="test")
        db.add(run)
        db.flush()
        db.add(
            Event(
                id=uid(),
                asset_id=asset.id,
                run_id=run.id,
                title="Possible carry",
                type="possible_carry",
                description="Unresolved",
                start=frame.timestamp,
                end=frame.timestamp,
                provenance="meta_inference",
                category="inferred",
            )
        )
    rebuild(asset.id)
    payload = client.get(f"/api/cases/{inv['id']}/timeline", params={"q": "possible_carry"}).json()
    assert payload["total"] == 1 and payload["items"][0]["camera_start"] == "2026-11-02T05:30:00+05:30"
    assert payload["chronology"] == "verified source clocks"
    graph = payload["graph"]
    nodes = {n["id"] for n in graph["nodes"]}
    assert all(e["source"] in nodes and e["target"] in nodes for e in graph["edges"])
    assert client.get(f"/api/cases/{inv['id']}/timeline", params={"q": "not-present"}).json()["total"] == 0
    assert client.get("/api/cases/absent/timeline").status_code == 404
