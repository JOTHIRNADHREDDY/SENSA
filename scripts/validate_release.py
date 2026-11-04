"""Verify the approved portable evidence without access to the private workspace."""

import hashlib
import re
import sys
from pathlib import Path

from PIL import Image
from pydantic import BaseModel, ConfigDict
from pypdf import PdfReader

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from app.portable_observations import observation_ids, validate_observation_links  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]


class PortableReport(BaseModel):
    model_config = ConfigDict(strict=True)
    id: str
    case_id: str
    version: int
    status: str
    reviewed: str | None
    content: dict
    evidence_manifest: dict


def main():
    folder = ROOT / "reports"
    for line in (folder / "SHA256SUMS.txt").read_text().splitlines():
        digest, name = line.split(None, 1)
        assert Path(name).name == name
        assert hashlib.sha256((folder / name).read_bytes()).hexdigest() == digest
    data = PortableReport.model_validate_json(
        (folder / "SENSA_Hackathon_Report_FINAL.json").read_bytes()
    )
    content, manifest = data.content, data.evidence_manifest
    assert data.id == manifest["report_id"] == "45c9e337-8fef-4e49-9588-ccb8561c07c0"
    assert data.case_id == manifest["case_id"] == "d2d7067b-7d93-4fd4-8d2d-590a4fc27515"
    assert data.version == manifest["report_version"] == 8
    assert data.status == "draft" and data.reviewed is None
    assert content["human_conclusion"] == "" and not content["human_reviews"]
    validate_observation_links(content)
    observations = {row["id"]: row for row in content["observations"]}
    assert len(observations) == len(content["observations"]) == 442
    assert (
        set(observations)
        == observation_ids(content)
        == set(manifest["observation_ids"])
    )
    assert not manifest["unavailable_observation_ids"]
    models = {row["id"]: row for row in content["models"]}
    sources = {row["asset_id"]: row for row in manifest["sources"]}
    for row in observations.values():
        ref = row["source_frame"]
        source = sources[row["asset_id"]]
        assert (
            ref["source_id"] == source["source_id"]
            and ref["source_sha256"] == source["source_sha256"]
        )
        assert ref["artifact_id"] and ref["frame_sha256"]
        assert all(
            models[row["run_id"]][key] == value
            for key, value in row["model_provenance"].items()
        )
    episodes = {row["id"]: row for row in content["event_episodes"]}
    assert len(episodes) == len(content["event_episodes"]) == 13
    assert set(episodes) == set(manifest["episode_ids"])
    referenced = set()
    for node in episodes.values():
        row = node["data"]
        frames = {frame["frame_id"]: frame for frame in node["source_frames"]}
        for id_ in row["observation_ids"]:
            observation = observations[id_]
            assert observation["frame_id"] in row["frame_ids"]
            assert observation["source_frame"] == frames[observation["frame_id"]]
            assert observation["asset_id"] == row["asset_id"]
            assert observation["source_frame"]["source_id"] == row["source_id"]
            referenced.add(id_)
    assert len(referenced) == 94
    expected_hashes = (
        "61ec178720af554f88b7fb23cbc40570cd338e6dfae663f275ddac4bbd2bba50",
        "2cbf7b7af071167217d92092f12d27edf497eb393b5f22e85d097c99d4e9ad63",
    )
    for index, source in enumerate(manifest["sources"], 1):
        assert (
            source["synthetic"] is True
            and source["clock_status"] == "VERIFIED_FOR_FIXTURE"
        )
        assert source["source_sha256"] == expected_hashes[index - 1]
        assert (
            hashlib.sha256(
                (ROOT / f"demo/sources/synthetic-camera-{index}.mp4").read_bytes()
            ).hexdigest()
            == source["source_sha256"]
        )
    comparison = manifest["comparison"]
    assert manifest["comparison_id"] == "0d534630-98f1-4a94-b560-de961289f9e0"
    assert comparison["roi"] == [0.075, 0.22, 0.54, 0.82]
    assert (
        comparison["state"] == "UNRESOLVED" and comparison["confirmed_removal"] is False
    )
    assert comparison["visual_detection_delta"] == comparison["inventory_delta"] == -1
    assert (comparison["before"]["timestamp"], comparison["after"]["timestamp"]) == (
        4.0,
        18.1,
    )
    assert (comparison["before"]["count"], comparison["after"]["count"]) == (6, 5)
    assert "no real stock ledger" in comparison["inventory_reference"]
    images = manifest["images"]
    assert len(images) == 4
    for i, ref in enumerate(images, 1):
        file = ROOT / f"demo/evidence/frame-{i}.png"
        assert hashlib.sha256(file.read_bytes()).hexdigest() == ref["frame_sha256"]
        with Image.open(file) as image:
            assert (
                hashlib.sha256(image.convert("RGB").tobytes()).hexdigest()
                == ref["rgb_sha256"]
            )
    for kind, label, count in (
        ("summary", "Investigation_Summary", 5),
        ("appendix", "Technical_Evidence_Appendix", 48),
    ):
        pdf = PdfReader(folder / f"SENSA_Hackathon_{label}_FINAL.pdf")
        assert len(pdf.pages) == count
        text = "\n".join(page.extract_text() for page in pdf.pages)
        compact = re.sub(r"\s+", "", text)
        assert all(len(page.extract_text().strip()) > 130 for page in pdf.pages)
        assert not re.search(
            r"localhost|127\.0\.0\.1|https?://|[A-Za-z]:[\\/]", text, re.I
        )
        for key in ("report_id", "case_id", "snapshot_sha256", "comparison_id"):
            assert manifest[key] in compact
        assert "Snapshotv8" in compact and "Confirmedremoval=false" in compact
        assert "Visibledetections6to5|detectiondelta-1" in compact
        assert "Syntheticinventoryreferencedelta-1" in compact
        assert "4.000sto18.100s|UNRESOLVED" in compact
        if kind == "appendix":
            assert all(
                id_ in compact
                for id_ in set(episodes) | set(observations) | set(models)
            )
        objects = [image for page in pdf.pages for image in page.images]
        assert len(objects) == 4
        for ref, obj in zip(images, objects, strict=True):
            assert (
                hashlib.sha256(obj.image.convert("RGB").tobytes()).hexdigest()
                == ref["rgb_sha256"]
            )
            assert all(
                ref[key] in compact
                for key in ("frame_id", "artifact_id", "frame_sha256")
            )
        assert not any(
            annotation.get_object().get("/Subtype") == "/Link"
            for page in pdf.pages
            for annotation in page.get("/Annots", [])
        )
        print(f"PASS {kind}: {count} pages, 4 exact images, 0 links")
    print(
        "PASS v8 identity, 442 detections, 13 episodes, 94 episode support IDs, original hashes and unresolved state"
    )


if __name__ == "__main__":
    main()
