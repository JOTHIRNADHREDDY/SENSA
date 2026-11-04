import hashlib
import importlib.util
import io
import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("download_demo_videos", ROOT / "scripts/download_demo_videos.py")
downloader = importlib.util.module_from_spec(spec)
spec.loader.exec_module(downloader)
SOURCES = json.loads((ROOT / "demo/video_manifest.json").read_text())["sources"]


@pytest.mark.parametrize("source", [row for row in SOURCES if row["access"] == "manual_permission_required"])
def test_restricted_sources_never_request_downloads(tmp_path, source):
    def unexpected(*args, **kwargs):
        pytest.fail("Restricted source attempted a network request")

    with pytest.raises(ValueError, match="Manual permission"):
        downloader.download(source, tmp_path, True, unexpected)


def test_commons_caveat_requires_acknowledgment(tmp_path):
    with pytest.raises(ValueError, match="acknowledge-caveat"):
        downloader.download(SOURCES[0], tmp_path, False, lambda *args, **kwargs: pytest.fail("Unexpected network"))


class Response(io.BytesIO):
    def __init__(self, data, source):
        super().__init__(data)
        self.url = source["download_url"]
        self.headers = {"Content-Type": "video/webm", "Content-Length": str(len(data))}

    def geturl(self):
        return self.url


def test_download_hashes_bytes_and_reuses_only_verified_file(tmp_path):
    data = b"explicitly mocked video bytes"
    source = {**SOURCES[0], "sha256": hashlib.sha256(data).hexdigest(), "size_bytes": len(data)}
    result = downloader.download(source, tmp_path, True, lambda *args, **kwargs: Response(data, source))
    assert result == {"sha256": source["sha256"], "size_bytes": len(data)}
    assert (tmp_path / source["filename"]).read_bytes() == data
    assert (
        downloader.download(source, tmp_path, True, lambda *args, **kwargs: pytest.fail("Re-downloaded verified bytes"))
        == result
    )


def test_changed_download_is_not_promoted_or_overwritten(tmp_path):
    data = b"changed source bytes"
    source = {**SOURCES[0], "sha256": "0" * 64, "size_bytes": len(data)}
    with pytest.raises(ValueError, match="Source hash changed"):
        downloader.download(source, tmp_path, True, lambda *args, **kwargs: Response(data, source))
    target = tmp_path / source["filename"]
    assert not target.exists()
    assert target.with_suffix(".webm.part").read_bytes() == data
    target.write_bytes(b"original local evidence")
    with pytest.raises(ValueError, match="Preserve it"):
        downloader.download(source, tmp_path, True)
    assert target.read_bytes() == b"original local evidence"
