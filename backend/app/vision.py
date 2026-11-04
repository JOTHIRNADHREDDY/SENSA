"""Conservative geometry evidence. Scores are heuristics, never calibrated probabilities."""

import hashlib
import math
import statistics
import re
from functools import lru_cache
from collections import defaultdict

from .media import MediaError

VERSION = "continuity-tracking-5.4"


@lru_cache(maxsize=512)
def mask_shape(token):
    """Small shape cue from the official decoder; never an identity feature."""
    from meta_sam_parser import SegmentationMask, decode_mask_to_raster, InvalidSegmentationMaskError
    from PIL import Image

    match = re.fullmatch(r"<\|mask;x=0;y=0;(?:c=[0-9.e+-]+;)?data=(\d+),(\d+),([~!])(.*?)\|>", token or "")
    if not match:
        return None
    h, w = int(match[1]), int(match[2])
    if w * h > 300_000:
        return None
    try:
        raster = decode_mask_to_raster(
            SegmentationMask("lossless" if match[3] == "~" else "one_bit", match[3] + match[4], w, h)
        )
        reduced = Image.frombytes("L", (w, h), raster).resize((16, 16), Image.Resampling.NEAREST)
        return int("".join("1" if v else "0" for v in reduced.tobytes()), 2)
    except (ValueError, TypeError, InvalidSegmentationMaskError):
        return None


