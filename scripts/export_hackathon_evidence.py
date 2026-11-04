"""Export a saved SENSA report locally without starting the API or calling models."""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from app.db import DB, Report  # noqa: E402
from app.media import sha256  # noqa: E402
from app.portable_report import build_pdf, portable_snapshot, prepare  # noqa: E402


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("report_id")
    parser.add_argument("output", type=Path)
    parser.add_argument(
        "--final", action="store_true", help="Use the final submission filenames"
    )
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    with DB() as db:
        report = db.get(Report, args.report_id)
        if not report:
            parser.error("Report not found in this workspace")
        evidence = prepare(db, report)
        snapshot = portable_snapshot(report, evidence)
        for kind, label in (
            ("summary", "Investigation_Summary"),
            ("appendix", "Technical_Evidence_Appendix"),
        ):
            suffix = "_FINAL" if args.final else ""
            path = args.output / f"SENSA_Hackathon_{label}{suffix}.pdf"
            path.write_bytes(build_pdf(report, evidence, kind))
            path.with_suffix(".pdf.sha256").write_text(
                f"{sha256(path)}  {path.name}\n", encoding="ascii"
            )
        payload = snapshot["evidence_manifest"]
    if args.final:
        (args.output / "SENSA_Hackathon_Report_FINAL.json").write_text(
            json.dumps(snapshot, indent=2), encoding="utf-8"
        )
    (args.output / "SENSA_Hackathon_Evidence_Manifest.json").write_text(
        json.dumps(payload, indent=2), encoding="utf-8"
    )
    print(
        f"Exported snapshot v{payload['report_version']} with {sum(r['embedding_status'] == 'embedded' for r in payload['images'])} verified images"
    )


if __name__ == "__main__":
    main()
