# Architecture

The application entry point is `backend/app/main.py`. The single Next.js App Router page is `frontend/app/page.tsx`, with investigation modules in `frontend/components/`. The frontend proxies same-origin `/api` requests to FastAPI.

## Storage and processing

SQLAlchemy uses SQLite by default with foreign keys, WAL, and a 30-second lock timeout. Migrations v1–v4 are additive and applied by `python -m app.db`. All API and worker processes must share the same database and media directory on a local persistent disk. Original video files, native frames, derived proxies, and raw provider results stay in private storage. UUIDs and SHA-256 bind sources, frames, artifacts, and model input.

`backend/app/worker.py` claims durable work records transactionally with leases and heartbeats. It dispatches initial analysis, bounded reinspection and incident discovery. The Windows launcher can run two external worker processes. Embedded mode supports a single-process development launch. A worker’s internal thread pool is bounded. Lease recovery accounts for unfinished work and unknown external usage.

The source chain is recording → source registration → native frame/artifact → model run → detection or interpretation → anonymous track → event episode → case → versioned report. `evidence.py` binds references. `portable_observations.py` closes detection references for portable export. `portable_report.py` renders evidence without fetching external resources.

## Intelligence

`providers.py`, `initial_analysis.py`, and `inspection.py` implement the existing Meta Standard adapters for SAM 3.1 and Muse Spark 1.3. They validate output schemas and submitted frame references. `vision.py`, `association.py`, and `registration.py` associate detections within continuous segments, compensate supported motion, and aggregate candidate episodes. `comparison.py` keeps visible counts, inventory references and human review separate. `discovery.py` plans bounded incident searches with explicit omissions.

## Reviewer and deployment boundary

`demo/index.html` is a static read-only review of the approved synthetic v8 JSON. It shows searchable episodes, source playback, four unchanged native PNGs and PDF downloads. Caddy serves only `demo/` and `reports/`, rejects writes, and exposes no investigation API. The reviewer container has no database volume or model key.

Docker Compose runs the API, frontend and two workers with one persistent SQLite/media volume. The optional HTTPS gateway publishes only the reviewer. Investigator ports stay on host loopback. See [deployment](DEPLOYMENT.md) for persistence and backup.
