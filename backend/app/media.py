import hashlib
import re
import subprocess
from pathlib import Path

import imageio_ffmpeg

from . import config


class MediaError(Exception):
    pass


def ffmpeg(args, timeout=45, protocols="file,pipe"):
    try:
        proc = subprocess.run(
            [
                imageio_ffmpeg.get_ffmpeg_exe(),
                "-hide_banner",
                "-nostdin",
                "-threads",
                "1",
                "-protocol_whitelist",
                protocols,
                *args,
            ],
            capture_output=True,
            timeout=timeout,
        )
    except subprocess.TimeoutExpired as exc:
        raise MediaError("Video processing exceeded the time budget") from exc
    return proc


def probe(path):
    with open(path, "rb") as f:
        header = f.read(32)
    if not (header[4:8] == b"ftyp" or header[:4] == b"\x1aE\xdf\xa3"):
        raise MediaError("File signature does not match MP4 or WebM video")
    res = ffmpeg(["-protocol_whitelist", "file,pipe", "-i", str(path)], timeout=12)
    info = res.stderr.decode(errors="replace")
    duration = re.search(r"Duration: (\d+):(\d+):(\d+\.\d+)", info)
    video = re.search(r"Video: (\w+).*? (\d{2,5})x(\d{2,5}).*? (\d+(?:\.\d+)?) fps", info)
    if not duration or not video:
        raise MediaError("Unable to read video metadata; recording may be corrupt")
    seconds = int(duration[1]) * 3600 + int(duration[2]) * 60 + float(duration[3])
    codec, w, h, fps = video[1], int(video[2]), int(video[3]), float(video[4])
    if not 0 < seconds <= config.MAX_DURATION:
        raise MediaError(f"Recording must be between 0 and {config.MAX_DURATION} seconds")
    if w * h > 3840 * 2160 or max(w, h) > 4096 or fps > 120 or seconds * fps > 1728000:
        raise MediaError("Recording exceeds resolution or frame budget (maximum 4K / 1,728,000 frames)")
    if codec not in {"h264", "hevc", "mpeg4", "vp8", "vp9", "av1"}:
        raise MediaError("Unsupported video codec")
    return {"duration": seconds, "width": w, "height": h, "fps": fps, "codec": codec}


def sha256(path):
    digest = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def sample(path: Path, target: Path, interval=2, duration=None, fps=30):
    target.mkdir(exist_ok=True, parents=True)
    if duration and duration > 600:
        manifest = []
        for i in range(config.MAX_FRAMES):
            wanted = i * max(0, duration - 1 / fps) / max(1, config.MAX_FRAMES - 1)
            filename = f"frame-{i + 1:04d}.jpg"
            result = ffmpeg(
                [
                    "-ss",
                    str(wanted),
                    "-copyts",
                    "-start_at_zero",
                    "-i",
                    str(path),
                    "-vf",
                    "scale=w='min(960,iw)':h=-2,showinfo",
                    "-frames:v",
                    "1",
                    "-y",
                    str(target / filename),
                ],
                timeout=30,
            )
            times = re.findall(r"pts_time:([\d.e+-]+)", result.stderr.decode(errors="replace"))
            if result.returncode or not times or not (target / filename).exists():
                raise MediaError("Long-source sampling failed; source preserved")
            manifest.append((filename, float(times[0])))
        return manifest
    # showinfo records the selected ORIGINAL presentation timestamps, not invented sample offsets.
    filters = rf"select=isnan(prev_selected_t)+gte(t-prev_selected_t\,{interval}),scale=w='min(960,iw)':h=-2,showinfo"
    result = ffmpeg(
        [
            "-protocol_whitelist",
            "file,pipe",
            "-i",
            str(path),
            "-vf",
            filters,
            "-fps_mode",
            "vfr",
            "-frames:v",
            str(config.MAX_FRAMES),
            "-q:v",
            "3",
            "-y",
            str(target / "frame-%04d.jpg"),
        ]
    )
    if result.returncode:
        raise MediaError("Frame decoding failed; try a supported H.264 MP4 recording")
    times = re.findall(r"\bn:\s*\d+\s+pts:.*?pts_time:([\d.e+-]+)", result.stderr.decode(errors="replace"))
    files = sorted(target.glob("frame-*.jpg"))
    if not files or len(times) < len(files):
        raise MediaError("Could not build a reliable frame/time manifest")
    return [(f.name, float(t)) for f, t in zip(files, times)]


def analysis_clip(folder: Path):
    path = folder / "analysis.mp4"
    result = ffmpeg(
        [
            "-framerate",
            "0.5",
            "-i",
            str(folder / "frame-%04d.jpg"),
            "-an",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            "-y",
            str(path),
        ]
    )
    if result.returncode:
        raise MediaError("Could not encode the bounded analysis proxy")
    return path
