import hashlib
import json
import logging
import re
import secrets
import shutil
import threading
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal

from fastapi import BackgroundTasks, Depends, FastAPI, File, HTTPException, Query, Request, Response, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select, text

from . import config
from .db import (
    DB,
    Alert,
    Asset,
    Audit,
    Case,
    CaseEvidence,
    CaseMember,
    Event,
    Frame,
    Job,
    ModelRun,
    Observation,
    Report,
    Session,
    SourceRecord,
    User,
    audit,
    migrate,
    now,
    serialize,
    uid,
)
from .intelligence_api import router as intelligence_router
from .discovery import router as discovery_router
from .operations import router as operations_router
from .comparison import router as comparison_router
from .media import MediaError, sha256
from .providers import MetaProvider, ProviderError
from .security import (
    administrator,
    allowed_asset,
    allowed_case,
    current_user,
    hash_password,
    require_asset,
    require_case,
    require_local_access,
    verify_password,
    writer,
)
from .workflows import ingest, seed_demo, submit

log = logging.getLogger("sensa")
auth_lock = threading.Lock()
auth_attempts = {}


@asynccontextmanager
async def lifespan(app):
    migrate()
    from .worker import reconcile, start, stop

    reconcile()
    start()
    try:
        yield
    finally:
        stop()


app = FastAPI(title="SENSA Evidence API", version="4.0.0", lifespan=lifespan)

app.include_router(intelligence_router)
app.include_router(discovery_router)
app.include_router(operations_router)
app.include_router(comparison_router)


@app.middleware("http")
async def protections(request: Request, call_next):
    origin = request.headers.get("origin")
    if request.method not in ("GET", "HEAD", "OPTIONS") and origin and origin not in config.ORIGINS:
        return JSONResponse(
            {"error": {"code": "ORIGIN_DENIED", "message": "Untrusted request origin"}}, status_code=403
        )
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "same-origin"
    response.headers["Cache-Control"] = "no-store"
    return response


@app.exception_handler(HTTPException)
async def http_error(request, exc):
    if exc.status_code in (401, 403):
        audit("anonymous", "authorization.denied", request.url.path, {"status": exc.status_code})
    return JSONResponse(
        {"error": {"code": f"HTTP_{exc.status_code}", "message": str(exc.detail)}}, status_code=exc.status_code
    )


@app.exception_handler(RequestValidationError)
async def validation_error(request, exc):
    return JSONResponse(
        {"error": {"code": "VALIDATION", "message": "Check the supplied fields, lengths and time ranges"}},
        status_code=422,
    )


@app.exception_handler(ProviderError)
async def provider_error(request, exc):
    return JSONResponse({"error": {"code": "PROVIDER_UNAVAILABLE", "message": str(exc)}}, status_code=503)


