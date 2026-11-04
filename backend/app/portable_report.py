"""Render immutable investigation snapshots without network-dependent evidence."""

import hashlib
import io
import json
import re
from collections import defaultdict
from pathlib import Path
from xml.sax.saxutils import escape

import reportlab
from PIL import Image as PILImage
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Image, KeepTogether, PageBreak, Paragraph, SimpleDocTemplate, Spacer
from sqlalchemy import select

from . import config
from .db import DerivedArtifact, Frame, IntelligenceSnapshot, SourceRecord
from .evidence import PTS_TOLERANCE, matches_frame
from .media import sha256
from .portable_observations import recover_observations, validate_observation_links

EXPORT_VERSION = "portable-3"
UNAVAILABLE = "EVIDENCE IMAGE UNAVAILABLE - NOT SUBSTITUTED"
LOCAL = re.compile(
    r"https?://[^\s<>]+|(?:127\.0\.0\.1|localhost|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+)(?::\d+)?|[A-Za-z]:[\\/][^\s<>]+|\\\\[^\s<>]+",
    re.I,
)


def safe_text(value):
    return LOCAL.sub("[local reference omitted]", str(value))


def snapshot_digest(report):
    return hashlib.sha256(
        json.dumps(report.content, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()
    ).hexdigest()


def clock_label(source):
    clock = source.get("clock_mapping", {})
    if not clock.get("start"):
        return "SOURCE_RELATIVE"
    if source.get("synthetic") and clock.get("verified"):
        return "VERIFIED_FOR_FIXTURE"
    # A configured verification flag alone does not attest physical synchronization.
    return "CONFIGURED_SOURCE_CLOCK"


def stock_versions(content):
    rows = {}
    for node in content.get("stock_comparisons", []):
        data = node["data"]
        for row in data.get("rows", []):
            key = row.get("record_id") or data["id"]
            rows.setdefault(key, {**row, "comparison_id": key, "created": data.get("created", "")})
    return sorted(rows.values(), key=lambda row: (row["created"], row["comparison_id"]), reverse=True)


def alignment_available(row):
    visual = row.get("visual_stock_discrepancy", {})
    return (
        row.get("fixed_shelf_comparable") is True
        and visual.get("availability") == "available"
        and visual.get("visibility_clear") is True
        and visual.get("aligned_shelf_delta") is not None
    )


def episode_groups(content):
    """Collapse duplicate presentation only where identity and frame support agree."""
    groups = {}
    for node in content.get("event_episodes", []):
        data = node["data"]
        frames = {
            (f["source_id"], f["frame_id"]): f
            for f in node.get("source_frames", [])
            if f.get("source_id") == data.get("source_id") and f.get("frame_id") in data.get("frame_ids", [])
        }
        identity = tuple(
            data.get(k)
            for k in (
                "asset_id",
                "source_id",
                "segment",
                "kind",
                "person_track",
                "object_track",
                "start",
                "end",
                "state",
            )
        )
        key = (identity, tuple(sorted(frames))) if frames and all(identity[:4]) else node["id"]
        group = groups.setdefault(
            key, {**data, "ids": [], "frames": sorted(frames.values(), key=lambda f: (f["timestamp"], f["frame_id"]))}
        )
        group["ids"].append(node["id"])
        for field in ("source_event_ids", "finding_ids", "observation_ids"):
            group[field] = sorted(set(group.get(field, [])) | set(data.get(field, [])))
    return sorted(groups.values(), key=lambda row: (row["asset_id"], row["start"], row["id"]))


def interaction_clusters(episodes):
    """Group overlapping review intervals without merging track or episode identities."""
    scopes = defaultdict(list)
    for row in episodes:
        scope = tuple(row.get(key) for key in ("asset_id", "source_id", "segment", "person_track"))
        if row["kind"] == "person_object_proximity" and row.get("object_track") and all(scope):
            scopes[scope].append(row)
    clusters = []
    for scope, rows in scopes.items():
        windows = []
        for row in sorted(rows, key=lambda row: (row["start"], row["end"], row["id"])):
            if windows and row["start"] <= windows[-1]["end"]:
                windows[-1]["rows"].append(row)
                windows[-1]["end"] = max(windows[-1]["end"], row["end"])
            else:
                windows.append({"start": row["start"], "end": row["end"], "rows": [row]})
        for window in windows:
            alternatives = defaultdict(list)
            for row in window["rows"]:
                alternatives[row["object_track"]].extend(row["ids"])
            if len(alternatives) < 2:
                continue
            episode_ids = sorted(id_ for ids in alternatives.values() for id_ in ids)
            digest = hashlib.sha256(json.dumps(episode_ids).encode()).hexdigest()[:24]
            clusters.append(
                {
                    "id": f"interaction-cluster:{digest}",
                    **dict(zip(("asset_id", "source_id", "segment", "person_track"), scope, strict=True)),
                    "start": window["start"],
                    "end": window["end"],
                    "state": "AMBIGUOUS_OBJECT_ASSOCIATION",
                    "continuity": "UNVERIFIED",
                    "alternatives": [
                        {"object_track": track, "episode_ids": sorted(ids)}
                        for track, ids in sorted(alternatives.items())
                    ],
                }
            )
    return clusters


def read_image(db, reference, sources, checked_sources):
    """Read the exact recorded native artifact. Never decode a replacement."""
    info = {
        k: reference.get(k)
        for k in ("asset_id", "source_id", "source_sha256", "frame_id", "frame_sha256", "timestamp", "segment")
    }
    info["embedding_status"] = "unavailable"
    artifact_id = reference.get("artifact_id")
    if not artifact_id:
        # Older snapshots already persisted the pinned ID in their frame URL.
        match = re.fullmatch(r"/api/frames/[^/?]+/native\?artifact_id=([A-Za-z0-9-]+)", reference.get("url", ""))
        artifact_id = match[1] if match else None
    info["artifact_id"] = artifact_id
    source = db.get(SourceRecord, info["source_id"]) if info["source_id"] else None
    frame = db.get(Frame, info["frame_id"]) if info["frame_id"] else None
    artifact = db.get(DerivedArtifact, artifact_id) if artifact_id else None
    allowed = sources.get(info["asset_id"], {})
    if not (
        source
        and frame
        and artifact
        and artifact.kind == "native_frame"
        and allowed.get("native_source_id") == source.id
        and allowed.get("native_source_sha256") == source.sha256
        and info["source_sha256"] == source.sha256
        and info["frame_sha256"] == artifact.sha256
        and matches_frame(artifact, source, frame)
        and isinstance(info["timestamp"], (float, int))
        and abs(frame.timestamp - info["timestamp"]) <= PTS_TOLERANCE
    ):
        return {**info, "reason": "Missing or inconsistent pinned source, frame, timestamp, or artifact."}, None
    try:
        if source.id not in checked_sources:
            path = (config.DATA / source.path).resolve()
            checked_sources[source.id] = path.is_relative_to(config.DATA) and sha256(path) == source.sha256
        path = (config.DATA / artifact.path).resolve()
        if not checked_sources[source.id] or not path.is_relative_to(config.DATA):
            return {**info, "reason": "Source file integrity verification failed."}, None
        pixels = path.read_bytes()
        if hashlib.sha256(pixels).hexdigest() != artifact.sha256:
            return {**info, "reason": "Native artifact hash does not match its evidence record."}, None
        with PILImage.open(io.BytesIO(pixels)) as image:
            size = image.size
            image.verify()
        with PILImage.open(io.BytesIO(pixels)) as image:
            pixel_hash = hashlib.sha256(image.convert("RGB").tobytes()).hexdigest()
    except (OSError, ValueError):
        return {**info, "reason": "The stored native image or source is unavailable."}, None
    return {
        **info,
        "embedding_status": "embedded",
        "pixel_dimensions": list(size),
        "rgb_sha256": pixel_hash,
        "derivation": "Stored native decode, no crop, overlay or spatial resampling. PDF encodes the original pixels as an image object.",
        "export_version": EXPORT_VERSION,
    }, pixels


def prepare(db, report):
    content = report.content
    sources = {s["asset_id"]: s for s in content.get("integrity", [])}
    analyses = {}
    for aid, source in sources.items():
        for snap in db.scalars(
            select(IntelligenceSnapshot)
            .where(
                IntelligenceSnapshot.asset_id == aid,
                IntelligenceSnapshot.created <= report.created,
            )
            .order_by(IntelligenceSnapshot.created.desc())
        ):
            if snap.data.get("source", {}).get("id") == source.get("native_source_id"):
                analyses[aid] = snap
                break
    episodes = episode_groups(content)
    stock = stock_versions(content)
    chosen = next((row for row in stock if alignment_available(row)), stock[0] if stock else None)
    lead = max(
        (row for row in episodes if row["kind"] == "possible_carry" and row["state"] == "UNRESOLVED"),
        key=lambda row: (len(row["frames"]), row["id"]),
        default=None,
    )
    refs = []
    if lead and lead["frames"]:
        refs.append(("Interaction start sample", {**lead["frames"][0], "segment": lead["segment"]}))
        if len(lead["frames"]) > 1:
            refs.append(("Interaction end sample", {**lead["frames"][-1], "segment": lead["segment"]}))
    if chosen:
        refs_by_frame = {f["frame_id"]: f for f in chosen.get("source_provenance", [])}
        for key in ("before", "after"):
            view = chosen[key]
            ref = refs_by_frame.get(view["frame_id"], view)
            analysis = analyses.get(view["asset_id"])
            segment = (
                next((f.get("segment") for f in analysis.data["frames"] if f["id"] == view["frame_id"]), None)
                if analysis
                else None
            )
            refs.append(("Shelf " + key, {**ref, "segment": segment}))
    checked = {}
    images = [(caption, *read_image(db, ref, sources, checked)) for caption, ref in refs]
    observations = list(recover_observations(db, content, sources))
    return sources, episodes, stock, chosen, lead, images, analyses, observations


def manifest(report, prepared):
    sources, episodes, _, chosen, lead, images, analyses, observations = prepared
    discovery = report.content.get("discovery", {})
    coverage = [
        {
            k: row[k]
            for k in ("asset_id", "phase", "start", "end", "requested_start", "requested_end", "complete", "status")
            if k in row
        }
        for row in discovery.get("coverage", []) + discovery.get("coverage_gaps", [])
    ]
    return {
        "export_version": EXPORT_VERSION,
        "report_id": report.id,
        "case_id": report.case_id,
        "report_version": report.version,
        "report_created": report.created,
        "snapshot_sha256": snapshot_digest(report),
        "comparison_id": chosen["comparison_id"] if chosen else None,
        "comparison": {
            "roi": chosen.get("roi"),
            "after_roi_polygon": chosen.get("after_roi_polygon"),
            "alignment_state": chosen.get("camera_motion", {}).get("state"),
            "aligned_delta_available": alignment_available(chosen),
            "visual_detection_delta": chosen.get("visible_detection_delta"),
            "inventory_delta": chosen.get("independent_inventory_delta"),
            "state": chosen.get("state"),
            "confirmed_removal": chosen.get("confirmed_removal"),
            "before": {key: chosen["before"].get(key) for key in ("frame_id", "asset_id", "timestamp", "count")},
            "after": {key: chosen["after"].get(key) for key in ("frame_id", "asset_id", "timestamp", "count")},
            "inventory_reference": safe_text(chosen.get("inventory_reference") or ""),
        }
        if chosen
        else None,
        "coverage": coverage,
        "episode_ids": sorted(id_ for row in episodes for id_ in row["ids"]),
        "headline_episode_ids": lead["ids"] if lead else [],
        "observation_ids": [row["id"] for row in observations],
        "unavailable_observation_ids": [row["id"] for row in observations if row["evidence_status"] == "unavailable"],
        "provider_requests": discovery.get("provider_requests"),
        "sources": [
            {
                "asset_id": aid,
                "source_id": source.get("native_source_id"),
                "source_sha256": source.get("native_source_sha256"),
                "clock_status": clock_label(source),
                "configured_clock_origin": source.get("clock_mapping", {}).get("start"),
                "synthetic": source.get("synthetic"),
                "relationship": source.get("native_source_relationship"),
                "analysis_id": analyses[aid].id if aid in analyses else None,
            }
            for aid, source in sources.items()
        ],
        "images": [{"caption": caption, **ref} for caption, ref, _ in images],
    }


def portable_snapshot(report, prepared):
    """Keep snapshot evidence references while excluding user IDs and local transport details."""
    excluded = {"url", "path", "imported_by", "owner_id", "author_id", "reviewer_id", "raw_response"}

    def sanitize(value):
        if isinstance(value, dict):
            return {key: sanitize(item) for key, item in value.items() if key not in excluded}
        if isinstance(value, list):
            return [sanitize(item) for item in value]
        return safe_text(value) if isinstance(value, str) else value

    _, episodes, _, _, _, _, _, observations = prepared
    content = {
        **report.content,
        "observations": [*report.content.get("observations", []), *observations],
        "candidate_interaction_clusters": interaction_clusters(episodes),
    }
    validate_observation_links(content)
    return {
        "id": report.id,
        "case_id": report.case_id,
        "version": report.version,
        "status": report.status,
        "created": report.created,
        "reviewed": report.reviewed,
        "content": sanitize(content),
        "evidence_manifest": manifest(report, prepared),
    }


def build_pdf(report, prepared, kind):
    content = report.content
    sources, episodes, stock, chosen, lead, images, analyses, observations = prepared
    fonts = Path(reportlab.__file__).parent / "fonts"
    pdfmetrics.registerFont(TTFont("SensaText", str(fonts / "Vera.ttf")))
    pdfmetrics.registerFont(TTFont("SensaBold", str(fonts / "VeraBd.ttf")))
    styles = {
        "title": ParagraphStyle(
            "title", fontName="SensaBold", fontSize=28, leading=35, textColor=colors.HexColor("#173328"), spaceAfter=15
        ),
        "section": ParagraphStyle(
            "section",
            fontName="SensaBold",
            fontSize=15,
            leading=20,
            textColor=colors.HexColor("#173328"),
            spaceBefore=9,
            spaceAfter=7,
        ),
        "body": ParagraphStyle("body", fontName="SensaText", fontSize=10, leading=15, spaceAfter=8),
        "ref": ParagraphStyle(
            "ref",
            fontName="SensaText",
            fontSize=8,
            leading=11,
            textColor=colors.HexColor("#40584f"),
            spaceAfter=7,
            splitLongWords=True,
        ),
        "tag": ParagraphStyle(
            "tag", fontName="SensaBold", fontSize=9, leading=13, textColor=colors.HexColor("#376653"), spaceAfter=10
        ),
    }
    story = []

    def p(text, style="body"):
        story.append(Paragraph(escape(safe_text(text)), styles[style]))

    def page(title):
        if story:
            story.append(PageBreak())
        p(
            "SENSA  /  "
            + (
                "SYNTHETIC CONTROLLED DEMONSTRATION"
                if sources and all(s.get("synthetic") for s in sources.values())
                else "INVESTIGATION EVIDENCE"
            ),
            "tag",
        )
        p(title, "title")

    def source_name(asset_id):
        return sources.get(asset_id, {}).get("name", "Unknown source")

    def snapshot_ref():
        p(f"Case {report.case_id} | report {report.id} | snapshot v{report.version}", "ref")
        p(f"Stored snapshot SHA-256 {snapshot_digest(report)}", "ref")

    def episode(row):
        return f"{source_name(row['asset_id'])} | segment {row['segment']} | {row['start']:.3f}-{row['end']:.3f} s | {row['kind'].replace('_', ' ')} | {row['state']}"

    def image(caption, ref, data):
        block = [Paragraph(escape(caption), styles["section"])]
        if data:
            w, h = ref["pixel_dimensions"]
            max_height = 155 if caption.startswith("Shelf") else 185
            scale = min(418 / w, max_height / h)
            block.append(Image(io.BytesIO(data), width=w * scale, height=h * scale, hAlign="LEFT"))
        else:
            block.append(Paragraph(escape(UNAVAILABLE + ". " + ref["reason"]), styles["body"]))
        timestamp = f"{ref['timestamp']:.3f} s" if isinstance(ref["timestamp"], (int, float)) else "unknown time"
        block.extend(
            [
                Spacer(1, 5),
                Paragraph(
                    escape(
                        safe_text(
                            f"{source_name(ref['asset_id'])} | {timestamp} source-relative | segment {ref['segment'] or 'unrecorded'} | frame {ref['frame_id']} | source {ref['source_id']}"
                        )
                    ),
                    styles["ref"],
                ),
            ]
        )
        block.append(
            Paragraph(
                escape(f"Artifact {ref['artifact_id']} | native SHA-256 {ref['frame_sha256']}"),
                styles["ref"],
            )
        )
        story.append(KeepTogether(block))

    def comparison(row):
        p(f"Comparison {row['comparison_id']} | saved {row['created']}", "ref")
        p(
            f"{source_name(row['before']['asset_id'])} | {row['before']['timestamp']:.3f} s to {row['after']['timestamp']:.3f} s | {row['state']}"
        )
        p(
            f"Visible detections {row['before'].get('count')} to {row['after'].get('count')} | detection delta {row.get('visible_detection_delta')}"
        )
        inventory = (
            "Synthetic inventory reference"
            if sources.get(row["before"]["asset_id"], {}).get("synthetic")
            else "Independent inventory reference"
        )
        p(
            f"{inventory} delta {row.get('independent_inventory_delta')} | {row.get('inventory_reference') or 'No reference supplied'}"
        )
        visual = row.get("visual_stock_discrepancy", {})
        p(
            f"Shelf ROI {row.get('roi')} | "
            + (
                f"aligned delta {visual['aligned_shelf_delta']}; visibility and query coverage accepted."
                if alignment_available(row)
                else "COMPARISON UNAVAILABLE. "
                + (visual.get("reason") or "Alignment and visibility were not verified.")
            )
        )
        p(f"Confirmed removal = {str(row.get('confirmed_removal')).lower()}", "ref")

    if kind == "summary":
        page("Missing stock investigation" if chosen else "Investigation summary")
        p(f"Snapshot v{report.version} | {report.created[:10]} | {report.status} / human review", "tag")
        snapshot_ref()
        p("Incident question", "section")
        p(content.get("scope", "No incident description recorded."))
        p("What SENSA reviewed", "section")
        p(
            "This export presents sampled evidence. Possible interactions and visual count changes remain separate from physical removal and inventory verification."
        )
        p("Representative timeline", "section")
        if chosen:
            p(
                f"{source_name(chosen['before']['asset_id'])} | {chosen['before']['timestamp']:.3f} s | before shelf sample"
            )
        if lead:
            p(episode(lead))
            p("Headline episode " + ", ".join(lead["ids"]), "ref")
        if chosen:
            p(f"{source_name(chosen['after']['asset_id'])} | {chosen['after']['timestamp']:.3f} s | after shelf sample")
        p("UNRESOLVED | no confirmed removal or human conclusion in the controlled finding", "section")
        page("Possible interaction")
        if lead:
            p(episode(lead))
            p(
                f"{len(lead['frames'])} unique sampled frames. Repeated model outputs from the same sample are not independent corroboration."
            )
            p(lead.get("uncertainty", "Physical contact and carrying remain unverified."))
        else:
            p("No supported possible-carry episode is recorded in this snapshot.")
        for caption, ref, data in images:
            if caption.startswith("Interaction"):
                image(caption, ref, data)
        page("Shelf before and after")
        if chosen:
            comparison(chosen)
        else:
            p("No shelf comparison is recorded in this snapshot.")
        for caption, ref, data in images:
            if caption.startswith("Shelf"):
                image(caption, ref, data)
        page("Source clocks and coverage")
    else:
        page("Technical evidence appendix")
        p(f"Snapshot v{report.version} | {report.created[:10]} | {report.status} / human review")
        snapshot_ref()
        p("Source clocks and coverage", "section")
    for source in sources.values():
        p(f"{source['name']} | {clock_label(source)}", "section")
        p(
            f"Asset {source['asset_id']} | registration {source.get('native_source_id')} | SHA-256 {source.get('native_source_sha256') or source.get('sha256')}",
            "ref",
        )
        clock = source.get("clock_mapping", {})
        if clock.get("start"):
            p(f"Configured origin {clock['start']} | {clock.get('evidence', 'No clock method recorded')}", "ref")
    discovery = content.get("discovery", {})
    for window in discovery.get("coverage", []):
        p(
            f"{source_name(window['asset_id'])} | {window['phase'].replace('_', ' ')} | {window.get('requested_start', window.get('start'))} to {window.get('requested_end', window.get('end'))} s | {window.get('status', 'recorded')} | complete={window.get('complete', False)}",
            "ref",
        )
    for gap in discovery.get("coverage_gaps", []):
        p(
            f"{source_name(gap['asset_id'])} | {gap['start']:.3f}-{gap['end']:.3f} s | {gap['status']} in this run",
            "ref",
        )
    p(
        "Times are source-relative. Configured synthetic clocks apply only to the fixture. Physical camera synchronization was not validated. Existing-index coverage does not establish that unsearched intervals contain no relevant activity."
    )
    if "provider_requests" in discovery:
        p(
            f"Discovery run provider requests: {discovery['provider_requests']}. Previously saved model runs are listed separately."
        )
    if kind == "summary":
        page("Model provenance and finding")
        for model, role in (
            ("sam-3.1", "Sampled localization and masks"),
            ("muse-spark-1.3", "Sampled scene interpretation"),
        ):
            runs = [
                r
                for r in content.get("models", [])
                if r.get("model") == model and r.get("status") == "succeeded" and r.get("provider") == "meta-standard"
            ]
            p(model, "section")
            p(
                f"{role}. {len(runs)} successful saved model records in this snapshot."
                if runs
                else "No successful saved Meta run recorded in this snapshot."
            )
        p(
            "SENSA derives anonymous associations, aggregates episodes, verifies source identity and computes the count deltas using application logic."
        )
        p("UNRESOLVED", "title")
        p(
            "The evidence does not establish removal, identity, authorization or responsibility. Human adjudication is separate."
        )
        p(content.get("human_conclusion") or "No human conclusion recorded.")
        p(
            f"Human finding reviews: {len(content.get('human_reviews', []))}. Report review: {report.reviewed or 'none recorded'}.",
            "ref",
        )
    else:
        p("Source analysis versions and continuity", "section")
        for aid, snap in analyses.items():
            p(
                f"{source_name(aid)} | analysis {snap.id} | version {snap.data.get('version')} | boundaries {snap.data.get('continuity', {}).get('boundaries', [])}",
                "ref",
            )
            for segment in snap.data.get("segments", []):
                p(f"{segment['id']} | source-relative {segment['start']:.3f}-{segment['end']:.3f} s", "ref")
        page("Representative native evidence")
        for caption, ref, data in images:
            if caption.startswith("Interaction"):
                image(caption, ref, data)
        page("Shelf comparison evidence")
        if chosen and alignment_available(chosen):
            p("Primary accepted comparison", "section")
            comparison(chosen)
        else:
            p("No aligned comparison was accepted for this snapshot.")
        for caption, ref, data in images:
            if caption.startswith("Shelf"):
                image(caption, ref, data)
        page("Comparison history and episodes")
        historical = [row for row in stock if row is not chosen or not alignment_available(row)]
        if historical:
            p("Historical comparison attempts", "section")
            p("These records preserve earlier attempts. Unavailable comparisons do not support the aligned finding.")
            for row in historical:
                comparison(row)
        p("Episode index", "section")
        clusters = interaction_clusters(episodes)
        if clusters:
            p(
                "Overlapping proximity episodes are grouped for review. Object continuity is unverified. "
                "Different candidate tracks may be distinct or fragmented. Repeated outputs from the same sample "
                "are not independent corroboration. Carry, movement and disappearance remain separate hypotheses."
            )
        for cluster in clusters:
            p(
                f"{source_name(cluster['asset_id'])} | segment {cluster['segment']} | "
                f"{cluster['start']:.3f}-{cluster['end']:.3f} s | ambiguous object association"
            )
            p(f"{cluster['id']} | person {cluster['person_track']} | registration {cluster['source_id']}", "ref")
            for alternative in cluster["alternatives"]:
                p(f"Candidate {alternative['object_track']} | episodes {', '.join(alternative['episode_ids'])}", "ref")
        p("Episode ledger", "section")
        previous_source = None
        for row in episodes:
            source = (row["asset_id"], row.get("source_id"))
            if source != previous_source:
                p(f"{source_name(source[0])} | registration {source[1]}", "section")
                previous_source = source
            p(episode(row))
            p(
                f"Episode records {', '.join(row['ids'])} | person {row.get('person_track')} | object {row.get('object_track')}",
                "ref",
            )
            p("Frames " + ", ".join(f"{f['timestamp']:.3f}s {f['frame_id']}" for f in row["frames"]), "ref")
            for key in ("source_event_ids", "finding_ids", "observation_ids"):
                if row.get(key):
                    p(f"{key}: " + ", ".join(row[key]), "ref")
        for title, key in (
            ("Anonymous tracklets", "anonymous_tracks"),
            ("Object tracks", "object_tracks"),
            ("Human adjudications", "human_reviews"),
            ("Contradictions", "contradictory_evidence"),
            ("Hypotheses", "possible_hypotheses"),
        ):
            p(title, "section")
            for node in content.get(key, []):
                d = node["data"]
                p(
                    f"{node['id']} | {node.get('label', '')} | "
                    + str(
                        {
                            k: v
                            for k, v in d.items()
                            if k
                            in (
                                "first",
                                "last",
                                "segment",
                                "observations",
                                "frame_ids",
                                "state",
                                "decision",
                                "reason",
                                "notes",
                            )
                        }
                    ),
                    "ref",
                )
        p("Observation and interpretation ledger", "section")
        unavailable = [row for row in observations if row["evidence_status"] == "unavailable"]
        p(
            f"{len(observations)} distinct detection references in the portable JSON. "
            f"{len(unavailable)} explicitly unavailable. "
            "The JSON gives each available observation's recorded detection, model run, source frame and artifact binding."
        )
        for row in unavailable:
            p(f"{row['id']} | {row['reason']}", "ref")
        for row in stock:
            refs = [
                f"{side}: " + ", ".join(row[side]["observation_ids"])
                for side in ("before", "after")
                if row[side].get("observation_ids")
            ]
            if refs:
                p(f"Comparison {row['comparison_id']} | " + " | ".join(refs), "ref")
        for row in {r["id"]: r for r in content.get("timeline", [])}.values():
            p(
                f"{source_name(row['asset_id'])} | {row['start']:.3f}-{row['end']:.3f} s | {row['category']} | {row['title']} | {row['id']}",
                "ref",
            )
            p(row.get("description", ""), "ref")
            p(
                "Model "
                + str(row.get("run_id"))
                + " | frames "
                + ", ".join(dict.fromkeys(f["frame_id"] for f in row.get("source_frames", []))),
                "ref",
            )
        p("Saved model runs", "section")
        for row in content.get("models", []):
            p(
                f"{source_name(row['asset_id'])} | {row['model']} | {row['provider']} | {row['status']} | {row['id']} | {row['elapsed_ms']} ms",
                "ref",
            )
        p("Embedded-frame audit", "section")
        for caption, ref, _ in images:
            p(
                f"{caption} | {ref['embedding_status']} | frame {ref['frame_id']} | artifact {ref['artifact_id']} | SHA-256 {ref['frame_sha256']} | {ref.get('derivation', ref.get('reason'))}",
                "ref",
            )
        p("Human conclusion", "section")
        p(content.get("human_conclusion") or "None recorded.")
        p(
            f"Human finding reviews: {len(content.get('human_reviews', []))}. Report review: {report.reviewed or 'none recorded'}.",
            "ref",
        )

    def footer(canvas, doc):
        canvas.setFont("SensaText", 8)
        canvas.setFillColor(colors.HexColor("#40584f"))
        canvas.drawString(44, 29, "SENSA  /  Source-relative timestamps  /  Human review record")
        canvas.drawRightString(A4[0] - 44, 29, str(doc.page))

    buffer = io.BytesIO()
    SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=44,
        rightMargin=44,
        topMargin=42,
        bottomMargin=48,
        title=f"SENSA {kind} v{report.version}",
        author="SENSA",
    ).build(story, onFirstPage=footer, onLaterPages=footer)
    return buffer.getvalue()
