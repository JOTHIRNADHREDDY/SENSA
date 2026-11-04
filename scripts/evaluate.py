"""Reproduce fixture-pipeline checks over the four generated local sources."""

import json
import time
from pathlib import Path

import httpx

root = Path(__file__).resolve().parents[1]
annotation = json.loads(
    (root / "sample_data/annotations.json").read_text(encoding="utf-8")
)
access = json.loads((root / "data/local-access.json").read_text(encoding="utf-8"))
client = httpx.Client(base_url="http://127.0.0.1:3001/api", timeout=20)
client.post(
    "/auth/login", json={"email": access["email"], "password": access["password"]}
).raise_for_status()
start = time.monotonic()
assets = client.get("/videos").json()
assets = [a for a in assets if a["synthetic"] and a["camera"] in annotation["cameras"]]
checks, latencies = [], []
checks.append(
    {"check": "dataset_source_count", "pass": len(assets) == 4, "observed": len(assets)}
)
for asset in assets:
    detail = client.get("/videos/" + asset["id"]).json()
    expected = {
        (e["type"], e["start"]) for e in annotation["expected_events_per_source"]
    }
    actual = {(e["type"], e["start"]) for e in detail["events"]}
    checks.append(
        {
            "check": "event_timestamps",
            "camera": asset["camera"],
            "pass": expected == actual,
        }
    )
    checks.append(
        {
            "check": "frame_manifest",
            "camera": asset["camera"],
            "pass": [f["timestamp"] for f in detail["frames"]]
            == annotation["sampled_timestamps"],
        }
    )
    checks.append(
        {
            "check": "fixture_provenance",
            "camera": asset["camera"],
            "pass": all(
                e["provenance"] == "fixture_annotation" for e in detail["events"]
            ),
        }
    )
    latencies.append(
        {
            "camera": asset["camera"],
            "processing_ms": detail["job"]["elapsed_ms"],
            "sampled_frames": len(detail["frames"]),
            "duration_seconds": asset["duration"],
        }
    )
for camera in annotation["cameras"]:
    result = client.get(
        "/events", params={"q": "restricted zone", "camera": camera}
    ).json()
    checks.append(
        {
            "check": "zone_retrieval",
            "camera": camera,
            "pass": result["total"] == 1 and result["items"][0]["start"] == 8,
        }
    )
empty = client.get("/events", params={"q": "flying unicorn"}).json()
checks.append({"check": "irrelevant_query", "pass": empty["total"] == 0})
cases = client.get("/cases").json()
if cases:
    result = client.post(
        f"/cases/{cases[0]['id']}/assistant",
        json={"question": annotation["ambiguity"]["question"]},
    ).json()
    checks.append(
        {
            "check": "ambiguous_identity",
            "pass": not result["claims"]
            and "Insufficient evidence" in result["uncertainty"],
        }
    )
valid = client.get("/audit/verify").json()
checks.append({"check": "audit_chain", "pass": valid["valid"]})
report = {
    "dataset_version": annotation["version"],
    "sources": len(assets),
    "footage_seconds": sum(a["duration"] for a in assets),
    "passed": sum(c["pass"] for c in checks),
    "failed": sum(not c["pass"] for c in checks),
    "checks": checks,
    "processing": latencies,
    "evaluation_elapsed_ms": int((time.monotonic() - start) * 1000),
    "model_inference": "NOT RUN; no external provider called",
    "provider_spend_usd": 0,
    "limitations": annotation["limitations"],
}
(root / "docs/evaluation-results.json").write_text(
    json.dumps(report, indent=2), encoding="utf-8"
)
print(
    f"Fixture evaluation: {report['passed']} passed, {report['failed']} failed; {len(assets)} sources / {report['footage_seconds']}s. No Meta metrics measured."
)
raise SystemExit(1 if report["failed"] else 0)