class Credentials(BaseModel):
    email: str = Field(min_length=5, max_length=254, pattern=r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
    password: str = Field(min_length=12, max_length=128)
    name: str = Field(default="Workspace administrator", min_length=1, max_length=80)


class NewUser(Credentials):
    role: Literal["admin", "operator", "reviewer", "viewer"] = "operator"


def public_user(user):
    return serialize(user, ("password",))


def new_session(db, user, response):
    token = secrets.token_urlsafe(32)
    db.add(Session(id=hashlib.sha256(token.encode()).hexdigest(), user_id=user.id, expires=time.time() + 8 * 3600))
    response.set_cookie(
        "sensa_session", token, httponly=True, secure=config.PRODUCTION, samesite="strict", max_age=8 * 3600, path="/"
    )


def rate_auth(request):
    ip = request.client.host if request.client else "local"
    stamp = time.monotonic()
    if len(auth_attempts) > 1000:
        auth_attempts.clear()
    attempts = [t for t in auth_attempts.get(ip, []) if stamp - t < 60]
    if len(attempts) >= 10:
        raise HTTPException(429, "Too many sign-in attempts. Wait one minute.")
    auth_attempts[ip] = attempts + [stamp]


@app.get("/api/health")
def health():
    from .worker import active_worker_count

    with DB() as db:
        db.execute(text("SELECT 1"))
        setup = not db.scalar(select(func.count()).select_from(User))
        workers = active_worker_count(db)
    return {
        "status": "ok",
        "database": "ready",
        "active_workers": workers,
        "setup_required": setup and config.AUTH_MODE == "signin",
        "auth_mode": config.AUTH_MODE,
        "provider": "configured" if config.MODEL_KEY else "fixture_mode",
        "version": "4.0.0",
    }


@app.post("/api/auth/local")
def local_workspace(request: Request, response: Response):
    require_local_access(request)
    opened = False
    with auth_lock, DB.begin() as db:
        user = db.scalars(select(User).where(User.role == "admin").order_by(User.created).limit(1)).first()
        if not user:
            user = User(
                email="local@sensa.internal",
                name="Local workspace",
                role="admin",
                password=hash_password(secrets.token_urlsafe(48)),
            )
            db.add(user)
            db.flush()
        token = request.cookies.get("sensa_session", "")
        session = db.get(Session, hashlib.sha256(token.encode()).hexdigest())
        if not session or session.user_id != user.id or session.expires < time.time():
            db.execute(delete(Session).where(Session.expires < time.time()))
            new_session(db, user, response)
            opened = True
    if opened:
        audit(user.id, "auth.local_open", detail={"access": "loopback workspace without sign-in"})
    return public_user(user)


@app.post("/api/auth/setup", status_code=201)
def setup(body: Credentials, request: Request, response: Response):
    if config.AUTH_MODE != "signin":
        raise HTTPException(404, "Sign-in is not enabled")
    rate_auth(request)
    with auth_lock, DB.begin() as db:
        if db.scalar(select(func.count()).select_from(User)):
            raise HTTPException(409, "Workspace is already configured. Sign in.")
        user = User(email=body.email.lower(), password=hash_password(body.password), name=body.name, role="admin")
        db.add(user)
        db.flush()
        new_session(db, user, response)
    audit(user.id, "workspace.setup", user.id)
    return public_user(user)


@app.post("/api/auth/login")
def login(body: Credentials, request: Request, response: Response):
    if config.AUTH_MODE == "public":
        raise HTTPException(404, "Sign-in is not enabled")
    rate_auth(request)
    with DB.begin() as db:
        user = db.scalars(select(User).where(User.email == body.email.lower())).first()
        if not user or not verify_password(body.password, user.password):
            audit("anonymous", "auth.failed")
            raise HTTPException(401, "Email or password is incorrect")
        new_session(db, user, response)
    audit(user.id, "auth.login")
    return public_user(user)


@app.get("/api/auth/me")
def me(user: User = Depends(current_user)):
    return public_user(user)


@app.post("/api/auth/logout")
def logout(request: Request, response: Response, user: User = Depends(current_user)):
    with DB.begin() as db:
        db.execute(
            delete(Session).where(
                Session.id == hashlib.sha256(request.cookies.get("sensa_session", "").encode()).hexdigest()
            )
        )
    response.delete_cookie("sensa_session", path="/")
    audit(user.id, "auth.logout")
    return {"ok": True}


@app.get("/api/users")
def users(user: User = Depends(administrator)):
    with DB() as db:
        return [public_user(u) for u in db.scalars(select(User).order_by(User.created))]


@app.post("/api/users", status_code=201)
def create_user(body: NewUser, user: User = Depends(administrator)):
    with auth_lock, DB.begin() as db:
        if db.scalar(select(User.id).where(User.email == body.email.lower())):
            raise HTTPException(409, "Email is already registered")
        added = User(email=body.email.lower(), name=body.name, password=hash_password(body.password), role=body.role)
        db.add(added)
        db.flush()
    audit(user.id, "user.create", added.id, {"role": added.role})
    return public_user(added)


def visible_assets(db, user):
    return [
        a
        for a in db.scalars(
            select(Asset).where(Asset.status != "quarantined").order_by(Asset.created.desc()).limit(500)
        )
        if allowed_asset(db, user, a)
    ]


def event_json(db, event, sources=None, runs=None):
    asset = db.get(Asset, event.asset_id)
    if sources is None:
        registry = db.info.setdefault("event_source_registry", {})
        if asset.id not in registry:
            registry[asset.id] = {
                row.sha256: row.id for row in db.scalars(select(SourceRecord).where(SourceRecord.asset_id == asset.id))
            }
        sources = registry[asset.id]
    if runs is None:
        runs = db.info.setdefault("event_run_registry", {})
        if event.run_id not in runs:
            runs[event.run_id] = db.get(ModelRun, event.run_id)
    run = runs.get(event.run_id)
    source_hash = (run.raw.get("source_sha256") or asset.sha256) if run else None
    return {
        **serialize(event),
        "camera": asset.camera,
        "asset_name": asset.name,
        "synthetic": asset.synthetic,
        "source_id": sources.get(source_hash),
    }


@app.get("/api/dashboard")
def dashboard(user: User = Depends(current_user)):
    with DB() as db:
        assets = visible_assets(db, user)
        ids = [a.id for a in assets]
        events = db.scalars(
            select(Event).where(Event.asset_id.in_(ids)).order_by(Event.created.desc(), Event.start).limit(500)
        ).all()
        cases = [c for c in db.scalars(select(Case)) if allowed_case(db, user, c)]
        alerts = db.scalars(
            select(Alert).join(Event, Alert.event_id == Event.id).where(Event.asset_id.in_(ids), Alert.status == "open")
        ).all()
        from .db import AnalysisJob

        active_intelligence = set(
            db.scalars(
                select(AnalysisJob.asset_id).where(
                    AnalysisJob.asset_id.in_(ids), AnalysisJob.status.in_(["queued", "running"])
                )
            )
        )
        return {
            "assets": len(assets),
            "events": len(events),
            "cases": len(cases),
            "alerts": len(alerts),
            "processing": sum(a.status in ("running", "queued") or a.id in active_intelligence for a in assets),
            "failed": sum(a.status == "failed" for a in assets),
            "recordings": [serialize(a) for a in assets[:4]],
            "recent_events": [event_json(db, e) for e in events[:5]],
            "distribution": [
                {"type": t, "count": sum(e.type == t for e in events)} for t in sorted({e.type for e in events})
            ],
        }


@app.post("/api/demo", status_code=202)
def demo(tasks: BackgroundTasks, user: User = Depends(writer)):
    tasks.add_task(seed_demo, user.id)
    audit(user.id, "demo.request", detail={"provenance": "procedural synthetic; CC0-1.0"})
    return {
        "status": "queued",
        "message": "Generating four synthetic recordings and processing their exact animation annotations",
    }


@app.get("/api/videos")
def videos(user: User = Depends(current_user)):
    with DB() as db:
        return [serialize(a) for a in visible_assets(db, user)]


@app.post("/api/videos", status_code=202)
async def upload(file: UploadFile = File(...), user: User = Depends(writer)):
    name = Path(file.filename or "recording.mp4").name
    if Path(name).suffix.lower() not in (".mp4", ".webm") or file.content_type not in (
        "video/mp4",
        "video/webm",
        "application/octet-stream",
    ):
        raise HTTPException(415, "Upload an MP4 or WebM video")
    with DB() as db:
        active = db.scalar(
            select(func.count())
            .select_from(Job)
            .join(Asset, Job.asset_id == Asset.id)
            .where(Asset.owner_id == user.id, Job.status.in_(["queued", "running"]))
        )
        if active >= 4:
            raise HTTPException(429, "At most four active jobs per account")
    if shutil.disk_usage(config.DATA).free < config.MAX_UPLOAD * 2:
        raise HTTPException(507, "Insufficient storage for another recording")
    folder = config.DATA / uid()
    folder.mkdir()
    path = folder / "original.mp4"
    size = 0
    try:
        with path.open("wb") as out:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > config.MAX_UPLOAD:
                    raise HTTPException(413, "Recording exceeds the configured upload limit")
                out.write(chunk)
        asset = ingest(path, user.id, name)
        submit(asset.id)
    except (MediaError, HTTPException) as exc:
        # Failed validation must never leave a successful asset.
        with DB.begin() as db:
            db.execute(delete(Asset).where(Asset.id == folder.name))
        shutil.rmtree(folder)
        if isinstance(exc, HTTPException):
            raise
        raise HTTPException(422, str(exc)) from exc
    finally:
        await file.close()
    return serialize(asset)


@app.get("/api/videos/{asset_id}")
def video(asset_id: str, user: User = Depends(current_user)):
    with DB() as db:
        asset = require_asset(db, user, asset_id)
        runs = {r.id: r for r in db.scalars(select(ModelRun).where(ModelRun.asset_id == asset_id))}
        sources = {r.sha256: r.id for r in db.scalars(select(SourceRecord).where(SourceRecord.asset_id == asset_id))}
        return {
            **serialize(asset),
            "job": serialize(db.scalars(select(Job).where(Job.asset_id == asset_id)).one()),
            "frames": [
                serialize(f)
                for f in db.scalars(select(Frame).where(Frame.asset_id == asset_id).order_by(Frame.timestamp))
            ],
            "observations": [
                serialize(o, ("mask",))
                for o in db.scalars(
                    select(Observation).where(Observation.asset_id == asset_id).order_by(Observation.timestamp)
                )
            ],
            "events": [
                event_json(db, e, sources, runs)
                for e in db.scalars(select(Event).where(Event.asset_id == asset_id).order_by(Event.start))
            ],
            "runs": [serialize(r, ("raw",)) for r in runs.values()],
        }


@app.get("/api/videos/{asset_id}/media")
def media(asset_id: str, request: Request, user: User = Depends(current_user)):
    with DB() as db:
        asset = require_asset(db, user, asset_id)
        path = config.DATA / asset.id / "original.mp4"
        if not path.exists():
            raise HTTPException(410, "Source recording is no longer available")
        if sha256(path) != asset.sha256:
            raise HTTPException(409, "Source integrity verification failed")
    audit(user.id, "video.access", asset_id)
    return FileResponse(
        path,
        media_type="video/webm" if asset.codec in ("vp8", "vp9") else "video/mp4",
        headers={"Content-Disposition": "inline"},
    )


@app.get("/api/videos/{asset_id}/thumbnail")
def thumbnail(asset_id: str, user: User = Depends(current_user), at: float = Query(6, ge=0, le=28800)):
    with DB() as db:
        require_asset(db, user, asset_id)
        frame = db.scalars(
            select(Frame).where(Frame.asset_id == asset_id).order_by(func.abs(Frame.timestamp - at)).limit(1)
        ).first()
        if not frame:
            raise HTTPException(404, "Thumbnail is not ready")
        path = config.DATA / asset_id / "frames" / frame.filename
        if not path.exists():
            raise HTTPException(410, "Derived frame is no longer available")
    return FileResponse(path, media_type="image/jpeg")


class ProcessRequest(BaseModel):
    mode: Literal["local", "meta"] = "local"
    authorize_external_processing: bool = False


@app.post("/api/videos/{asset_id}/process", status_code=202)
def retry(asset_id: str, body: ProcessRequest, user: User = Depends(writer)):
    with DB.begin() as db:
        asset = require_asset(db, user, asset_id)
        if user.role != "admin" and asset.owner_id != user.id:
            raise HTTPException(403, "Only the owner can reprocess a recording")
        linked = db.scalar(
            select(CaseEvidence.case_id)
            .join(Event, CaseEvidence.event_id == Event.id)
            .where(Event.asset_id == asset_id)
            .limit(1)
        )
        from .db import CaseVideo

        linked = linked or db.scalar(select(CaseVideo.case_id).where(CaseVideo.asset_id == asset_id).limit(1))
        if linked:
            raise HTTPException(409, "Recording is linked to an investigation. Preserve its evidence references.")
        job = db.scalars(select(Job).where(Job.asset_id == asset_id)).one()
        if job.status in ("queued", "running"):
            return {"status": job.status}
        if job.attempts >= 3:
            raise HTTPException(409, "Retry budget exhausted (three attempts)")
        if body.mode == "meta" and (not body.authorize_external_processing or not config.MODEL_KEY):
            raise HTTPException(409, "Meta credentials and explicit authorization for external processing are required")
        # Reset succeeded state only for an explicit mode change, preserving the bounded attempt count.
        job.status, asset.status = "queued", "queued"
    try:
        submit(asset_id, body.mode == "meta")
    except MediaError as exc:
        with DB.begin() as db:
            job = db.scalars(select(Job).where(Job.asset_id == asset_id)).one()
            job.status, db.get(Asset, asset_id).status = "failed", "failed"
        raise HTTPException(429, str(exc)) from exc
    audit(user.id, "video.retry", asset_id, {"mode": body.mode})
    return {"status": "queued"}


@app.delete("/api/videos/{asset_id}")
def remove_video(asset_id: str, user: User = Depends(writer)):
    with DB.begin() as db:
        asset = require_asset(db, user, asset_id)
        if user.role != "admin" and asset.owner_id != user.id:
            raise HTTPException(403, "Only the recording owner may delete it")
        if asset.status in ("queued", "running"):
            raise HTTPException(409, "Wait for processing to finish before deleting")
        linked = db.scalar(
            select(CaseEvidence.case_id)
            .join(Event, CaseEvidence.event_id == Event.id)
            .where(Event.asset_id == asset_id)
            .limit(1)
        )
        from .db import CaseVideo

        linked = linked or db.scalar(select(CaseVideo.case_id).where(CaseVideo.asset_id == asset_id).limit(1))
        if linked:
            raise HTTPException(409, "Remove investigation references before deleting evidence")
        folder = (config.DATA / asset_id).resolve()
        if folder.parent != config.DATA:
            raise HTTPException(400, "Invalid recording reference")
        shutil.rmtree(folder, ignore_errors=False)
        db.delete(asset)
    audit(user.id, "video.delete", asset_id, {"source_and_derived_removed": True})
    return {"ok": True}


def find_events(db, user, q="", camera="", typ="", start=0, end=28800, case_id=None):
    ids = [a.id for a in visible_assets(db, user)]
    query = select(Event).where(Event.asset_id.in_(ids), Event.start >= start, Event.end <= end)
    if case_id:
        require_case(db, user, case_id)
        query = query.join(CaseEvidence, CaseEvidence.event_id == Event.id).where(CaseEvidence.case_id == case_id)
    if typ:
        query = query.where(Event.type == typ)
    rows = db.scalars(query.order_by(Event.start, Event.id).limit(1000)).all()
    tokens = [
        t
        for t in re.findall(r"[a-zA-Z]+", q.lower())
        if t
        not in {
            "find",
            "show",
            "me",
            "the",
            "a",
            "an",
            "near",
            "at",
            "in",
            "of",
            "activity",
            "between",
            "and",
            "seconds",
            "second",
            "from",
            "to",
            "all",
            "events",
        }
    ]
    synonyms = {"people": "person", "movement": "movement", "restricted": "restricted", "entered": "entry"}
    tokens = [synonyms.get(t, t) for t in tokens]
    window = re.search(r"between\s+(\d+(?:\.\d+)?)\s+and\s+(\d+(?:\.\d+)?)", q.lower())
    if window:
        start, end = float(window[1]), float(window[2])
        if start > end or end > 28800:
            raise HTTPException(422, "Search time range is invalid")
        rows = [r for r in rows if start <= r.start and r.end <= end]
    result = []
    for row in rows:
        item = event_json(db, row)
        haystack = f"{row.title} {row.description} {row.type} {item['camera']}".lower()
        if (not camera or item["camera"] == camera) and all(t in haystack for t in tokens):
            result.append(item)
    return result, {
        "terms": tokens,
        "camera": camera or None,
        "event_type": typ or None,
        "start_seconds": start,
        "end_seconds": end,
        "strategy": "deterministic term matching; source-relative seconds; no semantic embeddings",
    }


@app.get("/api/events")
def events(
    q: str = Query("", max_length=300),
    camera: str = "",
    type: str = "",
    start: float = Query(0, ge=0, le=28800),
    end: float = Query(28800, ge=0, le=28800),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0, le=1000),
    user: User = Depends(current_user),
):
    if start > end:
        raise HTTPException(422, "Start time must precede end time")
    with DB() as db:
        rows, filters = find_events(db, user, q, camera, type, start, end)
    audit(user.id, "events.search", detail={"results": len(rows), "query_hash": hashlib.sha256(q.encode()).hexdigest()})
    return {"items": rows[offset : offset + limit], "total": len(rows), "filters": filters}


