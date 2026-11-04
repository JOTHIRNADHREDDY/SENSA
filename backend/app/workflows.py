import json
import shutil
import threading
import time

from sqlalchemy import select

from . import config
from .db import DB, Alert, Asset, Event, Frame, Job, ModelRun, Observation, audit, now, uid
from .demo import CAMERAS, generate, person_box
from .media import MediaError, probe, sample, sha256
from .providers import ProviderError

demo_lock = threading.Lock()


def submit(asset_id, real=False):
    from .worker import enqueue

    # A new explicit media retry needs a fresh attempt key; the domain job retains its own atomic claim.
    with DB() as db:
        job = db.scalar(select(Job).where(Job.asset_id == asset_id))
        attempt = job.attempts
    enqueue("media", asset_id + "/" + str(attempt), {"asset_id": asset_id, "real": real})


def ingest(path, owner_id, name, camera="Uploaded recording", synthetic=False):
    metadata = probe(path)
    with DB.begin() as db:
        asset = Asset(
            id=path.parent.name,
            owner_id=owner_id,
            name=name,
            camera=camera,
            size=path.stat().st_size,
            sha256=sha256(path),
            synthetic=synthetic,
            **metadata,
        )
        db.add(asset)
        db.flush()
        db.add(Job(asset_id=asset.id))
    audit(owner_id, "video.upload", asset.id, {"sha256": asset.sha256, "synthetic": synthetic})
    return asset


def stage(asset_id, progress, label):
    with DB.begin() as db:
        job = db.scalars(select(Job).where(Job.asset_id == asset_id)).one()
        job.progress, job.stage = progress, label


