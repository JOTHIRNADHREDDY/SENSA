"""Recheck the saved SENSA cases against a running loopback workspace."""

import argparse
import hashlib
import json
import sys
import time
from pathlib import Path

import httpx
from sqlalchemy import select

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from app import config  # noqa: E402
from app.db import (  # noqa: E402
    DB,
    DerivedArtifact,
    Event,
    Frame,
    IntelligenceSnapshot,
    ModelRun,
    Observation,
    Report,
    SourceRecord,
    serialize,
)
from app.media import sha256  # noqa: E402


def run_job(client, asset_id, options):
    url = f"/api/videos/{asset_id}/intelligence"
    job_id = client.post(url + "/jobs", json=options).raise_for_status().json()["id"]
    deadline = time.monotonic() + 240
    while time.monotonic() < deadline:
        detail = client.get(url).raise_for_status().json()
        job = next(row for row in detail["jobs"] if row["id"] == job_id)
        if job["status"] not in ("queued", "running"):
            return job, detail
        time.sleep(2)
    raise TimeoutError("Inspection is still active after the verification deadline")


def verify_baseline(folder):
    baseline = json.loads((folder / "baseline.json").read_text())
    checked = 0
    with DB() as db:
        for cls in (
            Report,
            ModelRun,
            Observation,
            Event,
            Frame,
            DerivedArtifact,
            SourceRecord,
            IntelligenceSnapshot,
        ):
            for key, expected in baseline["records"][cls.__tablename__].items():
                record = db.get(cls, key)
                assert record is not None
                digest = hashlib.sha256(
                    json.dumps(serialize(record), sort_keys=True).encode()
                ).hexdigest()
                assert digest == expected, f"Historical {cls.__name__} changed"
                checked += 1
        sources = db.scalars(select(SourceRecord)).all()
        frames = db.scalars(
            select(DerivedArtifact).where(DerivedArtifact.kind == "native_frame")
        ).all()
        assert all(
            sha256(config.DATA / row.path) == row.sha256 for row in sources + frames
        )
    assert all(
        sha256(Path(path)) == digest for path, digest in baseline["files"].items()
    )
    print(
        f"PASS evidence integrity: {checked} historical records, {len(baseline['files'])} PDFs, "
        f"{len(sources)} sources, {len(frames)} native frames",
        flush=True,
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--replay-key",
        default="engineering-source-binding",
        help="Prefix for offline job idempotency keys",
    )
    parser.add_argument(
        "--live",
        action="store_true",
        help="Authorize up to two Meta requests on synthetic footage",
    )
    args = parser.parse_args()
    folder = config.DATA / "controlled-upgrade"
    cases = json.loads((folder / "runs.json").read_text())
    live_failed = False
    with httpx.Client(
        base_url="http://127.0.0.1:8001",
        headers={"Origin": "http://127.0.0.1:3001"},
        timeout=120,
    ) as client:
        client.post("/api/auth/local").raise_for_status()
        for name, case in cases.items():
            for index, asset_id in enumerate(case["asset_ids"], 1):
                options = {
                    "mode": "local",
                    "request_key": args.replay_key + "-" + asset_id,
                }
                print(f"{name} recording {index} queued", flush=True)
                job, detail = run_job(client, asset_id, options)
                assert job["status"] == "succeeded", job.get("error")
                assert job["result"]["provider_requests"] == 0
                snapshot = detail["snapshot"]["data"]
                cuts = snapshot["continuity"]["boundaries"]
                assert all(
                    not any(t["first"] < cut <= t["last"] for cut in cuts)
                    for t in snapshot["tracks"]
                )
                assert all(
                    e["state"] == "UNRESOLVED" and not e["confirmed_removal"]
                    for e in snapshot["episodes"]
                )
                if name == "original":
                    assert all(
                        not frame.get("camera_timestamp")
                        for frame in snapshot["frames"]
                    )
                    expected_cuts = [
                        (4.933, 4.967),
                        (9.367, 9.400),
                        (14.400, 14.433),
                        (19.567, 19.600),
                        (23.600, 23.633),
                    ]
                    assert all(
                        any(lo - 0.001 <= cut <= hi + 0.001 for cut in cuts)
                        for lo, hi in expected_cuts
                    )
                else:
                    assert any(
                        e["kind"] == "possible_carry" for e in snapshot["episodes"]
                    )
                print(
                    f"PASS {name} recording {index}: {len(cuts)} cuts, zero provider requests",
                    flush=True,
                )
            graph = (
                client.get(f"/api/cases/{case['case_id']}/graph")
                .raise_for_status()
                .json()
            )
            reference = next(
                node["data"]
                for node in graph["nodes"]
                if node["kind"] == "frame"
                and node["data"].get("binding") == "native_artifact"
            )
            response = client.get(reference["url"]).raise_for_status()
            assert response.headers["x-source-sha256"] == reference["source_sha256"]
            assert response.headers["x-evidence-sha256"] == reference["frame_sha256"]
            print(f"PASS {name} pinned frame link", flush=True)
        old = json.loads(
            (config.DATA / "completion" / "synthetic-stock-comparison.json").read_text()
        )["rows"][0]
        comparison = {
            "labels": old["labels"],
            "roi": old["roi"],
            "inventory_reference": old["inventory_reference"],
            "before_frame_id": old["before"]["frame_id"],
            "after_frame_id": old["after"]["frame_id"],
            "independent_before": 6,
            "independent_after": 5,
        }
        endpoint = f"/api/cases/{cases['controlled']['case_id']}/stock-comparisons"
        stock = client.post(endpoint, json=comparison).raise_for_status().json()
        row = stock["rows"][0]
        assert (
            row["visible_detection_delta"] == row["independent_inventory_delta"] == -1
        )
        assert row["state"] == "UNRESOLVED" and not row["confirmed_removal"]
        assert (
            client.post(endpoint, json=comparison).raise_for_status().json()["id"]
            == stock["id"]
        )
        print(
            "PASS controlled stock: visual -1, inventory -1, UNRESOLVED, idempotent",
            flush=True,
        )
        if args.live:
            if (
                client.get("/api/health").raise_for_status().json()["provider"]
                != "configured"
            ):
                print(
                    "BLOCKED live Meta smoke: credentials are unavailable", flush=True
                )
            else:
                asset_id = cases["controlled"]["asset_ids"][0]
                options = {
                    "mode": "meta",
                    "authorize_external_processing": True,
                    "request_key": "engineering-meta-smoke-v1",
                    "concepts": ["person"],
                    "start": 7.07,
                    "end": 7.58,
                    "fps": 5,
                    "max_requests": 2,
                }
                print(
                    "Live synthetic Meta smoke queued with a two-request budget",
                    flush=True,
                )
                job, _ = run_job(client, asset_id, options)
                result = job["result"]
                with DB() as db:
                    models = {
                        run.model: run.status
                        for key in result.get("run_ids", [])
                        if (run := db.get(ModelRun, key))
                    }
                live_failed = (
                    job["status"] != "succeeded"
                    or models != {"sam-3.1": "succeeded", "muse-spark-1.3": "succeeded"}
                    or result.get("provider_requests") != 2
                )
                status = "FAIL" if live_failed else "PASS"
                print(
                    f"{status} live Meta smoke: {result.get('provider_requests', 0)} requests, {models}",
                    flush=True,
                )
                if status == "FAIL":
                    print(job.get("error") or "Inspection did not succeed", flush=True)
        else:
            print("NOT RUN live Meta smoke", flush=True)
        assert client.get("/api/audit/verify").raise_for_status().json()["valid"]
    verify_baseline(folder)
    if live_failed:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