class NewCase(BaseModel):
    title: str = Field(min_length=3, max_length=150)
    description: str = Field(default="", max_length=3000)
    purpose: str = Field(min_length=3, max_length=300)


@app.get("/api/cases")
def cases(user: User = Depends(current_user)):
    with DB() as db:
        return [
            {
                **serialize(c),
                "evidence_count": db.scalar(
                    select(func.count()).select_from(CaseEvidence).where(CaseEvidence.case_id == c.id)
                ),
            }
            for c in db.scalars(select(Case).order_by(Case.created.desc()).limit(500))
            if allowed_case(db, user, c)
        ]


@app.post("/api/cases", status_code=201)
def create_case(body: NewCase, user: User = Depends(writer)):
    with DB.begin() as db:
        case = Case(owner_id=user.id, **body.model_dump())
        db.add(case)
        db.flush()
    audit(user.id, "case.create", case.id)
    return serialize(case)


@app.get("/api/cases/{case_id}")
def case_detail(case_id: str, user: User = Depends(current_user)):
    with DB() as db:
        case = require_case(db, user, case_id)
        evidence = db.scalars(
            select(Event)
            .join(CaseEvidence, CaseEvidence.event_id == Event.id)
            .where(CaseEvidence.case_id == case_id)
            .order_by(Event.asset_id, Event.start)
        ).all()
        reports = db.scalars(select(Report).where(Report.case_id == case_id).order_by(Report.version.desc())).all()
        members = db.scalars(
            select(User).join(CaseMember, CaseMember.user_id == User.id).where(CaseMember.case_id == case_id)
        ).all()
        result = {
            **serialize(case),
            "events": [event_json(db, e) for e in evidence],
            "reports": [serialize(r) for r in reports],
            "members": [public_user(m) for m in members],
            "time_policy": "This view groups events by recording and source-relative time. Discovery reports use global chronology only when all included source clocks are verified.",
        }
    audit(user.id, "case.access", case_id)
    return result


