# API v3 additions

Existing authenticated v1/v2 routes remain. Local no-signin mode is restricted to loopback and uses the existing protected session. Model credentials are server-only.

| Route | Behavior |
|---|---|
| `POST /api/videos/batch` | Multipart `files` (1–20), camera label and existing upload options. Returns accepted count and per-file outcomes; preserves successful uploads when others fail. |
| `GET /api/cases/{id}/discovery` | Case sources and up to 30 persistent discovery run records. |
| `POST /api/cases/{id}/discovery` | Returns 202 with persistent run. Fields: `incident`, `asset_ids`, `request_key`, `mode` (`existing`/`meta`), `authorize_external_processing`, optional `start_date`/`end_date`, `max_requests` (1–10000, default 48), `reinspect`. Both calendar dates are required together. Same request key/same scope is idempotent; changed scope returns 409. Active shared-source discovery/inspection is rejected. |
| `POST /api/discovery/{id}/cancel` | Run owner/admin stops future work; in-flight provider requests may finish. |
| `POST /api/cases/{id}/finding-reviews` | Reviewer/admin; `reference` must exist in scoped graph, `disposition` supported/rejected/unresolved, `notes` 10–3000 chars. Preserves machine data and adds attributed human decision. |
| `GET /api/reports/{id}/pdf` | Protected evidence-linked PDF for existing report snapshots, preserving report status/version and uncertainty. |

Migrations 1 and 2 are unchanged. Additive migration 3 creates `case_videos`, `discovery_runs` and `finding_reviews` (see actual SQLAlchemy table names in app/db.py). Existing report versions and media are retained. Recovery marks interrupted discovery work explicitly instead of silently retrying billed requests.

Discovery results expose selected sources, eligible source-relative ranges, model request count, child jobs, coarse/reinspection coverage, ranked candidates, warnings and a draft report reference. `succeeded` indicates the scheduled sampled pass completed, not every frame was verified. Existing-index runs cannot claim full source coverage. Report hypotheses are restricted to supporting frames within the requested scope; human review stays separate from machine interpretation.

Source-relative PTS remains the evidence time basis. Date constraints require verified camera-clock offsets. UTC ordering is used only when every included timeline row has a verified source clock; otherwise source groups remain explicit.
