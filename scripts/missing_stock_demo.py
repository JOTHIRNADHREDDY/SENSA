"""Generate clearly labelled, deterministic animation for a known-outcome investigation test.

The private ground-truth sidecar is never supplied to the vision models. No real people appear.
"""

import json
import math
import subprocess
import hashlib
from pathlib import Path
import imageio_ffmpeg
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]


def sha256(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def render(t, camera):
    im = Image.new("RGB", (960, 540), "#a9adb0")
    d = ImageDraw.Draw(im)
    d.rectangle((0, 0, 960, 350), fill="#d0d1ca")
    d.rectangle((0, 350, 960, 540), fill="#929895")
    for y in range(365, 540, 40):
        d.line((0, y, 960, y), fill="#777f7c", width=2)
    try:
        font = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", 18)
    except OSError:
        try:
            font = ImageFont.truetype("DejaVuSans-Bold.ttf", 18)
        except OSError:
            font = ImageFont.load_default(size=18)
    d.rectangle((12, 10, 948, 44), fill="#18251e")
    d.text(
        (24, 16),
        "SYNTHETIC ANIMATION / CONTROLLED SENSA TEST / NO REAL PEOPLE",
        fill="white",
        font=font,
    )
    if camera == 0:
        for x in [75, 500]:
            d.rectangle((x, 125, x + 12, 430), fill="#334b5b")
        for y in [220, 330, 425]:
            d.rectangle((75, y, 512, y + 12), fill="#b35c2e")
        for i, (x, y) in enumerate(
            [(100, 145), (245, 145), (390, 145), (100, 250), (245, 250)]
        ):
            box(d, x, y)
        px = 1050 - (t / 7) * 470 if t < 7 else 580 if t < 10 else 580 + (t - 10) * 75
        visible = 0 <= px <= 1030
        moving = t >= 9
        bx, by = (390, 250) if not moving else (px - 100, 295)
        box(d, bx, by)
        if visible and t < 18:
            person(d, px, 260, (bx + 45, by + 30) if 7 <= t < 18 else None)
    else:
        d.rectangle((630, 175, 950, 350), fill="#596961")
        d.text((690, 200), "LOADING BAY", font=font, fill="white")
        px = -90 + (t - 1) * 125
        if 1 <= t <= 9:
            box(d, px - 80, 295)
            person(d, px, 260, (px - 35, 325))
    d.text(
        (20, 508),
        f"SYNTHETIC CAMERA {camera + 1} / playback {t:05.2f}s",
        font=font,
        fill="#101714",
    )
    return im


def box(d, x, y):
    d.rectangle((x, y, x + 90, y + 70), fill="#b5814a", outline="#684620", width=3)
    d.line((x + 45, y, x + 45, y + 70), fill="#e5cfa0", width=8)
    d.rectangle((x + 8, y + 16, x + 31, y + 37), fill="#ece5cd")


def person(d, x, y, target):
    # A simple drawn actor, with no facial features or biometric identity.
    d.ellipse(
        (x - 22, y - 63, x + 22, y - 17), fill="#bc9a7f", outline="#3e3933", width=2
    )
    d.rounded_rectangle(
        (x - 35, y - 18, x + 35, y + 90),
        radius=10,
        fill="#304f92",
        outline="#182b58",
        width=3,
    )
    stride = math.sin(x / 35) * 10
    d.line((x - 15, y + 85, x - 20 - stride, y + 192), fill="#253238", width=22)
    d.line((x + 16, y + 85, x + 20 + stride, y + 192), fill="#253238", width=22)
    if target:
        d.line((x - 27, y + 10, *target), fill="#304f92", width=15)
        d.ellipse(
            (target[0] - 6, target[1] - 6, target[0] + 6, target[1] + 6), fill="#bc9a7f"
        )
    else:
        d.line((x - 29, y + 10, x - 38, y + 94), fill="#304f92", width=15)
    d.line((x + 29, y + 8, x + 40, y + 94), fill="#304f92", width=15)


def generate(folder):
    folder.mkdir(parents=True, exist_ok=True)
    manifest = []
    for camera, duration in [(0, 20), (1, 12)]:
        path = folder / f"synthetic-camera-{camera + 1}.mp4"
        command = [
            imageio_ffmpeg.get_ffmpeg_exe(),
            "-loglevel",
            "error",
            "-y",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "rgb24",
            "-s",
            "960x540",
            "-r",
            "10",
            "-i",
            "pipe:0",
            "-an",
            "-c:v",
            "libx264",
            "-preset",
            "fast",
            "-threads",
            "1",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            str(path),
        ]
        process = subprocess.Popen(command, stdin=subprocess.PIPE)
        for n in range(duration * 10):
            process.stdin.write(render(n / 10, camera).tobytes())
        process.stdin.close()
        assert process.wait() == 0
        manifest.append(
            {
                "path": str(path.resolve()),
                "sha256": sha256(path),
                "synthetic": True,
                "camera": camera + 1,
                "duration": duration,
                "clock_start": f"2026-11-02T00:00:{18 if camera else 0:02}+00:00",
            }
        )
    (folder / "ground-truth.json").write_text(
        json.dumps(
            {
                "synthetic": True,
                "policy": "Controlled rendering truth, not a real theft or human identity. Never sent to models.",
                "sources": manifest,
                "reference_events": [
                    {
                        "camera": 1,
                        "start": 9,
                        "end": 18,
                        "action": "Rendered box moves with actor from shelf area toward right frame boundary",
                    },
                    {
                        "camera": 2,
                        "start": 1,
                        "end": 9,
                        "action": "Rendered actor and box cross loading-bay view",
                    },
                ],
            },
            indent=2,
        )
    )
    print(
        "Created two explicitly synthetic sources and a separate ground-truth manifest."
    )


if __name__ == "__main__":
    generate(ROOT / "data/completion/synthetic-positive")