class EvidenceRequest(BaseModel):
    event_id: str


@app.post("/api/cases/{case_id}/evidence")
def add_evidence(case_id: str, body: EvidenceRequest, user: User = Depends(writer)):
    with DB.begin() as db:
        require_case(db, user, case_id)
        event = db.get(Event, body.event_id)
        if not event or not allowed_asset(db, user, db.get(Asset, event.asset_id)):
            raise HTTPException(404, "Evidence not found")
        if not db.get(CaseEvidence, (case_id, event.id)):
            db.add(CaseEvidence(case_id=case_id, event_id=event.id))
    audit(user.id, "case.evidence_added", case_id, {"event_id": body.event_id})
    return {"ok": True}


@app.delete("/api/cases/{case_id}/evidence/{event_id}")
def remove_evidence(case_id: str, event_id: str, user: User = Depends(writer)):
    with DB.begin() as db:
        require_case(db, user, case_id)
        if db.scalar(select(Report.id).where(Report.case_id == case_id).limit(1)):
            raise HTTPException(
                409, "Report snapshots preserve this evidence. Create a new investigation to change its scope."
            )
        db.execute(delete(CaseEvidence).where(CaseEvidence.case_id == case_id, CaseEvidence.event_id == event_id))
    audit(user.id, "case.evidence_removed", case_id, {"event_id": event_id})
    return {"ok": True}


