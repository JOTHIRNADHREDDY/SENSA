"""Check that the static reviewer serves approved evidence and rejects writes."""

import hashlib
import json
import sys
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
origin = sys.argv[1].rstrip("/")
for name in (
    "/",
    "/demo/review.js",
    "/demo/review.css",
    "/reports/SENSA_Hackathon_Report_FINAL.json",
    "/reports/SENSA_Hackathon_Investigation_Summary_FINAL.pdf",
    "/reports/SENSA_Hackathon_Technical_Evidence_Appendix_FINAL.pdf",
    "/demo/evidence/frame-1.png",
    "/demo/sources/synthetic-camera-1.mp4",
):
    with urlopen(origin + name, timeout=15) as response:
        content = response.read()
        assert response.status == 200
        if name.startswith(("/reports/", "/demo/evidence/", "/demo/sources/")):
            assert (
                hashlib.sha256(content).digest()
                == hashlib.sha256((ROOT / name.lstrip("/")).read_bytes()).digest()
            )
        if name.endswith(".json"):
            assert json.loads(content)["version"] == 8
for path, method, expected in (
    ("/api/health", "GET", 404),
    ("/.env", "GET", 404),
    ("/demo/videos/parking-lot.webm", "GET", 404),
    ("/", "POST", 405),
):
    try:
        urlopen(Request(origin + path, method=method), timeout=10)
        raise AssertionError("Reviewer allowed an unexpected request")
    except HTTPError as error:
        assert error.code == expected, (path, method, error.code)
with urlopen(
    Request(
        origin + "/demo/sources/synthetic-camera-1.mp4", headers={"Range": "bytes=0-31"}
    )
) as response:
    assert response.status == 206 and len(response.read()) == 32
print(
    "PASS reviewer HTTP evidence hashes, video ranges, private-path isolation and denied writes"
)
