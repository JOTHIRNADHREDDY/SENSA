"""Check the exact pinned releases against PyPI's published vulnerability records."""

import concurrent.futures
import json
from pathlib import Path
from urllib.request import urlopen

root = Path(__file__).resolve().parents[1]
packages = [
    line.strip().split("==")
    for line in (root / "backend/requirements-lock.txt")
    .read_text(encoding="utf-8")
    .splitlines()
    if "==" in line
]


def check(spec):
    package, version = spec
    try:
        with urlopen(
            f"https://pypi.org/pypi/{package}/{version}/json", timeout=20
        ) as response:
            info = json.load(response)
        return {
            "package": package,
            "version": version,
            "status": "PASS" if not info.get("vulnerabilities") else "FAIL",
            "advisories": [v["id"] for v in info.get("vulnerabilities", [])],
        }
    except OSError as error:
        return {
            "package": package,
            "version": version,
            "status": "NOT RUN",
            "reason": type(error).__name__,
        }


with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
    results = list(pool.map(check, packages))
report = {
    "source": "PyPI exact-release vulnerability records; not a full supply-chain audit",
    "results": results,
}
(root / "docs/python-advisories.json").write_text(
    json.dumps(report, indent=2), encoding="utf-8"
)
for status in ["PASS", "FAIL", "NOT RUN"]:
    print(status, sum(r["status"] == status for r in results))
for result in results:
    if result["status"] != "PASS":
        print(json.dumps(result))
raise SystemExit(1 if any(r["status"] != "PASS" for r in results) else 0)