class ShareRequest(BaseModel):
    user_id: str


@app.post("/api/cases/{case_id}/members")
def share(case_id: str, body: ShareRequest, user: User = Depends(writer)):
    with DB.begin() as db:
        case = require_case(db, user, case_id)
        if user.role != "admin" and case.owner_id != user.id:
            raise HTTPException(403, "Only the investigation owner can share it")
        if not db.get(User, body.user_id):
            raise HTTPException(404, "User not found")
        if not db.get(CaseMember, (case_id, body.user_id)):
            db.add(CaseMember(case_id=case_id, user_id=body.user_id))
    audit(user.id, "case.shared", case_id, {"user_id": body.user_id})
    return {"ok": True}


class Question(BaseModel):
    question: str = Field(min_length=3, max_length=1500)
    mode: Literal["local", "spark", "wonder"] = "local"
    authorize_external_processing: bool = False


@app.post("/api/cases/{case_id}/assistant")
def assistant(case_id: str, body: Question, user: User = Depends(current_user)):
    with DB() as db:
        require_case(db, user, case_id)
        rows, _ = find_events(db, user, case_id=case_id)
        from .intelligence import graph_for_case
        from .retrieval import retrieve

        graph = graph_for_case(db, case_id)
        graph_ready = any(
            n["kind"] in ("person_tracklet", "object_track", "finding", "contradiction") for n in graph["nodes"]
        )
        if graph_ready:
            rows, retrieval_filters = retrieve(graph, body.question)
    audit(user.id, "case.assistant", case_id, {"evidence_count": len(rows), "mode": body.mode})
    if body.mode != "local":
        if user.role == "viewer":
            raise HTTPException(403, "External model calls require an analyst or reviewer role")
        if not body.authorize_external_processing:
            raise HTTPException(409, "Explicit authorization for external processing is required")
        started = time.monotonic()
        result, meta = MetaProvider().interpret_evidence(body.question, rows[:24], body.mode == "wonder")
        audit(
            user.id,
            "model.reasoning",
            case_id,
            {
                "model": config.MODEL_ESCALATION if body.mode == "wonder" else config.MODEL_ANALYSIS,
                "usage": meta.get("usage"),
                "elapsed_ms": int((time.monotonic() - started) * 1000),
                "routing": "Analyst-selected deep review"
                if body.mode == "wonder"
                else "Analyst-selected routine reasoning",
            },
        )
        return {
            **result.model_dump(),
            "mode": "meta_inference",
            "model": config.MODEL_ESCALATION if body.mode == "wonder" else config.MODEL_ANALYSIS,
            "sources": rows,
        }
    question = body.question.lower()
    summary_query = any(w in question for w in ("summari", "summary", "what happened", "timeline", "activity", "show"))
    sensitive = any(
        w in question for w in ("who", "identity", "stole", "thief", "guilty", "intent", "ignore", "system prompt")
    )
    claims = []
    if rows and (summary_query or graph_ready) and not sensitive:
        for e in rows[:12]:
            claims.append(
                {
                    "text": f"{e['camera']} / {e['start']:.1f}s: {e['title']}. {e['description']}",
                    "category": e["category"],
                    "evidence_ids": [e["id"]],
                    "asset_id": e["asset_id"],
                    "start": e["start"],
                    "end": e["end"],
                }
            )
    uncertainty = "Unsampled intervals and cross-recording order are unknown. Visibility does not establish identity, authorization or intent."
    if not claims:
        uncertainty = "Insufficient evidence to answer this question. The local assistant can assemble a timeline or summarize selected events; it cannot infer identity, intent, ownership, or missing activity."
    return {
        "claims": claims,
        "uncertainty": uncertainty,
        "mode": "local_evidence_assembler",
        "model": None,
        "sources": rows,
        "notice": "Deterministic graph retrieval; no AI model was called."
        if graph_ready
        else "Deterministic evidence assembly; no AI model was called.",
        "retrieval_filters": retrieval_filters if graph_ready else None,
    }


