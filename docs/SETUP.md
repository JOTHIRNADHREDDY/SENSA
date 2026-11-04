# Setup

Use Python 3.12 and Node.js 22.18 or newer. On Windows, follow the root README. On macOS or Linux:

```sh
python3.12 -m venv .venv
.venv/bin/pip install -r backend/requirements-lock.txt
npm --prefix frontend ci
cp .env.example .env
```

For manual launch, export configuration in each terminal. The manual commands do not load `.env` automatically.

```sh
# Terminal 1, repository root
export SENSA_WORKER_MODE=external
cd backend
../.venv/bin/python -m app.db
../.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8001 --timeout-keep-alive 60

# Terminal 2
npm --prefix frontend run dev

# Terminals 3 and 4, repository root
cd backend
../.venv/bin/python -m app.worker
```

Use the same `SENSA_DATA_DIR` and `DATABASE_URL` in the API and both workers. Configure `SENSA_WORKER_MODE=external` on the API when launching separate workers. The default data path is the repository’s private `data/` directory.

| Variable | Purpose and default |
| --- | --- |
| `MODEL_API_KEY` | Backend/worker secret. Omit for local fixtures. |
| `SENSA_MODEL_PERCEPTION` | Allowlisted `sam-3.1`. |
| `SENSA_MODEL_ANALYSIS` | Allowlisted `muse-spark-1.3`. |
| `SENSA_MODEL_ESCALATION` | Optional `muse-wonder-1.0` slot, unused in the approved demo. |
| `SENSA_DATA_DIR` | Persistent private data directory. |
| `DATABASE_URL` | SQLite in that directory by default. Optional PostgreSQL requires `backend/requirements-postgres.txt`. |
| `SENSA_AUTH_MODE` | `signin`, or `local` for same-computer access. |
| `SENSA_ENV` | `production` requires HTTPS origins and rejects local auth mode. |
| `SENSA_ORIGINS` | Comma-separated allowed browser origins, default local ports 3001. |
| `SENSA_MAX_UPLOAD_MB` | 2048 default. |
| `SENSA_MAX_DURATION` | 28800 seconds maximum. |
| `SENSA_MAX_FRAMES` | 24 default, supported maximum 60. |
| `BACKEND_URL` | Next build-time proxy target, default loopback 8001. Container image uses `http://backend:8000`. |
| `SENSA_REVIEW_HOST` | Owner-provided DNS hostname for the HTTPS reviewer gateway. |

The first administrator is created through setup. Passwords need at least 12 characters. The opt-in `prepare_demo.py` helper creates randomized private bootstrap credentials. Keep its generated access file outside Git.

For fresh fixture exploration, choose **Explore the demo**. For the approved saved v8 case, launch the read-only reviewer described in [deployment](DEPLOYMENT.md).

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Port 3001 or 8001 is already in use | Stop only the known SENSA services with `scripts/stop.ps1`, or choose alternate ports for the manual launch and update `BACKEND_URL` and `SENSA_ORIGINS`. Rebuild the frontend when the proxy target changes. |
| UI loads but API requests fail | Check `http://127.0.0.1:8001/api/health` on a native launch or port 8000 with Compose. Start the API and apply migrations in the same environment the workers use. |
| Jobs remain queued | Verify two active workers in `/api/health` and confirm they share the API’s database and media path. Read the local worker logs or `docker compose logs worker`. |
| Local sign-in fails | Use the administrator created at setup. The optional `local` mode accepts only loopback requests and must stay outside production. |
| Decoder rejects a recording | Verify it is a supported MP4 or WebM, check file integrity and limits, and install the pinned media dependencies. The file extension alone does not establish the format. |
| Meta analysis is unavailable | Check backend provider readiness and supply the key through private environment configuration. After restarting API and workers, authorize analysis for the selected source. Offline review works without a key. |
| Reviewer loads without evidence | Start the reviewer with Compose or Caddy and open its HTTP URL. The page fetches JSON and media from the same origin. |
