"""Procedural synthetic footage + exact animation annotations. No learned perception."""

import json
import math
import random
import subprocess
from pathlib import Path

import imageio_ffmpeg
from PIL import Image, ImageDraw, ImageEnhance, ImageFont

CAMERAS = ["Loading dock", "Storage aisle A", "Packing floor", "East exit"]
W, H, FPS, DURATION = 960, 540, 10, 12


def font(size):
    for path in ("C:/Windows/Fonts/consola.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"):
        if Path(path).exists():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default(size=size)


def person_box(t, variant=0):
    if not 2 <= t <= 10:
        return None
    x = 0.31 + (t - 2) * 0.045
    return [x, 0.52 + variant * 0.008, x + 0.038, 0.68 + variant * 0.008]


def background(variant):
    rng = random.Random(100 + variant)
    im = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(im)
    for y in range(H):
        c = int(64 + y * 0.095)
        d.line((0, y, W, y), fill=(c - 9, c, c + 1))
    van = (495 + variant * 25, 205)
    d.polygon([(0, 100), van, (0, 370)], fill="#656e6d")
    d.polygon([(W, 90), van, (W, 365)], fill="#69716e")
    d.polygon([(0, 375), van, (W, 365), (W, H), (0, H)], fill="#8b9189")
    for x in range(-900, 1900, 180):
        d.line([van, (x, H)], fill="#747b76", width=1)
    for y in [240, 270, 310, 365, 440, 535]:
        d.line((0, y, W, y), fill="#777f78", width=1)
    for i in range(7):
        depth = i / 7
        y = int(20 + depth * 175)
        d.line((0, y, van[0], 205, W, y), fill="#353f3f", width=max(2, 9 - i))
        d.line((130, y + 7, van[0], 205, 820, y + 7), fill="#a9b4ad", width=2)
    for x in [160, 380, 630, 860]:
        d.line((x, 0, van[0], 205), fill="#404d4d", width=4)
    for i in range(4):
        yy = 52 + i * 37
        ww = int(145 / (1 + i * 0.5))
        d.rounded_rectangle((van[0] - ww // 2, yy, van[0] + ww // 2, yy + 5), radius=2, fill="#e6eee0")

    def rack(x0, y0, x1, y1, levels=3):
        d.rectangle((x0, y0, x1, y1), fill="#354c54")
        step = (y1 - y0) / levels
        for level in range(levels):
            yy = y0 + level * step
            for j in range(4):
                bx = x0 + 5 + j * (x1 - x0 - 10) / 4
                bw = (x1 - x0 - 15) / 4
                bh = step * rng.uniform(0.55, 0.85)
                color = rng.choice(["#a78b66", "#b39a77", "#b7a188", "#8a795e", "#cfb58e"])
                d.rectangle((bx, yy + step - bh, bx + bw, yy + step - 8), fill=color, outline="#746a55", width=1)
                d.line((bx + bw * 0.52, yy + step - bh, bx + bw * 0.52, yy + step - 8), fill="#d6c3a3", width=2)
                if bw > 28:
                    d.rectangle((bx + 8, yy + step - bh + 10, bx + 21, yy + step - bh + 17), fill="#c8c9b5")
            d.rectangle((x0, yy + step - 8, x1, yy + step), fill="#b46c3f")
        for xx in [x0, x1 - 6]:
            d.rectangle((xx, y0 - 8, xx + 6, y1 + 7), fill="#3a6578")
            for yy in range(int(y0), int(y1), 16):
                d.rectangle((xx + 2, yy, xx + 3, yy + 5), fill="#28404b")

    if variant in (0, 1):
        for i in range(4):
            scale = 1 - i * 0.19
            xx = int(i * 92)
            rack(xx - 55, int(100 + i * 25), xx + int(220 * scale), int(470 - i * 59))
            xx2 = 820 - i * 67
            rack(xx2, int(85 + i * 29), xx2 + int(235 * scale), int(480 - i * 62))
        d.line((370, H, van[0] - 35, 270), fill="#c7b878", width=4)
        d.line((760, H, van[0] + 45, 270), fill="#c7b878", width=4)
    elif variant == 2:
        for i, (x, y) in enumerate([(35, 280), (260, 260), (630, 270), (755, 365)]):
            rack(x, y - 100, x + 165, y + 70, 2)
        for x, y in [(130, 420), (480, 355), (590, 460)]:
            d.polygon(
                [(x, y), (x + 135, y - 25), (x + 210, y + 15), (x + 70, y + 42)],
                fill="#acb6ac",
                outline="#d1d6c7",
                width=2,
            )
            for xx in [x + 15, x + 180]:
                d.line((xx, y + 20, xx, y + 85), fill="#455655", width=7)
            d.rectangle((x + 65, y - 45, x + 105, y + 4), fill="#b99b74")
    else:
        for x in [100, 370, 655]:
            d.rectangle((x, 150, x + 185, 370), fill="#3b4b4b", outline="#7b8581", width=8)
            for y in range(158, 365, 13):
                d.line((x + 8, y, x + 177, y), fill="#52615e", width=2)
            d.rectangle((x + 45, 125, x + 140, 142), fill="#357c68")
            d.text((x + 57, 125), "EXIT", font=font(13), fill="#cfebd7")
        d.line((20, 470, 930, 470), fill="#c8b874", width=5)
        for x in range(0, W, 50):
            d.line((x, 475, x + 30, H), fill="#555e51", width=14)
    # Pallet and industrial cart.
    x, y = 135 + variant * 120, 425
    d.ellipse((x - 18, y + 20, x + 150, y + 50), fill="#626e64")
    for yy in [y + 15, y + 25]:
        d.polygon([(x, yy), (x + 92, yy - 15), (x + 136, yy + 5), (x + 42, yy + 25)], fill="#867353", outline="#575c4c")
    for i in range(2):
        d.rectangle((x + 28 + i * 45, y - 55, x + 69 + i * 45, y + 15), fill="#b8a17c", outline="#726a53", width=2)
    # Subtle deterministic sensor texture.
    texture = Image.frombytes("L", (W, H), rng.randbytes(W * H)).convert("RGB")
    return Image.blend(ImageEnhance.Brightness(im).enhance(0.85), texture, 0.025)


def render(base, t, variant):
    im = base.copy()
    d = ImageDraw.Draw(im)
    box = person_box(t, variant)
    if box:
        x1, y1, x2, y2 = [v * (W if i % 2 == 0 else H) for i, v in enumerate(box)]
        mid = (x1 + x2) / 2
        d.ellipse((x1 - 10, y2 - 4, x2 + 15, y2 + 8), fill="#4b5852")
        d.line((mid - 4, y1 + 48, mid - 9, y2), fill="#303d44", width=8)
        d.line((mid + 5, y1 + 48, mid + 12, y2 - 2 + math.sin(t * 6) * 4), fill="#35424a", width=8)
        d.polygon([(mid - 12, y1 + 23), (mid + 12, y1 + 23), (mid + 14, y1 + 58), (mid - 14, y1 + 58)], fill="#bbbd68")
        d.line((mid - 8, y1 + 25, mid - 8, y1 + 54), fill="#e9ddba", width=3)
        d.line((mid + 8, y1 + 25, mid + 8, y1 + 54), fill="#e9ddba", width=3)
        d.ellipse((mid - 8, y1 + 5, mid + 8, y1 + 22), fill="#b89f80")
        d.pieslice((mid - 12, y1, mid + 12, y1 + 18), 180, 360, fill="#dfc17a")
        d.line((mid - 12, y1 + 9, mid + 13, y1 + 9), fill="#d7b866", width=3)
    d.rectangle((18, 18, 322, 50), fill="#263632")
    d.text((29, 25), f"CAM 0{variant + 1}  /  {CAMERAS[variant].upper()}", font=font(14), fill="#dfebe1")
    d.text((W - 163, 26), f"00:00:{int(t):02d}.{int(t % 1 * 10)}", font=font(16), fill="#e1e9dd")
    d.text((23, H - 29), "SYNTHETIC FOOTAGE / SENSA FIXTURE", font=font(13), fill="#d9ddbe")
    return im


def generate(folder: Path, variant):
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / "original.mp4"
    base = background(variant)
    proc = subprocess.Popen(
        [
            imageio_ffmpeg.get_ffmpeg_exe(),
            "-loglevel",
            "error",
            "-y",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "rgb24",
            "-s",
            f"{W}x{H}",
            "-r",
            str(FPS),
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
        ],
        stdin=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    try:
        for i in range(DURATION * FPS):
            proc.stdin.write(render(base, i / FPS, variant).tobytes())
        proc.stdin.close()
        proc.wait(timeout=30)
        if proc.returncode:
            raise RuntimeError("Synthetic video encoder failed")
    finally:
        if proc.poll() is None:
            proc.kill()
    from .media import sha256

    (folder / "fixture.json").write_text(
        json.dumps(
            {
                "schema": "warehouse-animation-v1",
                "sha256": sha256(path),
                "variant": variant,
                "license": "CC0-1.0; procedural synthetic footage, no people recorded",
                "events": "Person trajectory generated by person_box; restricted zone begins at x=0.55",
            }
        )
    )
    return path
