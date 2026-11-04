"""Exercise the running upload-to-report workflow. Meta calls require --authorize-meta."""

import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import secrets
import time
from urllib.parse import urlsplit

import httpx
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]


def wait_for(read, complete, timeout=420):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        result = read()
        if complete(result):
            return result
        time.sleep(2)
    raise TimeoutError(
        "Work remains active. Re-run to resume the same receipt and idempotency keys."
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--video", type=Path, default=ROOT / "demo/sources/synthetic-camera-1.mp4"
    )
    parser.add_argument("--base-url", default="http://127.0.0.1:8001")
    parser.add_argument(
        "--authorize-meta",
        action="store_true",
        help="Authorize up to three paid requests on 0–8 seconds",
    )
    args = parser.parse_args()
    if urlsplit(args.base_url).hostname not in {"localhost", "127.0.0.1", "::1"}:
        parser.error("Smoke tests target a local instance only")
    with args.video.open("rb") as file:
        checksum = hashlib.file_digest(file, "sha256").hexdigest()
    folder = ROOT / "tmp/video-smoke" / checksum[:16]
    folder.mkdir(parents=True, exist_ok=True)
    receipt_file = folder / "receipt.json"
    receipt = (
        json.loads(receipt_file.read_text())
        if receipt_file.exists()
        else {"source_sha256": checksum}
    )

    def save():
        receipt_file.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")

    with httpx.Client(base_url=args.base_url.rstrip("/"), timeout=300) as client:

        def get(path):
            return client.get("/api" + path).raise_for_status().json()

        def post(path, **kwargs):
            return client.post("/api" + path, **kwargs).raise_for_status().json()

        health = get("/health")
        assert health["active_workers"] == 2
        if health["auth_mode"] == "local":
            post("/auth/local", json={})
        elif health["setup_required"]:
            post(
                "/auth/setup",
                json={
                    "email": "smoke@example.invalid",
                    "password": secrets.token_urlsafe(30),
                    "name": "Local smoke test",
                },
            )
        else:
            email, password = (
                os.getenv("SENSA_SMOKE_EMAIL"),
                os.getenv("SENSA_SMOKE_PASSWORD"),
            )
            if not email or not password:
                raise SystemExit(
                    "BLOCKED: existing sign-in workspace needs private SENSA_SMOKE_EMAIL and SENSA_SMOKE_PASSWORD"
                )
            post("/auth/login", json={"email": email, "password": password})
        if "asset_id" not in receipt:
            with args.video.open("rb") as file:
                media_type = (
                    "video/webm"
                    if args.video.suffix.lower() == ".webm"
                    else "video/mp4"
                )
                uploaded = post(
                    "/videos", files={"file": (args.video.name, file, media_type)}
                )
            receipt["asset_id"] = uploaded["id"]
            save()
        aid = receipt["asset_id"]
        asset = wait_for(
            lambda: get(f"/videos/{aid}"),
            lambda row: row["status"] not in {"queued", "running"},
        )
        assert asset["status"] in {"succeeded", "partial"} and not asset["job"]["error"]
        assert asset["sha256"] == checksum
        assert (
            asset["synthetic"] is False
        )  # Ordinary uploads never inherit trusted generator annotations.
        frames = asset["frames"]
        assert frames and all(
            0 <= row["timestamp"] <= asset["duration"] for row in frames
        )
        assert [row["timestamp"] for row in frames] == sorted(
            {row["timestamp"] for row in frames}
        )
        receipt.update(
            {
                "upload": "PASS",
                "duration": asset["duration"],
                "codec": asset["codec"],
                "sampled_frames": len(frames),
            }
        )
        print(
            f"PASS upload, validation and {len(frames)} timestamped source frames",
            flush=True,
        )
        options = {
            "mode": "meta" if args.authorize_meta else "local",
            "authorize_external_processing": args.authorize_meta,
            "request_key": f"smoke-{'meta' if args.authorize_meta else 'local'}-{checksum[:24]}",
            "concepts": ["person", "car"],
            "start": 0,
            "end": min(8, asset["duration"]),
            "fps": 0.5,
            "max_windows": 1,
            "max_requests": 3,
        }
        if args.authorize_meta and health["provider"] != "configured":
            raise SystemExit(
                "BLOCKED: Meta is authorized but the backend key is unavailable"
            )
        job = post(f"/videos/{aid}/intelligence/jobs", json=options)
        job_id = job["id"]
        receipt["inspection_job_id"] = job_id
        save()
        detail = wait_for(
            lambda: get(f"/videos/{aid}/intelligence"),
            lambda row: any(
                j["id"] == job_id and j["status"] not in {"queued", "running"}
                for j in row["jobs"]
            ),
        )
        job = next(row for row in detail["jobs"] if row["id"] == job_id)
        receipt["inspection_status"] = job["status"]
        receipt["inspection_result"] = job["result"]
        save()
        assert job["status"] in {"succeeded", "partial"} and not job["result"].get(
            "errors"
        ), "Inspection failed. The saved job is retained; no paid retry is automatic."
        snapshot = detail["snapshot"]["data"]
        playback = detail["playback"]
        assert playback["source_sha256"] == checksum
        for start in (0, max(0, args.video.stat().st_size // 2)):
            response = client.get(
                playback["url"], headers={"Range": f"bytes={start}-{start + 31}"}
            ).raise_for_status()
            assert response.status_code == 206
            with args.video.open("rb") as original:
                original.seek(start)
                assert response.content == original.read(32)
        support = sorted(playback["frames"].values(), key=lambda row: row["timestamp"])
        assert support
        for ref in (support[0], support[-1]):
            response = client.get(ref["url"]).raise_for_status()
            ref = get(f"/videos/{aid}/intelligence")["playback"]["frames"][
                ref["frame_id"]
            ]
            assert (
                ref["source_id"] == playback["source_id"]
                and ref["source_sha256"] == checksum
            )
            assert hashlib.sha256(response.content).hexdigest() == ref["frame_sha256"]
            with Image.open(io.BytesIO(response.content)) as image:
                image.verify()
        asset = get(f"/videos/{aid}")
        runs = {row["id"]: row for row in asset["runs"]}
        selected_runs = [runs[id_] for id_ in job["result"].get("run_ids", [])]
        if args.authorize_meta:
            assert {
                row["model"] for row in selected_runs if row["status"] == "succeeded"
            } == {"sam-3.1", "muse-spark-1.3"}
            assert job["result"]["provider_requests"] == 3
        else:
            assert job["result"].get("provider_requests", 0) == 0
        if "case_id" not in receipt:
            inv = post(
                "/cases",
                json={
                    "title": "Video workflow validation",
                    "description": "Review visible people and vehicles, their movements and uncertainty without inferring identity or wrongdoing.",
                    "purpose": "Authorized local evaluation of source-linked evidence",
                },
            )
            receipt["case_id"] = inv["id"]
            save()
        cid = receipt["case_id"]
        discovery = post(
            f"/cases/{cid}/discovery",
            json={
                "incident": "Review visible people and vehicles, their movements and uncertainty without inferring identity or wrongdoing.",
                "asset_ids": [aid],
                "request_key": f"smoke-existing-{checksum[:24]}",
                "mode": "existing",
                "reinspect": False,
            },
        )
        discovery_id = discovery["id"]
        result = wait_for(
            lambda: get(f"/cases/{cid}/discovery"),
            lambda row: any(
                r["id"] == discovery_id and r["status"] not in {"queued", "running"}
                for r in row["runs"]
            ),
        )
        run = next(row for row in result["runs"] if row["id"] == discovery_id)
        assert (
            run["status"] in {"partial", "succeeded"}
            and run["result"]["provider_requests"] == 0
        )
        report_id = run["result"]["report_id"]
        exported = get(f"/reports/{report_id}/portable/json")
        assert exported["case_id"] == cid and exported["id"] == report_id
        assert not exported["content"]["human_conclusion"]
        pdf = client.get(
            f"/api/reports/{report_id}/portable/summary"
        ).raise_for_status()
        assert pdf.content.startswith(b"%PDF")
        (folder / "report.json").write_text(
            json.dumps(exported, indent=2), encoding="utf-8"
        )
        (folder / "summary.pdf").write_bytes(pdf.content)
        receipt.update(
            {
                "playback_ranges": "PASS",
                "native_frame_hashes": "PASS",
                "report_id": report_id,
                "case_id": cid,
                "person_tracks": sum(
                    row["category"] == "person" for row in snapshot["tracks"]
                ),
                "object_tracks": sum(
                    row["category"] != "person" for row in snapshot["tracks"]
                ),
                "event_episodes": len(snapshot["episodes"]),
                "detections": len(asset["observations"]),
                "interpretations": len(asset["events"]),
                "model_runs": [
                    {"id": row["id"], "model": row["model"], "status": row["status"]}
                    for row in selected_runs
                ],
                "report_export": "PASS",
                "scope": "Requested 0–8 seconds at 0.5 fps. Processed intervals are in inspection_result; remaining coverage is incomplete.",
            }
        )
        save()
        print(json.dumps(receipt), flush=True)
        print(
            "PASS source-byte ranges, native frame hashes, association pipeline and existing-evidence report",
            flush=True,
        )


if __name__ == "__main__":
    main()
