"""Copy the approved reviewer assets into a fresh static hosting directory."""

import argparse
from pathlib import Path
from shutil import copyfile

ROOT = Path(__file__).resolve().parents[1]
FILES = {
    "demo/index.html": "index.html",
    **{
        name: name
        for name in (
            "demo/review.js",
            "demo/review.css",
            "demo/walkthrough.mp4",
            "demo/sources/synthetic-camera-1.mp4",
            "demo/sources/synthetic-camera-2.mp4",
            "demo/evidence/frame-1.png",
            "demo/evidence/frame-2.png",
            "demo/evidence/frame-3.png",
            "demo/evidence/frame-4.png",
            "reports/SENSA_Hackathon_Investigation_Summary_FINAL.pdf",
            "reports/SENSA_Hackathon_Technical_Evidence_Appendix_FINAL.pdf",
            "reports/SENSA_Hackathon_Report_FINAL.json",
            "reports/SHA256SUMS.txt",
            "reports/THIRD_PARTY_NOTICES.txt",
        )
    },
}
HEADERS = """/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; media-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'
"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "output/reviewer-static")
    output = parser.parse_args().output
    if output.exists():
        parser.error(
            "Use a new output directory to avoid serving stale or private files."
        )
    for name in FILES:
        if not (ROOT / name).is_file():
            parser.error(f"Required asset missing: {name}")
    output.mkdir(parents=True)
    for source, destination in FILES.items():
        target = output / destination
        target.parent.mkdir(parents=True, exist_ok=True)
        copyfile(ROOT / source, target)
    (output / "_headers").write_text(HEADERS, encoding="utf-8")
    # Cloudflare Pages uses the presence of this file to avoid SPA fallback for unknown paths.
    (output / "404.html").write_text(
        "<!doctype html><title>Not found</title><h1>Not found</h1>\n", encoding="utf-8"
    )
    print(f"Static reviewer ready in {output}")


if __name__ == "__main__":
    main()
