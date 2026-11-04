"""Durable DB queue. Queued work survives restarts; uncertain billed work never auto-retries."""

import logging
import os
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from .db import DB, WorkItem, Job, Asset, AnalysisJob, DiscoveryRun, ModelRun, WorkerHeartbeat, uid, now

log = logging.getLogger("sensa.worker")
LEASE_SECONDS = 90
_stop = threading.Event()
_thread = None


def active_worker_count(db):
    query = select(WorkerHeartbeat.id).where(WorkerHeartbeat.lease_until > time.time())
    session = os.getenv("SENSA_WORKER_SESSION")
    if session:
        query = query.where(WorkerHeartbeat.id.startswith(session + ":", autoescape=True))
    return len(list(db.scalars(query)))


def _enqueue(kind, target, payload=None):
    with DB.begin() as db:
        existing = db.scalar(select(WorkItem).where(WorkItem.kind == kind, WorkItem.target_id == target))
        if existing:
            return existing.id
        row = WorkItem(kind=kind, target_id=target, payload=payload or {})
        db.add(row)
        db.flush()
        return row.id


def enqueue(kind, target, payload=None):
    try:
        return _enqueue(kind, target, payload)
    except IntegrityError:
        with DB() as db:
            prior = db.scalar(select(WorkItem).where(WorkItem.kind == kind, WorkItem.target_id == target))
            if prior:
                return prior.id
        raise


def claim(worker):
    with DB.begin() as db:
        for row in db.scalars(select(WorkItem).where(WorkItem.state == "queued").order_by(WorkItem.created).limit(30)):
            changed = db.execute(
                update(WorkItem)
                .where(WorkItem.id == row.id, WorkItem.state == "queued")
                .values(state="running", worker=worker, lease_until=time.time() + LEASE_SECONDS)
            )
            if changed.rowcount:
                return row.id
    return None


def recover_expired():
    """Only expired leases are interrupted. Starting another API cannot cancel a live worker."""
    with DB.begin() as db:
        rows = db.scalars(select(WorkItem).where(WorkItem.state == "running", WorkItem.lease_until < time.time())).all()
        for work in rows:
            work.state, work.finished = "interrupted", now()
            work.error = "Worker lease expired. Completed evidence retained; explicit continuation required."
            if work.kind == "media":
                aid = work.payload.get("asset_id", work.target_id)
                job = db.scalar(select(Job).where(Job.asset_id == aid))
                asset = db.get(Asset, aid)
                if job and job.status == "running":
                    job.status, job.error = "interrupted", work.error
                    if asset:
                        asset.status = "partial"
            elif work.kind == "inspection":
                job = db.get(AnalysisJob, work.target_id)
                if job and job.status in ("queued", "running"):
                    job.status, job.error, job.finished = "interrupted", work.error, now()
            elif work.kind == "discovery":
                run = db.get(DiscoveryRun, work.target_id)
                if run and run.status in ("queued", "running"):
                    run.status = "interrupted"
                    run.result = {**run.result, "interruption": work.error}
                    for jid in run.result.get("child_jobs", []):
                        child = db.get(AnalysisJob, jid)
                        if child and child.status in ("queued", "running"):
                            child.status, child.error, child.finished = "interrupted", work.error, now()
            # Only this work's model requests may be marked unknown; other workers remain untouched.
            run_ids = []
            if work.kind == "inspection":
                job = db.get(AnalysisJob, work.target_id)
                run_ids = job.result.get("run_ids", []) if job else []
            elif work.kind == "discovery":
                run = db.get(DiscoveryRun, work.target_id)
                for jid in run.result.get("child_jobs", []) if run else []:
                    job = db.get(AnalysisJob, jid)
                    run_ids += job.result.get("run_ids", []) if job else []
            for rid in run_ids:
                model = db.get(ModelRun, rid)
                if model and model.status == "running":
                    model.status = "interrupted"
                    model.raw = {**model.raw, "usage_status": "unknown after lease expiry"}
    return len(rows)


