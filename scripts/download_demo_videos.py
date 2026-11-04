"""Fetch the reviewed Wikimedia candidate locally. Restricted datasets require manual access."""

import argparse
import hashlib
import json
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "demo/video_manifest.json"
MAX_BYTES = 100 * 1024 * 1024


def download(source, destination, acknowledge_caveat, opener=urlopen):
    if source["access"] != "download_with_caveat_acknowledgment":
        raise ValueError(
            "Manual permission required. Follow the source page; automatic download is disabled."
        )
    if not acknowledge_caveat:
        raise ValueError(
            "Read the Commons jurisdictional caveat and supply --acknowledge-caveat."
        )
    url = source["download_url"]
    if (
        urlsplit(url).scheme != "https"
        or urlsplit(url).hostname != "upload.wikimedia.org"
    ):
        raise ValueError("Only the reviewed Wikimedia host is allowed.")
    if Path(source["filename"]).name != source["filename"]:
        raise ValueError("Invalid manifest filename")
    destination.mkdir(parents=True, exist_ok=True)
    target = destination / source["filename"]
    if target.exists():
        digest = hashlib.sha256(target.read_bytes()).hexdigest()
        if not source.get("sha256") or digest != source["sha256"]:
            raise ValueError(
                "Existing file has no matching approved manifest hash. Preserve it and investigate."
            )
        return {"sha256": digest, "size_bytes": target.stat().st_size}
    partial = target.with_suffix(target.suffix + ".part")
    if partial.exists():
        raise ValueError(
            "A partial download already exists. Inspect it before retrying."
        )
    digest = hashlib.sha256()
    total = 0
    request = Request(url, headers={"User-Agent": "SENSA-local-video-evaluation/1.0"})
    with opener(request, timeout=120) as response:
        if urlsplit(response.geturl()).hostname != "upload.wikimedia.org":
            raise ValueError("Unexpected download redirect")
        if "video/" not in response.headers.get("Content-Type", ""):
            raise ValueError("The source did not return a video")
        announced = response.headers.get("Content-Length")
        if announced and int(announced) > MAX_BYTES:
            raise ValueError("Video exceeds the local download budget")
        with partial.open("xb") as file:
            while chunk := response.read(1024 * 1024):
                total += len(chunk)
                if total > MAX_BYTES:
                    raise ValueError("Video exceeded the local download budget")
                digest.update(chunk)
                file.write(chunk)
        if announced and total != int(announced):
            raise ValueError("Incomplete video download")
    checksum = digest.hexdigest()
    if source.get("sha256") and checksum != source["sha256"]:
        raise ValueError(
            "Source hash changed. The unaccepted bytes remain in the partial file."
        )
    if source.get("size_bytes") and total != source["size_bytes"]:
        raise ValueError("Source byte size differs from the reviewed manifest")
    partial.rename(target)
    return {"sha256": checksum, "size_bytes": total}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", default="parking-lot")
    parser.add_argument("--acknowledge-caveat", action="store_true")
    parser.add_argument(
        "--record-manifest",
        action="store_true",
        help="Fill previously unknown verified file metadata",
    )
    args = parser.parse_args()
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    source = next(
        (row for row in manifest["sources"] if row["id"] == args.source), None
    )
    if not source:
        parser.error("Source is absent from the reviewed manifest")
    try:
        receipt = download(source, ROOT / "demo/videos", args.acknowledge_caveat)
    except (ValueError, OSError) as error:
        parser.exit(1, f"Download unavailable: {error}\n")
    if args.record_manifest:
        source.update(receipt)
        MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"source": args.source, **receipt}))


if __name__ == "__main__":
    main()
