"""Deterministic intent retrieval; AI may explain only these stored graph references."""

import re
from datetime import datetime, timedelta

from .association import category


def retrieve(graph, query):
    q = query.lower().strip()
    filters = {
        "strategy": "deterministic graph metadata and time filters",
        "time_basis": "playback-relative",
        "intent": "text",
    }
    if any(x in q for x in ("thief", "guilty", "who is", "real identity", "ignore the", "system prompt")):
        return [], {**filters, "reason": "Identity, guilt or instruction override is unsupported."}
    clock = re.search(r"between\s+(\d{1,2})\s*(am|pm)\s+and\s+(\d{1,2})\s*(am|pm)", q)
    seconds = re.search(r"between\s+(\d+(?:\.\d+)?)\s+and\s+(\d+(?:\.\d+)?)\s*(?:seconds|s\b)", q)
    if seconds:
        low, high = map(float, seconds.groups())
        filters.update(start_seconds=low, end_seconds=high)
        if not low <= high <= 28800:
            return [], {**filters, "reason": "Invalid playback time window"}
    if clock and not all(1 <= int(clock[i]) <= 12 for i in (1, 3)):
        return [], {**filters, "reason": "Invalid 12-hour clock time window"}
    from .discovery import calendar_range

    try:
        calendar_start, calendar_end, assumption = calendar_range(q)
    except ValueError as exc:
        return [], {**filters, "reason": str(exc), "unsupported_calendar_constraint": True}
    if calendar_start:
        filters.update(start_date=calendar_start, end_date=calendar_end, year_assumption=assumption)
    nodes = {n["id"]: n for n in graph["nodes"]}
    videos = {n["data"]["asset_id"]: n for n in nodes.values() if n["kind"] == "video"}
    parents = {}
    for edge in graph["edges"]:
        parents.setdefault(edge["source"], []).append(edge["target"])
    if "conflict" in q or "contradict" in q:
        kind = "contradiction"
    elif "unresolved" in q or "uncertain" in q:
        kind = "unresolved"
    elif "disappear" in q:
        kind = "disappearance"
    elif "carry" in q or "carrying" in q:
        kind = "carry"
    elif "transfer" in q or "handoff" in q:
        kind = "transfer"
    elif "opened" in q or "opening" in q:
        kind = "opening"
    elif "remov" in q:
        kind = "removal"
    elif "movement" in q or "moved" in q:
        kind = "movement"
    elif "shel" in q:
        kind = "shelf"
    elif "entrance" in q or "door" in q:
        kind = "door"
    elif any(x in q for x in ("summari", "summary", "what happened", "timeline", "activity")):
        kind = "summary"
    else:
        kind = "text"
    filters["intent"] = kind
    rows = []
    represented = set()
    for node in graph["nodes"]:
        if node["kind"] not in (
            "event",
            "ai_observation",
            "finding",
            "interaction",
            "contradiction",
            "object_track",
            "person_hypothesis",
            "event_episode",
        ):
            continue
        d = node["data"]
        text = (
            node["label"] + " " + d.get("description", "") + " " + d.get("kind", "") + " " + d.get("uncertainty", "")
        ).lower()
        ok = False
        if kind == "summary":
            ok = node["kind"] in ("event", "ai_observation", "finding", "interaction", "event_episode")
        elif kind == "contradiction":
            ok = node["kind"] == "contradiction"
        elif kind == "unresolved":
            ok = (d.get("state") == "UNRESOLVED" or node["kind"] in ("person_hypothesis", "contradiction")) and d.get(
                "human_review", {}
            ).get("disposition") not in ("supported", "rejected")
        elif kind == "movement":
            ok = d.get("kind") == "possible_object_movement" or d.get("type") in (
                "movement",
                "possible_object_movement",
            )
        elif kind == "carry":
            ok = d.get("kind") == "possible_carry" or d.get("type") == "possible_carry"
        elif kind in ("transfer", "opening", "removal"):
            action = {"transfer": "possible_transfer", "opening": "possible_open", "removal": "possible_remove"}[kind]
            ok = d.get("kind") == action or d.get("type") == action
        elif kind == "disappearance":
            ok = d.get("kind", d.get("type")) == "possible_disappearance" or (
                node["kind"] == "object_track"
                and d.get("visibility_state", "").startswith(("unresolved_visibility_gap", "not_observed"))
            )
        elif kind == "shelf":
            obj = nodes.get("track:" + (d.get("object_track") or ""), {}).get("data", {})
            ok = (
                node["kind"] in ("interaction", "event_episode") and category(obj.get("category", "")) == "shelf"
            ) or (
                "shel" in text and node["kind"] == "event" and ("arm" in text or "reach" in text or "proximity" in text)
            )
        elif kind == "door":
            obj = nodes.get("track:" + (d.get("object_track") or ""), {}).get("data", {})
            ok = (node["kind"] == "object_track" and d.get("category") in ("door", "entrance")) or (
                node["kind"] in ("interaction", "event_episode") and obj.get("category") in ("door", "entrance")
            )
        else:
            terms = [
                t
                for t in re.findall(r"[a-z]+", q)
                if t
                not in {
                    "find",
                    "show",
                    "all",
                    "the",
                    "me",
                    "a",
                    "an",
                    "people",
                    "objects",
                    "that",
                    "were",
                    "are",
                    "with",
                    "what",
                    "happened",
                    "between",
                    "and",
                    "seconds",
                }
            ]
            ok = bool(terms) and all(t in text for t in terms)
        if not ok:
            continue
        aid = d.get("asset_id")
        support = []
        seen = set()

        def walk(key, depth=0):
            nonlocal aid
            if key in seen or depth > 5:
                return
            seen.add(key)
            n = nodes.get(key)
            if n is None:
                return
            nd = n["data"]
            if n["kind"] == "frame":
                support.append(nd)
                aid = aid or nd["asset_id"]
            for target in parents.get(key, []):
                if nodes.get(target, {}).get("kind") not in ("model_run", "video", "camera", "video_segment"):
                    walk(target, depth + 1)

        if node["kind"] == "event_episode":
            # A linked track may extend beyond this episode. Use its own supporting frames.
            for frame_id in d.get("frame_ids", []):
                walk("frame:" + frame_id)
        else:
            walk(node["id"])
        if not support:
            continue
        start = d.get("start", d.get("first", min(f["timestamp"] for f in support)))
        end = d.get("end", d.get("last", max(f["timestamp"] for f in support)))
        if seconds:
            if end < low or start > high:
                continue
        video = videos.get(aid, {})
        clock_data = video.get("data", {}).get("clock", {})
        if calendar_start:
            if not clock_data.get("verified") or not clock_data.get("start"):
                filters["reason"] = (
                    "Calendar search excludes sources with unverified clocks; configure source time evidence."
                )
                continue
            dt = datetime.fromisoformat(clock_data["start"]) + timedelta(seconds=start)
            if not calendar_start <= dt.date().isoformat() <= calendar_end:
                continue
        if clock:
            meta = clock_data
            if not meta.get("verified") or not meta.get("start"):
                filters["reason"] = (
                    "No supporting wall-clock evidence: source clocks are unverified. Playback seconds cannot be treated as CCTV clock time."
                )
                continue
            lo = int(clock[1]) % 12 + (12 if clock[2] == "pm" else 0)
            hi = int(clock[3]) % 12 + (12 if clock[4] == "pm" else 0)
            timestamp = datetime.fromisoformat(meta["start"]) + timedelta(seconds=start)
            hour = timestamp.hour + timestamp.minute / 60
            if not (lo <= hour <= hi if lo <= hi else hour >= lo or hour <= hi):
                continue
            filters["time_basis"] = "human-verified source clock with stored provenance"
        if node["kind"] == "event_episode":
            represented.update("event:" + event_id for event_id in d.get("source_event_ids", []))
            represented.update(d.get("finding_ids", []))
        rows.append(
            {
                "id": node["id"],
                "asset_id": aid,
                "title": node["label"],
                "description": d.get(
                    "description",
                    d.get(
                        "uncertainty", d.get("reason", "Stored visibility/association evidence; no causal conclusion.")
                    ),
                ),
                "category": d.get("category", "inferred"),
                "start": start,
                "end": end,
                "type": d.get("kind", d.get("type", node["kind"])),
                "camera": video.get("label", "Recording"),
                "provenance": "stored_evidence_graph",
                "synthetic": bool(video.get("data", {}).get("synthetic")),
                "source_frames": sorted(support, key=lambda f: f["timestamp"]),
                "uncertainty": d.get("uncertainty", "No identity, guilt or authorization inference."),
            }
        )
    rows = [row for row in rows if row["id"] not in represented]
    if not rows and "reason" not in filters:
        filters["reason"] = "No matching stored observations. Sampling and unsearched intervals limit coverage."
    filters.update(matching_records_before_cap=len(rows), result_cap=50, truncated=len(rows) > 50)
    return sorted(rows, key=lambda r: (r["asset_id"] or "", r["start"], r["id"]))[:50], filters