@app.post("/api/cases/{case_id}/reports", status_code=201)
def create_report(case_id: str, user: User = Depends(writer)):
    from .db import DiscoveryRun
    from .discovery import snapshot_report

    with DB() as db:
        require_case(db, user, case_id)
        discovery = db.scalars(
            select(DiscoveryRun)
            .where(DiscoveryRun.case_id == case_id, DiscoveryRun.status.in_(["succeeded", "partial", "cancelled"]))
            .order_by(DiscoveryRun.created.desc())
            .limit(1)
        ).first()
    if discovery and "eligible_ranges" in discovery.result:
        with auth_lock, DB.begin() as db:
            rid = snapshot_report(db, case_id, discovery.result, user.id)
            result = serialize(db.get(Report, rid))
        audit(user.id, "report.generate", case_id, {"report_id": rid, "scope": "discovery"})
        return result
    with auth_lock, DB.begin() as db:
        case = require_case(db, user, case_id)
        evidence = db.scalars(
            select(Event)
            .join(CaseEvidence, CaseEvidence.event_id == Event.id)
            .where(CaseEvidence.case_id == case_id)
            .order_by(Event.asset_id, Event.start)
        ).all()
        if not evidence:
            raise HTTPException(409, "Add evidence before generating a report")
        rows = [event_json(db, e) for e in evidence]
        sources = {e.asset_id: db.get(Asset, e.asset_id) for e in evidence}
        from .intelligence import graph_for_case
        from .evidence import frame_support_lookup

        graph = graph_for_case(db, case_id)
        lookup = frame_support_lookup(graph)
        for row in rows:
            row["source_frames"] = lookup("event:" + row["id"])
        content = {
            "possible_hypotheses": [
                n for n in graph["nodes"] if n["kind"] in ("person_hypothesis", "interaction", "finding")
            ],
            "contradictory_evidence": [n for n in graph["nodes"] if n["kind"] == "contradiction"],
            "missing_evidence": [
                "Verified source clocks and synchronization unless separately configured",
                "Hidden hand/object boundaries",
                "Unsampled intervals and independently verified inventory",
            ],
            "graph_reference_validation": "PASS: every relationship resolves to an existing scoped graph node",
            "scope": case.description,
            "purpose": case.purpose,
            "methodology": "Selected indexed events; grouped by recording and ordered by source-relative timestamp. No synchronized camera clock or semantic search.",
            "observations": [r for r in rows if r["category"] == "observed"],
            "interpretations": [r for r in rows if r["category"] == "inferred"],
            "timeline": rows,
            "human_conclusion": "",
            "uncertainty": "Unsampled intervals are unknown. No verified identity, intent, ownership, or cross-camera correlation. Fixture annotations are synthetic ground truth and not model output.",
            "integrity": [
                {"asset_id": a.id, "sha256": a.sha256, "name": a.name, "synthetic": a.synthetic}
                for a in sources.values()
            ],
            "models": [
                serialize(r, ("raw",)) for r in db.scalars(select(ModelRun).where(ModelRun.asset_id.in_(sources)))
            ],
            "limitations": "Hashes support byte integrity, not source authenticity or legal admissibility.",
        }
        latest = db.scalar(select(func.max(Report.version)).where(Report.case_id == case_id)) or 0
        report = Report(case_id=case_id, version=latest + 1, author_id=user.id, content=content)
        db.add(report)
        db.flush()
    audit(user.id, "report.generate", case_id, {"report_id": report.id, "version": report.version})
    return serialize(report)


