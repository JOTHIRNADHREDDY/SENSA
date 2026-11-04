# API v2 additions

All endpoints use the existing HttpOnly session and case/source authorization. Mutations require a non-viewer role; source analysis/configuration changes require source owner or administrator. Local mode remains loopback-only. API reference: http://127.0.0.1:8001/docs.

| Method and path | Purpose / validation |
|---|---|
| GET /api/videos/{id}/intelligence | Latest immutable snapshot, jobs, source lineage, clock/zone configuration, supported noun concepts |
| POST /api/videos/{id}/intelligence/jobs | mode local/meta; explicit external authorization for meta; idempotent request_key; <=4 noun concepts; optional start/end <=12s; fps .5-10; max_windows 1-4; max_requests 1-12. One active job/source, two/account, shared bounded worker pool. |
| POST /api/intelligence/jobs/{id}/cancel | Cancel queued work or request cancellation after current in-flight unit; completed results retained |
| PATCH /api/videos/{id}/configuration | Camera label/ID, source-start ISO clock with offset, verification notes, <=20 normalized rectangular zones |
| GET /api/videos/{id}/native-media | Protected registered source, byte range, SHA-256 verification |
| GET /api/frames/{id}/native | Original-resolution PNG, X-Evidence-SHA256, X-Source-SHA256, X-Source-PTS, playback-relative time basis |
| GET /api/observations/{id}/mask | Official SAM decoder -> transparent PNG within observation bounds; invalid/over-budget masks return 422, raw record retained |
| GET /api/cases/{id}/graph | Case-scoped nodes, typed relationships, validated existing references |
| GET /api/cases/{id}/search?q=... | Deterministic intent/metadata/time filtering; frame/video references; no supporting evidence returned explicitly |
| POST /api/cases/{id}/intelligence/attach | Idempotently attach stored geometry findings and targeted scene interpretations to case timeline |
| POST /api/cases/{id}/enrichment | JSON rows, <=500 / 1 MB; inventory, receipts, dispatch, stock adjustment, access logs, incident notes, testimony. Each row needs record_id. Verified imports also need identifier. Optional video_reference must resolve in this case graph. Clock correlation needs verified source and log clocks; never implies causation. |
| POST /api/cases/{id}/camera-associations | Two actual frame references from distinct configured cameras; unverified hypothesis by default. Human-verified time/spatial association additionally needs reviewer/admin, independently verified clocks, forward time within one hour and evidence notes. No identity verification or automatic track merge. |

Existing report endpoint now adds possible_hypotheses, contradictory_evidence, missing_evidence and graph reference validation. Existing report versions remain immutable. Existing assistant retrieves graph records when intelligence exists; Spark explanations are restricted to retrieved references.

A native PTS or source frame index is not a verified CCTV clock. Null detection confidence means unavailable, not zero. Association confidence is a heuristic score. SAM confidence is requested and retained per frame when provided. Raw model output, proxy/native geometry, prompt versions, frame/hash manifests, actual usage and cleanup states are retained in ModelRun. No automatic billed retries. Cache keys include model/prompt version, exact input-frame hashes, source and Spark grounding context. Zero detections do not prove absence.

Migration v2 adds cameras, media_sources, video_configurations, intelligence_snapshots, analysis_jobs, derived_artifacts, finding_events and enrichment_records. It does not alter or replace v1 rows. Relational foreign keys protect sources/frames/runs/events; snapshot/graph support IDs are validated against stored records. Finding-event keys and request idempotency prevent duplicate events on repeat processing.