def iou(a, b):
    area = max(0, min(a[2], b[2]) - max(a[0], b[0])) * max(0, min(a[3], b[3]) - max(a[1], b[1]))
    return area / max(1e-9, (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - area)


def center(box):
    return ((box[0] + box[2]) / 2, (box[1] + box[3]) / 2)


def distance(a, b):
    return math.dist(center(a), center(b))


def scan_changes(samples, fps):
    """Input: decoded PTS + small grayscale pixels, not synthetic playback offsets."""
    changes, repeated, gaps = [], [], []
    diffs = []
    for previous, current in zip(samples, samples[1:]):
        diffs.append(sum(abs(a - b) for a, b in zip(previous[1], current[1])) / len(current[1]))
    # Absolute floor rejects normal small-object motion; robust outlier threshold adapts to moving cameras.
    med = statistics.median(diffs) if diffs else 0
    mad = statistics.median(abs(d - med) for d in diffs) if diffs else 0
    threshold = max(4.5, med + 10 * mad)
    seen = {}
    for index, (pts, pixels) in enumerate(samples):
        digest = hashlib.sha256(pixels).hexdigest()
        if digest in seen and index - seen[digest] > 1:
            repeated.append(
                {
                    "index": index,
                    "timestamp": pts,
                    "matches_index": seen[digest],
                    "kind": "repeated_image",
                    "cause": "unknown; static scene or repeated playback",
                }
            )
        elif index and pixels == samples[index - 1][1]:
            repeated.append(
                {
                    "index": index,
                    "timestamp": pts,
                    "matches_index": index - 1,
                    "kind": "duplicate_frame",
                    "cause": "unknown",
                }
            )
        seen[digest] = index
        if not index:
            continue
        delta = pts - samples[index - 1][0]
        if delta <= 0 or delta > 1.8 / max(fps, 1):
            gaps.append(
                {
                    "index": index,
                    "timestamp": pts,
                    "previous_pts": samples[index - 1][0],
                    "kind": "pts_discontinuity",
                    "elapsed_cctv_time": None,
                }
            )
        if diffs[index - 1] >= threshold:
            changes.append(
                {
                    "index": index,
                    "timestamp": pts,
                    "previous_pts": samples[index - 1][0],
                    "difference": round(diffs[index - 1], 4),
                    "kind": "view_change" if diffs[index - 1] >= 25 else "possible_playback_jump",
                    "cause": "unverified; cut, seeking or skipped playback cannot be distinguished",
                }
            )
    boundaries = sorted({c["timestamp"] for c in changes + gaps})
    return {
        "version": VERSION,
        "decoded_frames": len(samples),
        "threshold": threshold,
        "changes": changes,
        "repeated_frames": repeated[:300],
        "duplicate_count": len(repeated),
        "pts_gaps": gaps,
        "boundaries": boundaries,
        "positions": [{"index": i, "pts": s[0]} for i, s in enumerate(samples)],
        "time_basis": "decoded source PTS; playback-relative, camera time unknown",
    }


def scan_video(path, fps):
    """Stream every decoded low-resolution frame; never buffer full long-source pixels."""
    import subprocess
    import tempfile
    import time
    import imageio_ffmpeg
    from PIL import Image, ImageChops, ImageStat

    rows = []
    previous = None
    began = time.monotonic()
    with tempfile.TemporaryFile() as diagnostics:
        process = subprocess.Popen(
            [
                imageio_ffmpeg.get_ffmpeg_exe(),
                "-hide_banner",
                "-nostdin",
                "-threads",
                "1",
                "-protocol_whitelist",
                "file,pipe",
                "-i",
                str(path),
                "-an",
                "-vf",
                "scale=64:48,format=gray,showinfo",
                "-fps_mode",
                "passthrough",
                "-frames:v",
                "1728000",
                "-f",
                "rawvideo",
                "pipe:1",
            ],
            stdout=subprocess.PIPE,
            stderr=diagnostics,
        )
        try:
            while True:
                raw = process.stdout.read(3072)
                if not raw:
                    break
                if len(raw) != 3072:
                    raise MediaError("Truncated continuity frame")
                if time.monotonic() - began > 900:
                    raise MediaError("Continuity scan exceeded 15-minute resource budget")
                im = Image.frombytes("L", (64, 48), raw)
                difference = ImageStat.Stat(ImageChops.difference(previous, im)).mean[0] if previous else 0
                rows.append((difference, hashlib.sha256(raw).hexdigest()))
                previous = im
            code = process.wait(timeout=10)
            if code:
                raise MediaError("Continuity decode failed")
            diagnostics.seek(0)
            pts = [
                float(m[1])
                for line in diagnostics
                for m in [re.search(rb"\bn:\s*\d+\s+pts:.*?pts_time:([\d.e+-]+)", line)]
                if m
            ]
        finally:
            if process.poll() is None:
                process.kill()
                process.wait()
            process.stdout.close()
    if not rows or len(rows) != len(pts):
        raise MediaError("Decoded timestamp/frame mismatch")
    differences = [r[0] for r in rows[1:]]
    median = statistics.median(differences) if differences else 0
    threshold = max(4.5, median + 10 * (statistics.median(abs(d - median) for d in differences) if differences else 0))
    changes = []
    repeated = []
    gaps = []
    seen = {}
    duplicates = 0
    for i, (difference, digest) in enumerate(rows):
        if digest in seen:
            duplicates += 1
            if len(repeated) < 300:
                repeated.append(
                    {
                        "index": i,
                        "timestamp": pts[i],
                        "matches_index": seen[digest],
                        "kind": "repeated_image",
                        "cause": "static scene or repeated playback; unresolved",
                    }
                )
        seen[digest] = i
        if i and (pts[i] <= pts[i - 1] or pts[i] - pts[i - 1] > 1.8 / max(1, fps)):
            gaps.append(
                {
                    "index": i,
                    "timestamp": pts[i],
                    "previous_pts": pts[i - 1],
                    "kind": "pts_discontinuity",
                    "elapsed_cctv_time": None,
                }
            )
        if i and difference >= threshold:
            changes.append(
                {
                    "index": i,
                    "timestamp": pts[i],
                    "previous_pts": pts[i - 1],
                    "difference": difference,
                    "kind": "view_change" if difference >= 25 else "possible_playback_jump",
                    "cause": "unverified cut/seek/skipped playback",
                }
            )
    return {
        "version": VERSION,
        "decoded_frames": len(rows),
        "threshold": threshold,
        "changes": changes,
        "repeated_frames": repeated,
        "duplicate_count": duplicates,
        "pts_gaps": gaps,
        "boundaries": sorted({x["timestamp"] for x in changes + gaps}),
        "positions": [{"index": i, "pts": t} for i, t in enumerate(pts)],
        "time_basis": "decoded source PTS; playback-relative; source clock unverified unless configured",
    }


def segment_at(timestamp, boundaries):
    return 1 + sum(timestamp >= b - 1e-6 for b in boundaries)


def predicted_box(track, timestamp):
    previous = track.get("_previous_box")
    elapsed = track["last"] - track.get("_previous_time", track["last"])
    gap = timestamp - track["last"]
    if not previous or elapsed <= 0 or not 0 < gap <= 4:
        return track["last_box"]
    box = track["last_box"]
    dx = max(-0.3, min(0.3, ((box[0] + box[2] - previous[0] - previous[2]) / 2) * gap / elapsed))
    dy = max(-0.3, min(0.3, ((box[1] + box[3] - previous[1] - previous[3]) / 2) * gap / elapsed))
    return [max(0, min(1, v)) for v in [box[0] + dx, box[1] + dy, box[2] + dx, box[3] + dy]]


def associate(observations, frames, camera, boundaries, max_gap=4, motion=None):
    """Mutual unique geometric matches; provider IDs cannot override a cut or ambiguity."""
    from .association import category
    from .registration import bounds, compose, corners, inverse, motion_matrix

    grouped = defaultdict(list)
    for observation in observations:
        grouped[(segment_at(observation["timestamp"], boundaries), observation["frame_id"])].append(observation)
    tracks, assignments, hypotheses, gaps = [], {}, [], []
    ordered = sorted(grouped.items(), key=lambda pair: frames[pair[0][1]]["timestamp"])
    for (segment, fid), ds in ordered:
        timestamp = frames[fid]["timestamp"]
        ds = sorted(ds, key=lambda d: d["id"])
        active = [t for t in tracks if t["segment"] == segment and 0 < timestamp - t["last"] <= max_gap]
        scores = {}
        for d in ds:
            candidates = []
            for t in active:
                if category(t["category"]) != category(d["label"]):
                    continue
                last_box = t["last_box"]
                prediction = predicted_box(t, timestamp)
                old_motion = (motion or {}).get(t["frame_ids"][-1], {})
                new_motion = (motion or {}).get(fid, {})
                if old_motion and old_motion.get("group") == new_motion.get("group"):
                    relative = compose(motion_matrix(new_motion), inverse(motion_matrix(old_motion)))
                    projected_box = bounds(corners(last_box, relative))
                    if max(abs(a - b) for a, b in zip(last_box, projected_box)) > 0.005:
                        prediction = projected_box
                    last_box = projected_box
                overlap = iou(last_box, d["box"])
                displacement = distance(last_box, d["box"])
                predicted_overlap = iou(prediction, d["box"])
                predicted_displacement = distance(prediction, d["box"])
                same_provider = bool(
                    d.get("run_id")
                    and d.get("track_id") is not None
                    and t.get("_provider") == (d.get("run_id"), d.get("track_id"))
                )
                plausible_provider_motion = same_provider and displacement <= min(0.30, 0.15 * (timestamp - t["last"]))
                # Appearance is deliberately not used for joining people. ID hints alone are insufficient.
                if overlap < 0.12 and displacement > 0.12 and predicted_overlap < 0.3 and not plausible_provider_motion:
                    continue
                if (
                    max((d["box"][2] - d["box"][0]) * (d["box"][3] - d["box"][1]), 1e-6)
                    / max((t["last_box"][2] - t["last_box"][0]) * (t["last_box"][3] - t["last_box"][1]), 1e-6)
                    > 5
                ):
                    continue
                score = 0.8 * overlap + 0.2 * max(0, 1 - displacement / 0.2)
                if t.get("_previous_box") and timestamp - t["last"] <= 4:
                    score = max(score, 0.75 * predicted_overlap + 0.25 * max(0, 1 - predicted_displacement / 0.2))
                ratio = ((d["box"][2] - d["box"][0]) * (d["box"][3] - d["box"][1])) / max(
                    1e-6, (last_box[2] - last_box[0]) * (last_box[3] - last_box[1])
                )
                if plausible_provider_motion and 0.4 <= ratio <= 2.5:
                    score = max(score, 0.55)
                previous_mask, current_mask = t.get("_mask"), d.get("mask_shape")
                if previous_mask is not None and current_mask is not None:
                    similarity = (previous_mask & current_mask).bit_count() / max(
                        1, (previous_mask | current_mask).bit_count()
                    )
                    score = 0.95 * score + 0.05 * similarity
                # A still-visible small region may be a partial occlusion of the same provider object.
                # Require containment, same request/id and no long gap. Appearance alone never qualifies.
                old, box = last_box, d["box"]
                new_area = max(1e-6, (box[2] - box[0]) * (box[3] - box[1]))
                old_area = max(1e-6, (old[2] - old[0]) * (old[3] - old[1]))
                intersection = max(0, min(old[2], box[2]) - max(old[0], box[0])) * max(
                    0, min(old[3], box[3]) - max(old[1], box[1])
                )
                if (
                    same_provider
                    and intersection / new_area > 0.8
                    and new_area < old_area * 0.35
                    and timestamp - t["last"] <= 0.6
                ):
                    score = max(score, 0.55)
                candidates.append((score, t))
            scores[d["id"]] = sorted(candidates, key=lambda v: (-v[0], v[1]["id"]))
        used = set()
        for d in ds:
            candidates = scores[d["id"]]
            best = candidates[0] if candidates else None
            competing = (
                []
                if not best
                else [
                    other
                    for other in ds
                    if other["id"] != d["id"]
                    and scores[other["id"]]
                    and scores[other["id"]][0][1]["id"] == best[1]["id"]
                    and scores[other["id"]][0][0] >= best[0] - 0.15
                ]
            )
            unambiguous = bool(
                best
                and best[0] >= 0.3
                and not competing
                and (len(candidates) < 2 or best[0] - candidates[1][0] >= 0.15)
                and best[1]["id"] not in used
            )
            if unambiguous:
                score, t = best
                state = "continued" if timestamp - t["last"] <= 1 else "reappeared_uncertain"
                if state == "reappeared_uncertain":
                    gaps.append(
                        {"start": t["last"], "end": timestamp, "reason": "temporary_disappearance", "track_id": t["id"]}
                    )
            else:
                prefix = "P" if d["label"] == "person" else "O"
                anchor = str((fid, category(d["label"]), [round(v, 3) for v in d["box"]]))
                tid = f"{camera}:S{segment:03}:{prefix}{hashlib.sha256(anchor.encode()).hexdigest()[:10]}"
                if any(old["id"] == tid for old in tracks):
                    tid += ":" + hashlib.sha256(d["id"].encode()).hexdigest()[:6]
                t = {
                    "id": tid,
                    "camera_id": camera,
                    "segment": segment,
                    "category": d["label"],
                    "first": timestamp,
                    "last": timestamp,
                    "first_box": d["box"],
                    "last_box": d["box"],
                    "observations": [],
                    "frame_ids": [],
                    "states": [],
                    "association_scores": [],
                    "detection_confidence": None,
                    "confidence_basis": "geometry and validated background translation; not a probability",
                    "identity": "not available",
                }
                tracks.append(t)
                score, state = None, "created"
                for candidate_score, candidate in candidates[:2]:
                    hypotheses.append(
                        {
                            "from_track": candidate["id"],
                            "to_track": t["id"],
                            "state": "uncertain",
                            "score": round(candidate_score, 4),
                            "reason": "ambiguous geometry or insufficient association evidence; not merged",
                        }
                    )
            used.add(t["id"])
            flags = []
            if min(d["box"][0], d["box"][1]) <= 0.015 or max(d["box"][2], d["box"][3]) >= 0.985:
                flags.append("cropped")
            if any(other["id"] != d["id"] and iou(other["box"], d["box"]) > 0.15 for other in ds):
                flags.append("overlap")
            if t["observations"]:
                t["_previous_time"], t["_previous_box"] = t["last"], t["last_box"]
            t["last"], t["last_box"] = timestamp, d["box"]
            t["_mask"] = d.get("mask_shape")
            t["_provider"] = (d.get("run_id"), d.get("track_id"))
            t["observations"].append(d["id"])
            t["frame_ids"].append(fid)
            t["association_scores"].append(None if score is None else round(score, 4))
            t["states"].append(
                {
                    "frame_id": fid,
                    "timestamp": timestamp,
                    "state": state,
                    "visibility": flags or ["visible"],
                    "association_score": None if score is None else round(score, 4),
                    "detection_confidence": d.get("detection_confidence"),
                }
            )
            assignments[d["id"]] = {
                "track_id": t["id"],
                "segment": segment,
                "visibility": flags or ["visible"],
                "detection_confidence": d.get("detection_confidence"),
                "association_confidence": None if score is None else round(score, 4),
            }
    for t in tracks:
        t.pop("_mask", None)
        t.pop("_provider", None)
        t.pop("_previous_time", None)
        t.pop("_previous_box", None)
        t["state"] = "terminated_at_visibility_boundary"
        t["unique_person"] = False
    return tracks, assignments, hypotheses, gaps


def interactions(tracks, observations, frames, zones):
    """Geometry supports proximity/movement, never touch/removal/handoff."""
    by_id = {o["id"]: o for o in observations}
    results = []
    persons = [t for t in tracks if t["category"] == "person"]
    objects = [t for t in tracks if t["category"] != "person"]
    for person in persons:
        pd = {by_id[x]["frame_id"]: by_id[x] for x in person["observations"]}
        for obj in objects:
            if person["segment"] != obj["segment"]:
                continue
            od = {by_id[x]["frame_id"]: by_id[x] for x in obj["observations"]}
            common = sorted(set(pd) & set(od), key=lambda f: frames[f]["timestamp"])
            near = [
                f
                for f in common
                if distance(pd[f]["box"], od[f]["box"]) < 0.35 or iou(pd[f]["box"], od[f]["box"]) > 0.03
            ]
            if not near:
                continue
            supports = [i for f in near for i in (pd[f]["id"], od[f]["id"])]
            results.append(
                {
                    "kind": "person_object_proximity",
                    "state": "UNRESOLVED",
                    "category": "inferred",
                    "person_track": person["id"],
                    "object_track": obj["id"],
                    "start": frames[near[0]]["timestamp"],
                    "end": frames[near[-1]]["timestamp"],
                    "frame_ids": near,
                    "observation_ids": supports,
                    "confidence": None,
                    "uncertainty": "Box proximity is visible geometry, not verified contact. Hand/object boundary is not validated; touching, lifting, carrying and transfer remain UNRESOLVED.",
                }
            )
    for obj in objects:
        displacement = obj.get("stabilized_displacement")
        if displacement is None:
            displacement = distance(obj["first_box"], obj["last_box"])
        if len(obj["observations"]) >= 2 and displacement > 0.08:
            results.append(
                {
                    "kind": "possible_object_movement",
                    "state": "UNRESOLVED",
                    "category": "inferred",
                    "person_track": None,
                    "object_track": obj["id"],
                    "start": obj["first"],
                    "end": obj["last"],
                    "frame_ids": obj["frame_ids"],
                    "observation_ids": obj["observations"],
                    "confidence": None,
                    "uncertainty": "Bounding region shifted; camera motion, segmentation drift and occlusion remain possible. No theft, removal or ownership is established.",
                }
            )
        obj["visibility_state"] = "not_observed_after_last_detection; occlusion/boundary/unresolved"
    for person in persons:
        for zone in zones:
            zone_box = zone["box"]
            points = [
                (by_id[x]["timestamp"], by_id[x]["frame_id"], x, iou(by_id[x]["box"], zone_box) > 0.01)
                for x in person["observations"]
            ]
            for a, b in zip(points, points[1:]):
                if a[3] != b[3]:
                    results.append(
                        {
                            "kind": "camera_zone_entry" if b[3] else "camera_zone_exit",
                            "state": "geometry_observed",
                            "category": "observed",
                            "person_track": person["id"],
                            "object_track": None,
                            "start": a[0],
                            "end": b[0],
                            "frame_ids": [a[1], b[1]],
                            "observation_ids": [a[2], b[2]],
                            "confidence": None,
                            "uncertainty": "Configured image-zone overlap changed. This is not proof of a premises entrance/exit or authorization.",
                            "zone": zone["name"],
                        }
                    )
    return results


def reinspection_plan(tracks, hypotheses, continuity, contradictions, duration, max_windows=3):
    candidates = []
    for t in tracks:
        for state in t["states"]:
            if any(v in state["visibility"] for v in ("cropped", "overlap")):
                candidates.append((state["timestamp"], ", ".join(state["visibility"])))
        if len(t["observations"]) == 1:
            candidates.append((t["first"], "fragmented_track"))
    for h in hypotheses:
        match = next(t for t in tracks if t["id"] == h["to_track"])
        candidates.append((match["first"], "uncertain_track_association"))
    candidates += [(x["timestamp"], "scene_discontinuity") for x in continuity["changes"]]
    candidates += [(x["timestamp"], "model_disagreement") for x in contradictions]
    windows = []
    for t, reason in sorted(candidates, key=lambda x: (x[1] != "model_disagreement", x[1] != "overlap", x[0])):
        if any(w["start"] <= t <= w["end"] for w in windows):
            w = next(w for w in windows if w["start"] <= t <= w["end"])
            if reason not in w["reasons"]:
                w["reasons"].append(reason)
            continue
        if len(windows) >= max_windows:
            continue
        windows.append(
            {
                "start": max(0, t - 1),
                "end": min(duration, t + 1.4),
                "fps": 5,
                "max_frames": 12,
                "reasons": [reason],
                "state": "proposed",
                "resolved": False,
            }
        )
    return sorted(windows, key=lambda w: w["start"])