def reconcile():
    """Adopt old queued jobs once; never replay a legacy in-flight provider request."""
    pending = []
    with DB.begin() as db:
        work = db.scalars(select(WorkItem)).all()
        bound_media = {w.payload.get("asset_id", w.target_id) for w in work if w.kind == "media"}
        bound = {(w.kind, w.target_id) for w in work}
        discoveries = db.scalars(select(DiscoveryRun)).all()
        children = {jid for r in discoveries for jid in r.result.get("child_jobs", [])}
        for job in db.scalars(select(Job).where(Job.status.in_(["queued", "running"]))):
            if job.asset_id in bound_media:
                continue
            if job.status == "queued":
                pending.append(
                    ("media", job.asset_id + "/" + str(job.attempts), {"asset_id": job.asset_id, "real": False})
                )
            else:
                job.status, job.error = "interrupted", "Legacy worker stopped; explicit retry required."
                db.get(Asset, job.asset_id).status = "partial"
        for job in db.scalars(select(AnalysisJob).where(AnalysisJob.status.in_(["queued", "running"]))):
            if ("inspection", job.id) in bound or job.id in children:
                continue
            if job.status == "queued":
                pending.append(("inspection", job.id, {}))
            else:
                job.status, job.error = "interrupted", "Legacy inspection interrupted; usage may be unknown."
        for run in discoveries:
            if ("discovery", run.id) in bound:
                continue
            if run.status == "queued":
                pending.append(("discovery", run.id, {}))
            elif run.status == "running":
                run.status = "interrupted"
                run.result = {**run.result, "interruption": "Legacy discovery stopped; explicit continuation required."}
                for jid in run.result.get("child_jobs", []):
                    child = db.get(AnalysisJob, jid)
                    if child and child.status in ("queued", "running"):
                        child.status, child.error = "interrupted", "Parent discovery interrupted; no automatic retry."
    for args in pending:
        enqueue(*args)
    from .operations import reconcile_quarantine

    reconcile_quarantine()
    recover_expired()


def execute(work_id):
    with DB() as db:
        work = db.get(WorkItem, work_id)
        kind, target, payload = work.kind, work.target_id, work.payload
    error = None
    try:
        if kind == "media":
            from .workflows import process

            process(payload.get("asset_id", target), payload.get("real", False))
        elif kind == "inspection":
            from .inspection import run_job

            run_job(target)
        elif kind == "discovery":
            from .discovery import run_discovery

            run_discovery(target)
        elif kind == "capture":
            from .operations import capture

            capture(target)
        else:
            raise ValueError("Unknown work kind")
    except Exception:
        error = "Work failed; inspect local diagnostics. No automatic billed retry."
        log.exception("Durable work failed: %s", work_id)
    with DB.begin() as db:
        row = db.get(WorkItem, work_id)
        if row.state == "running":
            row.state, row.finished, row.error = "failed" if error else "finished", now(), error


def run(stop=None, concurrency=2):
    stop = stop or _stop
    session = os.getenv("SENSA_WORKER_SESSION")
    worker = f"{session}:{uid()}" if session else uid()
    active = {}
    last_maintenance = 0
    last_capture_poll = 0
    with ThreadPoolExecutor(max_workers=concurrency, thread_name_prefix="sensa-durable") as executor:
        while not stop.is_set():
            active = {k: future for k, future in active.items() if not future.done()}
            recover_expired()
            with DB.begin() as db:
                heartbeat = db.get(WorkerHeartbeat, worker)
                if not heartbeat:
                    db.add(WorkerHeartbeat(id=worker, lease_until=time.time() + LEASE_SECONDS, concurrency=concurrency))
                else:
                    heartbeat.lease_until = time.time() + LEASE_SECONDS
                if active:
                    db.execute(
                        update(WorkItem)
                        .where(WorkItem.id.in_(active), WorkItem.worker == worker, WorkItem.state == "running")
                        .values(lease_until=time.time() + LEASE_SECONDS)
                    )
            while len(active) < concurrency:
                wid = claim(worker)
                if not wid:
                    break
                active[wid] = executor.submit(execute, wid)
            if time.monotonic() - last_capture_poll > 1:
                from .operations import schedule_cameras

                try:
                    schedule_cameras()
                except Exception:
                    log.exception("Camera schedule configuration is unavailable")
                last_capture_poll = time.monotonic()
            if time.monotonic() - last_maintenance > 60:
                from .operations import maintenance

                try:
                    maintenance()
                except Exception:
                    log.exception("Maintenance failed")
                last_maintenance = time.monotonic()
            stop.wait(0.5)
        # In-flight work remains leased while finishing; do not abandon a billed request silently.
        while active:
            active = {k: f for k, f in active.items() if not f.done()}
            with DB.begin() as db:
                if active:
                    db.execute(
                        update(WorkItem)
                        .where(WorkItem.id.in_(active), WorkItem.worker == worker)
                        .values(lease_until=time.time() + LEASE_SECONDS)
                    )
            time.sleep(0.2)
    with DB.begin() as db:
        heartbeat = db.get(WorkerHeartbeat, worker)
        if heartbeat:
            db.delete(heartbeat)


def start():
    global _thread
    if os.getenv("SENSA_WORKER_MODE", "embedded") == "external":
        return
    if not _thread or not _thread.is_alive():
        _stop.clear()
        _thread = threading.Thread(target=run, daemon=True, name="sensa-dispatcher")
        _thread.start()


def stop():
    _stop.set()
    if _thread:
        _thread.join(timeout=2)


if __name__ == "__main__":
    from .db import migrate

    migrate()
    import sys

    if "--health" in sys.argv:
        with DB() as db:
            healthy = db.scalar(select(WorkerHeartbeat.id).where(WorkerHeartbeat.lease_until > time.time()).limit(1))
        sys.exit(0 if healthy else 1)
    reconcile()
    try:
        run()
    except KeyboardInterrupt:
        _stop.set()
