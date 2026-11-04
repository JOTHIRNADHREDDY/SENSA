# Deployment, backup and recovery

## Local full application

```sh
docker compose up -d --build --wait
```

The frontend binds host loopback port 3001 and API port 8000. Create the administrator locally. Two external worker processes share the API’s named `media` volume and the same `sqlite:////app/data/sensa.db`. SQLite WAL and lock timeouts support local multi-process use. A single persistent local disk is required.

All four additive migrations run before service use. The API startup applies them before its health check passes. Workers then start. Container restarts preserve the named volume. Do not use `docker compose down -v` for routine stopping.

## Approved read-only reviewer

```sh
docker compose --profile reviewer up -d --build --wait
```

Open host loopback port 3002. The review service contains approved synthetic v8 JSON, native evidence, source clips, the walkthrough and PDFs. It supports episode search, track timelines, source seeking and saved detection boxes. The underlying application remains available to authorized local users. The reviewer image copies only the approved evidence paths and has no database volume.

For HTTPS, provide an authorized hostname through `SENSA_REVIEW_HOST`, point its DNS to your Docker host, and allow inbound ports 80 and 443. Then run:

```sh
docker compose -f docker-compose.yml -f docker-compose.production.yml --profile reviewer up -d --build --wait
```

Caddy obtains and persists certificates and proxies to the reviewer. Its administrative interface is disabled. The API, workers and SQLite remain private. This configuration prepares public access once the owner supplies hosting and DNS. No public deployment URL is assigned by the repository.

## Static hosting on Cloudflare Pages

Run from the repository root with Python 3.12 and verify the release before upload.

```sh
python scripts/validate_release.py
python scripts/build_static_reviewer.py
```

The default output is `output/reviewer-static/`. Use `--output` with a new directory for another build. This folder contains only HTML, CSS, browser JavaScript, approved synthetic media and reports, and Cloudflare Pages headers and 404 configuration. It requires no environment variables, API keys, backend services or database.

In an owner-controlled Cloudflare account, create a Pages Direct Upload project and upload the **contents** of that directory. Serve it at the root of its `pages.dev` hostname so the existing `/demo/` and `/reports/` URLs resolve. For a custom hostname, use the Pages project's **Custom domains** settings and follow Cloudflare’s DNS instructions. [Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/) · [Custom domains](https://developers.cloudflare.com/pages/configuration/custom-domains/)

After deployment, open the assigned URL and verify search, source playback and seeks, track samples, frame boxes, provenance, and report downloads. Compare the downloaded report hashes against `reports/SHA256SUMS.txt`. Confirm that `/api/health`, `/.env` and `/demo/videos/parking-lot.webm` are unavailable. A host is ready for reviewers after these checks pass on its deployed URL.

Native reviewer verification with a Caddy 2.10.2 binary is also possible:

```powershell
$env:SENSA_REVIEW_ROOT = (Get-Location).Path
$env:SENSA_REVIEW_BIND = '127.0.0.1'
caddy run --config infra/Reviewer.Caddyfile --adapter caddyfile
# In another terminal
python scripts/check_reviewer.py http://127.0.0.1:8080
```

## Consistent backup

Stop the API and workers before backing up the complete evidence volume. This keeps the SQLite database, WAL sidecars, source registrations, native files and raw responses at a consistent point. Example on a Linux Docker host:

```sh
mkdir -p backups
docker compose stop backend worker
docker compose run --rm --no-deps --user root -v "$PWD/backups:/backup" backend python -c "import tarfile; t=tarfile.open('/backup/sensa-data.tar.gz','w:gz'); t.add('/app/data',arcname='data'); t.close()"
sha256sum backups/sensa-data.tar.gz > backups/sensa-data.tar.gz.sha256
docker compose up -d backend worker
```

Store the archive, its hash and environment secrets in a protected backup location outside Git. Keep the associated release commit and dependency lockfiles.

## Recovery

Verify the backup hash first. On a fresh host, install the same release and create a new empty named volume. Restore the archive’s `data/` contents to `/app/data` while the API and workers are stopped. Match permissions to the image’s `sensa` user. Never extract over a running database. Preserve the damaged/original volume for diagnosis.

Start the API and workers, check `/api/health`, verify expected worker count and the audit chain, then retrieve representative native frames and recheck source hashes before accepting new work. Rehearse restoration against a separate volume before replacing a live installation. Docker execution and restoration must be verified on the destination host.