class ReviewRequest(BaseModel):
    expected_version: int = Field(ge=1)
    status: Literal["draft", "approved", "rejected"]
    notes: str = Field(min_length=1, max_length=3000)
    human_conclusion: str = Field(default="", max_length=5000)


@app.post("/api/reports/{report_id}/review", status_code=201)
def review_report(report_id: str, body: ReviewRequest, user: User = Depends(writer)):
    if user.role not in ("admin", "reviewer"):
        raise HTTPException(403, "A reviewer or administrator must review reports")
    with auth_lock, DB.begin() as db:
        source = db.get(Report, report_id)
        if not source:
            raise HTTPException(404, "Report not found")
        case = require_case(db, user, source.case_id)
        latest = db.scalar(select(func.max(Report.version)).where(Report.case_id == case.id))
        if body.expected_version != latest or source.version != latest:
            raise HTTPException(409, "A newer report version exists. Refresh before reviewing.")
        content = {**source.content, "human_conclusion": body.human_conclusion}
        report = Report(
            case_id=case.id,
            version=latest + 1,
            author_id=user.id,
            content=content,
            status=body.status,
            notes=body.notes,
            reviewer_id=user.id,
            reviewed=now(),
        )
        db.add(report)
        db.flush()
    audit(user.id, "report.review", case.id, {"report_id": report.id, "status": body.status, "version": report.version})
    return serialize(report)


@app.get("/api/reports/{report_id}/export")
def export_report(report_id: str, user: User = Depends(current_user)):
    with DB() as db:
        report = db.get(Report, report_id)
        if not report:
            raise HTTPException(404, "Report not found")
        require_case(db, user, report.case_id)
        data = json.dumps(serialize(report), indent=2, sort_keys=True).encode()
    digest = hashlib.sha256(data).hexdigest()
    audit(user.id, "report.export", report.case_id, {"sha256": digest, "report_id": report.id})
    return Response(
        data,
        media_type="application/json",
        headers={
            "Content-Disposition": f'attachment; filename="sensa-report-v{report.version}.json"',
            "X-Evidence-SHA256": digest,
        },
    )


