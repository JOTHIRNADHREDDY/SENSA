"""Bounded similarity registration from spatially distributed background patches."""

from itertools import combinations
from math import atan2, degrees
from statistics import median

from PIL import Image, ImageChops, ImageStat

IDENTITY = (1, 0, 0, 0, 1, 0)


def transform_point(matrix, point):
    a, b, c, d, e, f = matrix
    x, y = point
    return a * x + b * y + c, d * x + e * y + f


def compose(left, right):
    """Apply right, then left, in normalized image coordinates."""
    a, b, c, d, e, f = left
    g, h, i, j, k, offset_y = right
    return (
        a * g + b * j,
        a * h + b * k,
        a * i + b * offset_y + c,
        d * g + e * j,
        d * h + e * k,
        d * i + e * offset_y + f,
    )


def inverse(matrix):
    a, b, c, d, e, f = matrix
    determinant = a * e - b * d
    return (
        e / determinant,
        -b / determinant,
        (b * f - e * c) / determinant,
        -d / determinant,
        a / determinant,
        (d * c - a * f) / determinant,
    )


def corners(box, matrix=IDENTITY):
    left, top, right, bottom = box
    return [transform_point(matrix, point) for point in ((left, top), (right, top), (right, bottom), (left, bottom))]


def bounds(points):
    xs, ys = zip(*points)
    return [min(xs), min(ys), max(xs), max(ys)]


def motion_matrix(motion):
    matrix = motion.get("matrix")
    if matrix is not None:
        return matrix
    offset = motion.get("offset", motion.get("translation"))
    if offset is None:
        return None
    x, y = offset
    return (1, 0, x, 0, 1, y)


def _fit(matches):
    """Least-squares uniform scale and rotation in aspect-preserving pixel coordinates."""
    sources, targets = zip(*matches)
    source_center = sum(sources) / len(sources)
    target_center = sum(targets) / len(targets)
    gain = sum((p - source_center).conjugate() * (q - target_center) for p, q in matches) / sum(
        abs(p - source_center) ** 2 for p in sources
    )
    return gain, target_center - gain * source_center


def register_similarity(before, after, excluded_before, excluded_after):
    # Patch search is bounded. Validate a single camera transform on a separate tile grid.
    if abs(before.width / before.height - after.width / after.height) > 0.01:
        return None
    before = before.convert("L")
    before.thumbnail((144, 108), Image.Resampling.BILINEAR)
    width, height = before.size
    if min(width, height) < 56:
        return None
    after = after.convert("L").resize(before.size, Image.Resampling.BILINEAR)
    radius, half = 13, 5

    def usable(box, exclusions):
        x1, y1, x2, y2 = box
        return (
            0 <= x1 < x2 <= width
            and 0 <= y1 < y2 <= height
            and not any(
                x1 < right * width and x2 > left * width and y1 < bottom * height and y2 > top * height
                for left, top, right, bottom in exclusions
            )
        )

    def error(a, b):
        return ImageStat.Stat(ImageChops.difference(a, b)).mean[0]

    matches = []
    for y in (height // 5, height // 2, 4 * height // 5):
        for x in (width // 5, 2 * width // 5, 3 * width // 5, 4 * width // 5):
            box = (x - half, y - half, x + half, y + half)
            if not usable(box, excluded_before):
                continue
            reference = before.crop(box)
            if ImageStat.Stat(reference).stddev[0] < 9:
                continue
            scores = []
            for dy in range(-radius, radius + 1):
                for dx in range(-radius, radius + 1):
                    target = (box[0] + dx, box[1] + dy, box[2] + dx, box[3] + dy)
                    if usable(target, excluded_after):
                        scores.append((error(reference, after.crop(target)), dx, dy))
            if not scores:
                continue
            residual, dx, dy = min(scores)
            second = min((score for score, i, j in scores if abs(dx - i) + abs(dy - j) > 2), default=residual)
            if residual <= 23 and second - residual >= 3 and max(abs(dx), abs(dy)) < radius:
                matches.append((complex(x, y), complex(x + dx, y + dy)))
    if len(matches) < 6:
        return None

    def inliers(gain, shift):
        return [(p, q) for p, q in matches if abs(p * gain + shift - q) <= 1.6]

    hypotheses = [_fit(pair) for pair in combinations(matches, 2) if abs(pair[0][0] - pair[1][0]) >= 24]
    if not hypotheses:
        return None
    candidates = max((inliers(*h) for h in hypotheses), key=len)
    if len(candidates) < max(6, 0.8 * len(matches)):
        return None
    gain, shift = _fit(candidates)
    support = inliers(gain, shift)
    if len(support) < max(6, 0.8 * len(matches)):
        return None
    x1, y1, x2, y2 = bounds((p.real, p.imag) for p, _ in support)
    angle = degrees(atan2(gain.imag, gain.real))
    scale = abs(gain)
    center = complex(width / 2, height / 2)
    if (
        x2 - x1 < width * 0.35
        or y2 - y1 < height * 0.35
        or abs(angle) > 6
        or not 0.93 <= scale <= 1.07
        or abs(center * gain + shift - center) > 10
        or (abs(angle) < 1.8 and abs(scale - 1) < 0.025)
    ):
        return None

    pixel_matrix = (gain.real, -gain.imag, shift.real, gain.imag, gain.real, shift.imag)
    aligned = after.transform(before.size, Image.Transform.AFFINE, pixel_matrix, Image.Resampling.BILINEAR)
    # The constant offset comparator uses the same matched regions and resampling.
    tx, ty = (median((q - p).real for p, q in support), median((q - p).imag for p, q in support))
    translated = after.transform(before.size, Image.Transform.AFFINE, (1, 0, tx, 0, 1, ty), Image.Resampling.BILINEAR)
    verified = []
    for y in (height // 3, 2 * height // 3):
        for x in (width // 8, width // 3, width // 2, 2 * width // 3, 7 * width // 8):
            box = (x - half, y - half, x + half, y + half)
            target = bounds(corners(box, pixel_matrix))
            translated_box = (box[0] + tx, box[1] + ty, box[2] + tx, box[3] + ty)
            if usable(box, excluded_before) and all(
                usable(region, excluded_after) for region in (target, translated_box)
            ):
                reference = before.crop(box)
                if ImageStat.Stat(reference).stddev[0] >= 9:
                    verified.append((error(reference, aligned.crop(box)), error(reference, translated.crop(box))))
    if len(verified) < 6:
        return None
    residual = median(a for a, _ in verified)
    improvements = sum(b - a >= max(2, 0.20 * b) for a, b in verified)
    if residual > 18 or improvements < max(5, 0.7 * len(verified)):
        return None
    return {
        "state": "similarity",
        "translation": None,
        "matrix": [
            gain.real,
            -gain.imag * height / width,
            shift.real / width,
            gain.imag * width / height,
            gain.real,
            shift.imag / height,
        ],
        "rotation_degrees": round(angle, 3),
        "scale": round(scale, 5),
        "residual_gray_error": round(residual, 3),
        "background_tiles": len(support),
        "validation_tiles": len(verified),
        "reason": "distributed background agreement on rotation and scale",
        "method": "bounded similarity fit with separate background validation tiles",
    }
