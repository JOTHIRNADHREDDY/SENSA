# API contract

The executable OpenAPI schema is served at `http://127.0.0.1:8001/openapi.json`, with Swagger at `/docs`. APIs live under `/api`; Next proxies them on port 3001. Errors use `{ "error": { "code": "HTTP_403", "message": "…" } }`; validation uses `VALIDATION`, provider errors `PROVIDER_UNAVAILABLE` (503). No stack traces or keys are returned.

| Method / path | Purpose / permission |
| --- | --- |
| GET `/health` | DB readiness and setup-required; public |
| POST `/auth/setup`, `/auth/login`, `/auth/logout` | First admin, sign in, revoke session |
| POST `/auth/local` | Automatically open a protected local workspace session; only when local mode is enabled and request is same-origin loopback |
| GET `/auth/me` | Current account |
| GET/POST `/users` | Administrator list/create local accounts |
| GET `/dashboard` | Authorized counts and recent evidence |
| POST `/demo` | Generate procedural fixtures; writer |
| GET/POST `/videos` | Authorized list / multipart `file` upload |
| GET `/videos/{id}` | Metadata, jobs, frame manifest, observations, events, sanitized runs |
| GET `/videos/{id}/media` | Authorized original, hash checked, byte ranges |
| GET `/videos/{id}/thumbnail?at=6` | Nearest sampled source frame; authorized |
| POST `/videos/{id}/process` | Explicit retry/Meta analysis; owner/admin; body `{mode,authorize_external_processing}` |
| DELETE `/videos/{id}` | Idle unreferenced recording and derived data; owner/admin |
| GET `/events` | `q,camera,type,start,end,limit,offset`; bounded and authorized |
| GET/POST `/cases` | Visible list / create with `title,description,purpose` |
| GET `/cases/{id}` | Case, ordered timeline, report versions, members |
| POST `/cases/{id}/evidence` | Attach `event_id`, idempotent; writer |
| DELETE `/cases/{id}/evidence/{event_id}` | Remove before report creation |
| POST `/cases/{id}/members` | Share `user_id`; owner/admin |
| POST `/cases/{id}/assistant` | `{question,mode:local|spark|wonder,authorize_external_processing}` |
| POST `/cases/{id}/reports` | Generate evidence snapshot; writer |
| POST `/reports/{id}/review` | `{expected_version,status,notes,human_conclusion}`; reviewer/admin |
| GET `/reports/{id}/export` | JSON, `X-Evidence-SHA256`, audit |
| GET `/alerts` | Visible alerts |
| PATCH `/alerts/{id}` | `{status:acknowledged|dismissed|open,reason}`; writer |
| GET `/settings` | Provider readiness, configured limits and capability boundaries |
| POST `/providers/check` | Real team model catalogue diagnostic; admin |
| GET `/audit` | Bounded audit rows; admin |
| GET `/audit/verify` | Verify local chain; admin |

Every nonpublic endpoint checks authentication server-side. Missing unauthorized asset/case IDs return 404 to avoid disclosing existence. Viewer role is read-only. Case membership allows access to case-linked source assets, not unrelated sources. Admin authority applies only to the one local organization. Counts/list endpoints are bounded to 500 assets/cases and 1,000 candidate events; this prototype is not a large-fleet API.

## Current investigation and operations routes

See [intelligence routes](API_V2.md) and [discovery routes](API_V3.md) for camera clocks, source inspection, graphs, stock comparison, discovery and finding review. The executable OpenAPI document remains the full route/schema inventory.

| Method / path | Purpose / permission |
| --- | --- |
| GET `/reports/{id}/portable/json` | Authorized case reader. Portable snapshot plus resolved detection records, candidate interaction clusters and evidence manifest. Missing records keep an explicit unavailable reason. |
| GET `/reports/{id}/portable/summary` | Concise PDF with verified native images from the saved report. |
| GET `/reports/{id}/portable/appendix` | Technical PDF including historical comparison attempts, episode index, provenance and native image audit. |
| GET `/reports/{id}/portable/manifest` | Report identity, canonical stored snapshot SHA-256, all episode IDs, separate headline IDs, source registrations and image hashes. |
| GET `/operations` | Worker/queue, retention and camera status, administrator only. |
| PUT `/operations/retention` | Configure retention, administrator only. |
| POST `/operations/retention/run` | Apply eligible reversible quarantine, administrator only. |
| POST `/operations/quarantine/{asset_id}/restore` | Restore quarantined data, administrator only. |
| POST `/operations/cameras/{camera_id}/capture` | Capture a configured enabled source, administrator only. |

The static reviewer serves approved files over GET/HEAD and rejects writes. It does not proxy any of these API routes.