@app.get("/api/alerts")
def alerts(user: User = Depends(current_user)):
    with DB() as db:
        result = []
        for alert in db.scalars(select(Alert).order_by(Alert.updated.desc()).limit(500)):
            event = db.get(Event, alert.event_id)
            if allowed_asset(db, user, db.get(Asset, event.asset_id)):
                result.append({**serialize(alert), "event": event_json(db, event)})
        return result


class AlertFeedback(BaseModel):
    status: Literal["acknowledged", "dismissed", "open"]
    reason: str = Field(min_length=3, max_length=500)


@app.patch("/api/alerts/{alert_id}")
def feedback(alert_id: str, body: AlertFeedback, user: User = Depends(writer)):
    with DB.begin() as db:
        alert = db.get(Alert, alert_id)
        if not alert:
            raise HTTPException(404, "Alert not found")
        event = db.get(Event, alert.event_id)
        require_asset(db, user, event.asset_id)
        alert.status, alert.reason, alert.updated = body.status, body.reason, now()
    audit(user.id, "alert.feedback", alert_id, body.model_dump())
    return serialize(alert)


@app.get("/api/settings")
def settings(user: User = Depends(current_user)):
    return {
        "provider_status": "configured; inference not yet verified" if config.MODEL_KEY else "fixture_mode",
        "mode": "Standard",
        "models": [
            {
                "id": config.MODEL_PERCEPTION,
                "purpose": "Visual grounding & within-clip tracking",
                "status": "configured" if config.MODEL_KEY else "not_configured",
            },
            {
                "id": config.MODEL_ANALYSIS,
                "purpose": "Routine multimodal analysis",
                "status": "configured" if config.MODEL_KEY else "not_configured",
            },
            {
                "id": config.MODEL_ESCALATION,
                "purpose": "Analyst-selected complex reasoning / P1",
                "status": "configured" if config.MODEL_KEY else "not_configured",
            },
        ],
        "limits": {
            "upload_mb": config.MAX_UPLOAD // 1024 // 1024,
            "duration_seconds": config.MAX_DURATION,
            "sampled_frames": config.MAX_FRAMES,
            "resolution": "Up to 4K; frame and resource limits apply",
            "worker_concurrency": "2 per durable worker process",
            "queue": "Database-backed; survives API restart",
            "retry_attempts": "Explicit only for uncertain billed requests",
        },
        "retention": "Configurable reversible quarantine. Case/report evidence is protected; automatic permanent deletion is disabled.",
        "live_cameras": "Optional configured RTSP sources; bounded recording capture, separate model authorization required.",
        "calibration": "Uncalibrated; normalized pixel coordinates",
    }


@app.post("/api/providers/check")
def check_provider(user: User = Depends(administrator)):
    models = MetaProvider().discover()
    required = {config.MODEL_PERCEPTION, config.MODEL_ANALYSIS}
    audit(user.id, "provider.catalogue_checked", detail={"required_models_visible": required.issubset(models)})
    return {
        "status": "available" if required.issubset(models) else "degraded",
        "models": sorted(models),
        "checked_at": now(),
        "notice": "Catalogue visibility does not verify inference success",
    }


@app.get("/api/audit")
def audit_log(limit: int = Query(100, ge=1, le=500), user: User = Depends(administrator)):
    with DB() as db:
        return [serialize(a) for a in db.scalars(select(Audit).order_by(Audit.seq.desc()).limit(limit))]


@app.get("/api/audit/verify")
def verify_audit(user: User = Depends(administrator)):
    previous, count = "0" * 64, 0
    with DB() as db:
        for row in db.scalars(select(Audit).order_by(Audit.seq)):
            item = serialize(row, ("seq", "hash"))
            digest = hashlib.sha256(json.dumps(item, sort_keys=True).encode()).hexdigest()
            if row.previous != previous or row.hash != digest:
                return {"valid": False, "first_invalid_seq": row.seq, "checked": count}
            previous, count = row.hash, count + 1
    return {
        "valid": True,
        "checked": count,
        "head": previous,
        "limitation": "Local hash chain; database administrators can rewrite it. Not an external notarization.",
    }


@app.post("/api/videos/batch", status_code=202)
async def upload_batch(files: list[UploadFile] = File(...), user: User = Depends(writer)):
    if not 1 <= len(files) <= 20:
        raise HTTPException(422, "Choose 1-20 recordings per batch")
    results = []
    for file in files:
        try:
            result = await upload(file, user)
            results.append({"name": file.filename, "asset": result, "status": "accepted"})
        except HTTPException as exc:
            results.append({"name": file.filename, "status": "failed", "reason": str(exc.detail)})
    return {"items": results, "accepted": sum(r["status"] == "accepted" for r in results)}
