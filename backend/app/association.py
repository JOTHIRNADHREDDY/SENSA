"""Derived evidence reconciliation. Original detections/events remain immutable."""

import hashlib
import json
from collections import defaultdict
from statistics import median
from PIL import Image, ImageChops, ImageStat
from .registration import IDENTITY, compose, motion_matrix, register_similarity
from .vision import iou, segment_at

VERSION = "controlled-association-5.4"
ALIASES = {"cardboard box": "package", "carton": "package", "flower pot": "plant"}


def category(label):
    return ALIASES.get(label, label)


def deduplicate(observations):
    """Suppress only redundant regions; retain alias IDs as provenance, never delete rows."""
    selected, suppressed = [], {}
    for ob in sorted(observations, key=lambda o: (o["timestamp"], o["id"])):
        match = next(
            (
                old
                for old in selected
                if old["frame_id"] == ob["frame_id"]
                and category(old["label"]) == category(ob["label"])
                and iou(old["box"], ob["box"]) >= (0.98 if ob["label"] == "person" else 0.85)
                and (
                    ob["label"] != "person"
                    or (
                        ob.get("track_id") is not None
                        and old.get("run_id") == ob.get("run_id")
                        and old.get("track_id") == ob.get("track_id")
                    )
                )
            ),
            None,
        )
        if match:
            suppressed[ob["id"]] = match["id"]
        else:
            selected.append(ob)
    return selected, suppressed


def register_images(before, after, excluded_before=(), excluded_after=()):
    """Estimate background translation or a bounded rotation and uniform scale."""
    a = before.convert("L").resize((64, 48))
    b = after.convert("L").resize((64, 48))
    tiles = [(x, y, x + 8, y + 8) for y in (10, 22, 34) for x in (10, 22, 34, 46)]

    def covered(tile, boxes):
        norm = [tile[0] / 64, tile[1] / 48, tile[2] / 64, tile[3] / 48]
        return any(iou(norm, box) > 0.005 for box in boxes)

    tiles = [t for t in tiles if not covered(t, excluded_before) and ImageStat.Stat(a.crop(t)).stddev[0] >= 7]

    def fallback(reason):
        return register_similarity(before, after, excluded_before, excluded_after) or {
            "state": "unregistered",
            "reason": reason,
            "translation": None,
        }

    if len(tiles) < 4:
        return fallback("insufficient textured background")
    scores = []
    for dy in range(-6, 7):
        for dx in range(-6, 7):
            errors = []
            for t in tiles:
                target = (t[0] + dx, t[1] + dy, t[2] + dx, t[3] + dy)
                if not covered(target, excluded_after):
                    errors.append(ImageStat.Stat(ImageChops.difference(a.crop(t), b.crop(target))).mean[0])
            if len(errors) >= 4:
                scores.append((median(errors), dx, dy))
    if not scores:
        return fallback("background obscured")
    scores.sort()
    error, dx, dy = scores[0]
    alternatives = [s[0] for s in scores if abs(s[1] - dx) + abs(s[2] - dy) > 2]
    baseline = next((s[0] for s in scores if s[1:] == (0, 0)), 255)
    unique = alternatives and min(alternatives) - error >= 2
    accepted = error <= 20 and unique and (dx == dy == 0 or error <= baseline * 0.75)
    improvements = []
    if dx or dy:
        for tile in tiles:
            target = (tile[0] + dx, tile[1] + dy, tile[2] + dx, tile[3] + dy)
            if covered(tile, excluded_after) or covered(target, excluded_after):
                continue
            reference = a.crop(tile)
            zero_error = ImageStat.Stat(ImageChops.difference(reference, b.crop(tile))).mean[0]
            moved_error = ImageStat.Stat(ImageChops.difference(reference, b.crop(target))).mean[0]
            improvements.append(zero_error - moved_error >= max(3, zero_error * 0.3))
        # A low median alone can align repeated shelf edges or a moving foreground.
        # Require spatially distributed background improvement over the static hypothesis.
        accepted = accepted and len(improvements) >= 4 and sum(improvements) >= max(4, len(improvements) * 0.75)
    if not accepted:
        similarity = register_similarity(before, after, excluded_before, excluded_after)
        if similarity is not None:
            return similarity
    return {
        "state": ("static" if dx == dy == 0 else "translation") if accepted else "unregistered",
        "translation": [dx / 64, dy / 48] if accepted else None,
        "residual_gray_error": round(error, 3),
        "background_tiles": len(tiles),
        "translation_supporting_tiles": sum(improvements),
        "reason": "textured background translation"
        if accepted
        else "ambiguous, occluded or non-translational background",
        "method": "robust grayscale background tiles / 64x48 / bounded translation only",
    }