def process(asset_id, real=False):
    start = time.monotonic()
    with DB.begin() as db:
        # Atomic claim prevents duplicate processing.
        from sqlalchemy import update

        claimed = db.execute(
            update(Job)
            .where(Job.asset_id == asset_id, Job.status.in_(["queued", "failed", "partial"]), Job.attempts < 3)
            .values(
                status="running",
                stage="Verifying source integrity",
                started=now(),
                error=None,
                attempts=Job.attempts + 1,
            )
        )
        if not claimed.rowcount:
            return
        asset = db.get(Asset, asset_id)
        if not asset:
            return
        asset.status = "running"
        owner = asset.owner_id
    root = config.DATA / asset_id
    try:
        original = root / "original.mp4"
        if sha256(original) != asset.sha256:
            raise MediaError("Source integrity check failed")
        derived = root / "frames"
        derived.mkdir(exist_ok=True)
        staging = root / ("decode-" + uid())
        stage(asset_id, 15, "Decoding source frames")
        manifest = sample(
            original,
            staging,
            interval=max(2, asset.duration / max(1, config.MAX_FRAMES - 1) - 1 / asset.fps),
            duration=asset.duration,
            fps=asset.fps,
        )
        with DB.begin() as db:
            # Append-only retries retain earlier observations, runs, frames and report references.
            frames = []
            for filename, timestamp in manifest:
                frame = db.scalar(select(Frame).where(Frame.asset_id == asset_id, Frame.timestamp == timestamp))
                if not frame:
                    unique_name = "sample-" + uid()[:20] + ".jpg"
                    shutil.copyfile(staging / filename, derived / unique_name)
                    frame = Frame(asset_id=asset_id, timestamp=timestamp, filename=unique_name)
                    db.add(frame)
                    db.flush()
                frames.append({"id": frame.id, "timestamp": timestamp, "path": str(derived / frame.filename)})
        shutil.rmtree(staging)
        stage(asset_id, 45, "Source manifest ready")
        fixture_file = root / "fixture.json"
        partial = False
        if real:
            from .initial_analysis import analyze

            partial = analyze(asset, frames)
        elif asset.synthetic and fixture_file.exists():
            fixture = json.loads(fixture_file.read_text())
            if fixture["sha256"] != asset.sha256:
                raise MediaError("Fixture manifest does not match the original source")
            with DB() as db:
                fixture_cached = db.scalar(
                    select(ModelRun.id).where(
                        ModelRun.asset_id == asset_id,
                        ModelRun.provider == "local-fixture",
                        ModelRun.status == "succeeded",
                    )
                )
            variant = fixture["variant"]
            stage(asset_id, 65, "Applying synthetic animation annotations")
            with DB.begin() as db:
                run = ModelRun(
                    asset_id=asset_id,
                    provider="local-fixture",
                    model="warehouse-animation-v1",
                    status="succeeded",
                    routing="Synthetic source hash verified; use exact animation annotations. No AI inference.",
                    usage={"sampled_frames": len(frames), "provider_requests": 0, "cost_usd": 0},
                    raw=fixture,
                )
                db.add(run)
                db.flush()
                visible = []
                for frame in [] if fixture_cached else frames:
                    box = person_box(frame["timestamp"], variant)
                    if box:
                        obs = Observation(
                            asset_id=asset_id,
                            run_id=run.id,
                            frame_id=frame["id"],
                            timestamp=frame["timestamp"],
                            label="person",
                            track_id="synthetic-person-1",
                            box=box,
                            provenance="fixture_annotation",
                        )
                        db.add(obs)
                        db.flush()
                        visible.append(obs)
                if visible:
                    first = visible[0]
                    records = [
                        (
                            "Person enters the field of view",
                            "person_presence",
                            first.timestamp,
                            "info",
                            "observed",
                            "The synthetic person is visible at the annotated source timestamp. The preceding interval contains no person.",
                        ),
                        (
                            "Movement through the aisle",
                            "movement",
                            visible[1].timestamp if len(visible) > 1 else first.timestamp,
                            "info",
                            "observed",
                            "Animation annotations place the synthetic person at successive positions within this clip.",
                        ),
                        (
                            "Restricted zone entry",
                            "zone_entry",
                            next((o.timestamp for o in visible if o.box[0] >= 0.55), visible[-1].timestamp),
                            "warning",
                            "inferred",
                            "The annotated person's left boundary crosses normalized x=0.55 under fixture zone-rule-v1. Authorization and intent are unknown.",
                        ),
                    ]
                    for title, typ, ts, severity, category, desc in records:
                        obs = min(visible, key=lambda o: abs(o.timestamp - ts))
                        event = Event(
                            asset_id=asset_id,
                            observation_id=obs.id,
                            run_id=run.id,
                            title=title,
                            description=desc,
                            type=typ,
                            category=category,
                            severity=severity,
                            start=ts,
                            end=ts,
                            provenance="fixture_annotation",
                        )
                        db.add(event)
                        db.flush()
                        if severity == "warning":
                            db.add(Alert(event_id=event.id))
        else:
            partial = True
            with DB.begin() as db:
                db.add(
                    ModelRun(
                        asset_id=asset_id,
                        provider="none",
                        model=config.MODEL_ANALYSIS,
                        status="blocked",
                        routing="No real-inference request authorized. Arbitrary uploads receive decoding only; fixture annotations never applied.",
                        raw={
                            "reason": "Use Analyze with Meta after configuring credentials and authorizing external processing"
                        },
                    )
                )
        with DB.begin() as db:
            job = db.scalars(select(Job).where(Job.asset_id == asset_id)).one()
            job.status = "partial" if partial else "succeeded"
            job.stage = "Frames ready; model analysis not run" if partial else "Analysis complete"
            job.progress, job.finished = 100, now()
            job.elapsed_ms = int((time.monotonic() - start) * 1000)
            db.get(Asset, asset_id).status = job.status
        audit(
            owner,
            "video.process",
            asset_id,
            {
                "mode": "meta-standard" if real else "fixture" if asset.synthetic else "decode-only",
                "status": "partial" if partial else "succeeded",
            },
        )
    except (MediaError, ProviderError, OSError, ValueError, RuntimeError) as exc:
        safe = (
            str(exc)
            if isinstance(exc, (MediaError, ProviderError))
            else "Processing could not complete; inspect server diagnostics"
        )
        with DB.begin() as db:
            job = db.scalars(select(Job).where(Job.asset_id == asset_id)).one()
            count = len(db.scalars(select(Event).where(Event.asset_id == asset_id)).all())
            job.status = "partial" if count else "failed"
            job.error, job.stage, job.finished = safe, "Analysis interrupted", now()
            job.elapsed_ms = int((time.monotonic() - start) * 1000)
            db.get(Asset, asset_id).status = job.status
            db.add(
                ModelRun(
                    asset_id=asset_id,
                    provider="meta-standard" if real else "local",
                    model="pipeline",
                    status="failed",
                    routing="Pipeline interrupted; existing results preserved",
                    raw={"error": safe},
                )
            )
        audit(owner, "video.processing_failed", asset_id, {"reason": safe})


def seed_demo(owner_id):
    from .db import uid

    with demo_lock:
        with DB() as db:
            existing = db.scalars(select(Asset).where(Asset.owner_id == owner_id, Asset.synthetic.is_(True))).all()
        if existing:
            return [a.id for a in existing]
        ids = []
        for i, camera in enumerate(CAMERAS):
            folder = config.DATA / uid()
            path = generate(folder, i)
            asset = ingest(
                path, owner_id, f"Warehouse ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â· {camera}", camera, True
            )
            process(asset.id)
            ids.append(asset.id)
        return ids
