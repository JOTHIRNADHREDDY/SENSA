# Repository release audit

## Scope and classifications

The target is the existing public repository `JOTHIRNADHREDDY/SENSA`. Before cleanup, its remote had no references and the local repository had no commits, branches with commits, or reachable Git objects. No shared history was rewritten. The prior working application and its private evidence were preserved.

| Classification | Paths | Reason and action |
| --- | --- | --- |
| CLEANED | `README.md`, `docs/ARCHITECTURE.md`, `docs/SETUP.md`, `docs/AI_MODELS.md`, `docs/LIMITATIONS.md`, `docs/SECURITY_AND_PRIVACY.md` | Canonical current documentation replaces repeated version-specific narrative. |
| CLEANED | `.gitignore`, `.dockerignore`, `.gitattributes` | Exclude private/generated material and preserve the exact approved PDF and JSON bytes across Git checkouts. |
| CLEANED | `frontend/app/page.tsx` | Removed five unused icon imports and an unused callback index. Runtime behavior is preserved. |
| CLEANED | `frontend/package.json`, `scripts/verify.ps1` | Added TypeScript unused-code and unreachable-code lint to the existing verification flow. |
| CLEANED | `docker-compose*.yml`, `frontend/Dockerfile`, `backend/Dockerfile`, `infra/` | One shared SQLite/media volume, two external workers, health checks, and a separate static HTTPS reviewer. |
| RETAINED | `backend/app/`, `backend/tests/`, `frontend/app/`, `frontend/components/`, `frontend/tests/` | Working integrations, intelligence, source-bound evidence, persistence, review/export and regression coverage. Worker implementation stays in `backend/app/worker.py`. |
| RETAINED | Python manifests, npm lockfile, migrations in `backend/app/db.py`, API v2/v3 docs | Reproducible installation and supported optional database configuration. |
| RETAINED | `sample_data/`, generator, launch/replay/evaluation tools | Required procedural fixtures and supported maintenance. |
| RETAINED | `reports/` | One byte-identical approved v8 copy of each final PDF and JSON, with SHA256SUMS. |
| RETAINED | `demo/` | Approved synthetic source clips, four exact native PNGs, walkthrough, two selected UI captures, and read-only reviewer. |
| ARCHIVED | Private `data/`, `output/`, `tmp/`, old root status files and historical writeups | Remain local and ignored. The old v7 release and irreplaceable evidence stay intact. |
| ARCHIVED | Legacy `scripts/package_hackathon_release.py` | Local utility for historical release layout. It is excluded from the public repository. |
| ARCHIVED | `.venv/`, `node_modules/`, `.next/`, cache directories and generated declarations | Recreated from manifests and build commands, excluded from source. |
| BLOCKED | Public HTTPS destination, domain and project-wide license | Owner supplies hosting/DNS and chooses any additional license. No license or deployment URL was invented. |

The internal pre-change audit recorded 509 candidate file paths with purpose, required/duplicate/outdated/publication status and action, plus all application route decorators. It is kept privately under `tmp/release-audit/`. No source evidence was deleted. Generated dependency installation directories were refreshed from lockfiles.

## Dependency review and rights

Every direct frontend package is used by the runtime or build/type/format/test tooling. Every direct Python package is imported or needed by FastAPI parsing, SQLAlchemy, FFmpeg/media, mask decoding, PDF generation or tests. The fully pinned transitive packages remain intact. **No runtime dependency was removed.** PostgreSQL stays an optional install. pypdf is an isolated release-validation dependency. [Pinned package attribution](ATTRIBUTION.md)

No project-wide open-source license is authorized. The user requested public publication of this source and the approved synthetic artifacts. The prior fixture provenance dedicates generated synthetic footage under CC0-1.0. Reports include saved Meta-derived detection/interpretation records. No model weights or raw response dumps are published. Review Meta service, SAM parser, dependency and hackathon terms before broader redistribution or binary-image distribution.

## Evidence verification

Report `45c9e337-8fef-4e49-9588-ccb8561c07c0` is snapshot v8 in case `d2d7067b-7d93-4fd4-8d2d-590a4fc27515`. Stored canonical snapshot SHA-256 is `ce4a3e8f37bc26e0608215c6f3fc9cf091419dba64c3cbf55625059df99457f8`.

The public copies match the approved bytes. All 442 observation records and 13 episodes are preserved. All 94 distinct episode observation IDs resolve. All four image manifest entries match the native PNGs and the actual image objects in both PDFs. Camera source hashes match the shipped synthetic clips. The primary comparison remains `UNRESOLVED`, `confirmed_removal=false`, with no human conclusion.