def frame_motion(frames, observations, path_for, boundaries, cache_dir=None):
    """Coordinates reset at every cut or failed registration; never bridge unknown motion."""
    rows, offsets, coordinate_group = [], {}, 0
    by_frame = defaultdict(list)
    for o in observations:
        if o["label"] == "person" or category(o["label"]) in {"package", "bag", "trolley"}:
            by_frame[o["frame_id"]].append(o["box"])
    previous = None
    cumulative = IDENTITY
    for frame in sorted(frames.values(), key=lambda f: (f["timestamp"], f["id"])):
        if previous and segment_at(previous["timestamp"], boundaries) == segment_at(frame["timestamp"], boundaries):
            try:
                paths = [path_for(previous), path_for(frame)]
                if any(path is None for path in paths):
                    raise OSError("Bound frame image unavailable")
                cache_key = hashlib.sha256(
                    json.dumps(
                        [
                            VERSION,
                            [str(p) for p in paths],
                            [(p.stat().st_size, p.stat().st_mtime_ns) for p in paths],
                            by_frame[previous["id"]],
                            by_frame[frame["id"]],
                        ],
                        sort_keys=True,
                    ).encode()
                ).hexdigest()
                cache = cache_dir / ("motion-" + cache_key + ".json") if cache_dir else None
                if cache and cache.exists():
                    motion = json.loads(cache.read_text())
                else:
                    with Image.open(paths[0]) as a, Image.open(paths[1]) as b:
                        motion = register_images(a, b, by_frame[previous["id"]], by_frame[frame["id"]])
                    if cache:
                        cache.write_text(json.dumps(motion))
            except (OSError, ValueError):
                motion = {"state": "unregistered", "translation": None, "reason": "frame unavailable"}
        else:
            motion = {"state": "segment_start", "translation": [0, 0]}
        matrix = motion_matrix(motion)
        if matrix is None or motion["state"] == "segment_start":
            coordinate_group += 1
            cumulative = IDENTITY
        else:
            cumulative = compose(matrix, cumulative)
        offsets[frame["id"]] = {"matrix": cumulative, "group": coordinate_group}
        rows.append(
            {
                **motion,
                "frame_id": frame["id"],
                "timestamp": frame["timestamp"],
                "previous_frame_id": previous["id"] if previous else None,
                "coordinate_group": coordinate_group,
            }
        )
        previous = frame
    return rows, offsets


def event_episodes(findings, events, tracks, frames, boundaries, max_gap=2.5, observations=()):
    """Collapse repeated support into temporal episodes; ambiguous participants remain null."""
    rows = []
    by_ob = {o["id"]: o for o in observations}
    for f in findings:
        if f["kind"] in {"person_object_proximity", "possible_object_movement"}:
            chunks = []
            for fid in sorted(set(f["frame_ids"]), key=lambda fid: frames[fid]["timestamp"]):
                if not chunks or frames[fid]["timestamp"] - frames[chunks[-1][-1]]["timestamp"] > max_gap:
                    chunks.append([])
                chunks[-1].append(fid)
            for chunk in chunks:
                rows.append(
                    {
                        **f,
                        "start": frames[chunk[0]]["timestamp"],
                        "end": frames[chunk[-1]]["timestamp"],
                        "frame_ids": chunk,
                        "observation_ids": [
                            oid for oid in f["observation_ids"] if oid in by_ob and by_ob[oid]["frame_id"] in chunk
                        ],
                        "source_event_ids": [],
                        "finding_ids": [f["id"]],
                    }
                )
    for e in events:
        if e["type"] not in {
            "possible_carry",
            "possible_remove",
            "possible_transfer",
            "possible_disappearance",
            "possible_open",
        }:
            continue
        fids = [f["id"] for f in frames.values() if e["start"] - 1e-5 <= f["timestamp"] <= e["end"] + 1e-5]
        if not fids:
            continue
        people = [t for t in tracks if t["category"] == "person" and set(t["frame_ids"]) & set(fids)]
        rows.append(
            {
                "kind": e["type"],
                "start": e["start"],
                "end": e["end"],
                "person_track": people[0]["id"] if len(people) == 1 else None,
                "object_track": None,
                "frame_ids": fids,
                "observation_ids": [],
                "source_event_ids": [e["id"]],
                "finding_ids": [],
                "uncertainty": "AI interpretation only; object assignment, removal, authorization and guilt are unverified.",
            }
        )
    groups = defaultdict(list)
    for row in rows:
        groups[
            (row["kind"], row.get("person_track"), row.get("object_track"), segment_at(row["start"], boundaries))
        ].append(row)
    episodes = []
    for (kind, person, obj, segment), items in groups.items():
        current = None
        for row in sorted(items, key=lambda r: (r["start"], r["end"])):
            # Unknown participants can only deduplicate the same frame, not imply continuity between people.
            join = (
                current
                and row["start"] <= current["end"] + max_gap
                and (person or obj or set(row["frame_ids"]) & set(current["frame_ids"]))
            )
            if not join:
                current = {
                    "kind": kind,
                    "person_track": person,
                    "object_track": obj,
                    "segment": segment,
                    "start": row["start"],
                    "end": row["end"],
                    "frame_ids": [],
                    "observation_ids": [],
                    "source_event_ids": [],
                    "finding_ids": [],
                    "support_record_count": 0,
                    "state": "UNRESOLVED",
                    "confirmed_removal": False,
                    "human_conclusion": None,
                    "uncertainty": row["uncertainty"],
                }
                episodes.append(current)
            current["end"] = max(current["end"], row["end"])
            current["support_record_count"] += 1
            for field in ("frame_ids", "observation_ids", "source_event_ids", "finding_ids"):
                current[field] = sorted(set(current[field]) | set(row.get(field, [])))
    for episode in episodes:
        key = {k: episode[k] for k in ("kind", "person_track", "object_track", "segment", "start", "end", "frame_ids")}
        episode["id"] = "episode:" + hashlib.sha256(json.dumps(key, sort_keys=True).encode()).hexdigest()[:32]
        episode["sample_count"] = len(episode["frame_ids"])
        episode["coverage_note"] = "Support samples only; intervening frames may be unobserved."
    return sorted(episodes, key=lambda e: (e["start"], e["kind"], e["id"]))