| File | SHA-256 |
| --- | --- |
| Summary PDF | `4fc03e12d3fe1a3360a627cc38c2c41d3e1f197d2ca6c7417637e0838263e7c1` |
| Appendix PDF | `9f418047ac24e73882a083635ce26c100bbd041cd645421e4450ae65565b0c65` |
| Portable JSON | `231f0c92f473e7261a9f4af0a1b5b2b088cca934b83b2b61f7b6541309e83168` |

## Executed checks

| Check | Status and actual result |
| --- | --- |
| `python -m pytest -q` | PASS, 128 backend tests, exit 0 after cleanup. |
| `npm --prefix frontend test` | PASS, 6 frontend tests, exit 0. |
| Frontend production build, typecheck and unused-code lint | PASS, each exit 0. |
| Frontend format check | PASS, exit 0. |
| `npm audit --audit-level=moderate` | PASS, zero vulnerabilities, exit 0. |
| `python -m ruff check backend scripts/validate_release.py scripts/publication_check.py scripts/check_reviewer.py` | PASS, exit 0. |
| Matching Ruff formatting check | PASS, 37 files, exit 0. |
| `python scripts/validate_release.py` | PASS, v8 identity and closed detection references, original clip/PNG hashes, summary 5 pages, appendix 48 pages, four exact image objects and zero links in each. Exit 0. |
| Caddy reviewer and HTTPS gateway configuration validation | PASS, both exit 0. |
| `python scripts/check_reviewer.py http://127.0.0.1:8080` | PASS, original file hashes over HTTP, byte-range video playback, denied writes, and private/API paths returning 404. Exit 0. |
| Application clean restart and preflight | PASS, schema v4, HTTP 200, healthy API and two active workers. Exit 0. |
| Browser visual reviewer rehearsal | BLOCKED by disabled local browser use in Work settings. HTTP and evidence checks passed. |
| Local Docker image execution | BLOCKED, Docker engine and WSL are absent. GitHub Actions includes image and stack execution. |

The original shared Python environment has unrelated `face-recognition`/dlib and torch/setuptools conflicts. A clean isolated installation from the project lockfile passed `pip check` with no broken requirements, then passed all 128 backend tests in 31.08 seconds and the release validator, each with exit 0. The test run emitted one Starlette deprecation warning about its supported httpx test client. The pinned working adapter was retained.

Both Compose files and the Actions workflow parsed successfully. Structural checks confirmed one shared SQLite/media volume, two workers, loopback investigator ports and reviewer isolation. Docker execution remains a separate destination/CI check.

The first dependency install encountered a network timeout and was retried successfully. An initial npm reinstall encountered a loaded Windows SWC binary. Stopping the launcher-owned application allowed the final `npm ci` to complete successfully. Two proposed lint-tool dependencies were removed before release because the existing TypeScript compiler provides the required unused-code checks without enlarging the dependency graph. The final npm audit reported zero vulnerabilities.

The Git commit author uses the verified GitHub owner login and public-ID noreply email, configured only in this repository. A new `main` branch matches the empty remote’s configured default branch.

## Publication safety

`scripts/publication_check.py` scans proposed release paths and all reachable Git blobs for common token/private-key patterns, personal Windows paths, and the configured model credential. It checks the built frontend for that credential and verifies relative Markdown links. The private `.env` retains the configured secret locally and is excluded from Git and container build contexts. Generated databases, raw provider results, legacy reports, unapproved real footage and installed dependencies are excluded.

The original repository had no reachable history to clean. A source/history scan can establish what was inspected and is not a guarantee that every possible secret form can be recognized.

## GitHub verification

Implementation commit `05c6a85921395cb8753f2c904b07d131687d57fa` was pushed successfully to the existing repository’s `main` branch. The working tree was clean afterward. The post-push scan covered all 115 publication files and 135 reachable Git objects. An unauthenticated download verified the committed bytes of the README, reviewer script, screenshot, walkthrough, both PDFs, JSON and checksum file. The unauthenticated GitHub HTML contained the rendered README and its report/screenshot links.

[GitHub Actions run 41840628503](https://github.com/JOTHIRNADHREDDY/SENSA/actions/runs/41840628503) completed with **success** for both jobs. Backend and frontend tests passed on the runner. Both Compose configurations passed, all three images built, and the shared SQLite stack started successfully with two workers. The reviewer HTTP evidence/range/isolation checks passed inside that stack. The services shut down successfully afterward. These runner checks supplement the local results and resolve the container-execution verification gap for this release. Owner-provided HTTPS hosting/DNS and a visual browser review remain separate.
