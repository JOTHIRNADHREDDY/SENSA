import hashlib
import json
import threading
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    JSON,
    Boolean,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    create_engine,
    event,
    select,
    text,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

from .config import DATABASE_URL


def uid():
    return str(uuid.uuid4())


def now():
    return datetime.now(timezone.utc).isoformat()


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(primary_key=True, default=uid)
    email: Mapped[str] = mapped_column(String(254), unique=True)
    name: Mapped[str] = mapped_column(String(80))
    password: Mapped[str] = mapped_column(Text)
    role: Mapped[str] = mapped_column(String(20), default="operator")
    created: Mapped[str] = mapped_column(default=now)


class Session(Base):
    __tablename__ = "sessions"
    id: Mapped[str] = mapped_column(primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    expires: Mapped[float] = mapped_column(Float)


class Asset(Base):
    __tablename__ = "video_assets"
    id: Mapped[str] = mapped_column(primary_key=True, default=uid)
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    camera: Mapped[str] = mapped_column(String(80), default="Uploaded recording")
    sha256: Mapped[str] = mapped_column(String(64), index=True)
    size: Mapped[int] = mapped_column(Integer)
    duration: Mapped[float] = mapped_column(Float)
    width: Mapped[int] = mapped_column(Integer)
    height: Mapped[int] = mapped_column(Integer)
    fps: Mapped[float] = mapped_column(Float)
    codec: Mapped[str] = mapped_column(String(30))
    status: Mapped[str] = mapped_column(String(20), default="queued", index=True)
    synthetic: Mapped[bool] = mapped_column(Boolean, default=False)
    created: Mapped[str] = mapped_column(default=now)


class Job(Base):
    __tablename__ = "processing_jobs"
    id: Mapped[str] = mapped_column(primary_key=True, default=uid)
    asset_id: Mapped[str] = mapped_column(ForeignKey("video_assets.id", ondelete="CASCADE"), unique=True)
    status: Mapped[str] = mapped_column(default="queued")
    stage: Mapped[str] = mapped_column(default="Waiting for worker")
    progress: Mapped[int] = mapped_column(default=0)
    attempts: Mapped[int] = mapped_column(default=0)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    started: Mapped[str | None] = mapped_column(nullable=True)
    finished: Mapped[str | None] = mapped_column(nullable=True)
    elapsed_ms: Mapped[int | None] = mapped_column(nullable=True)


class Frame(Base):
    __tablename__ = "frames"
    id: Mapped[str] = mapped_column(primary_key=True, default=uid)
    asset_id: Mapped[str] = mapped_column(ForeignKey("video_assets.id", ondelete="CASCADE"), index=True)
    timestamp: Mapped[float] = mapped_column(Float)
    filename: Mapped[str] = mapped_column(String(40))
    __table_args__ = (UniqueConstraint("asset_id", "timestamp"),)


class ModelRun(Base):
    __tablename__ = "model_runs"
    id: Mapped[str] = mapped_column(primary_key=True, default=uid)
    asset_id: Mapped[str] = mapped_column(ForeignKey("video_assets.id", ondelete="CASCADE"), index=True)
    provider: Mapped[str] = mapped_column(String(30))
    model: Mapped[str] = mapped_column(String(80))
    status: Mapped[str] = mapped_column(String(20))
    routing: Mapped[str] = mapped_column(Text)
    elapsed_ms: Mapped[int] = mapped_column(default=0)
    usage: Mapped[dict] = mapped_column(JSON, default=dict)
    raw: Mapped[dict] = mapped_column(JSON, default=dict)
    created: Mapped[str] = mapped_column(default=now)


class Observation(Base):
    __tablename__ = "observations"
    id: Mapped[str] = mapped_column(primary_key=True, default=uid)
    asset_id: Mapped[str] = mapped_column(ForeignKey("video_assets.id", ondelete="CASCADE"), index=True)
    run_id: Mapped[str] = mapped_column(ForeignKey("model_runs.id", ondelete="CASCADE"))
    frame_id: Mapped[str | None] = mapped_column(ForeignKey("frames.id", ondelete="CASCADE"), nullable=True)
    timestamp: Mapped[float] = mapped_column(Float)
    label: Mapped[str] = mapped_column(String(100))
    track_id: Mapped[str | None] = mapped_column(String(50), nullable=True)
    box: Mapped[list] = mapped_column(JSON)
    mask: Mapped[str | None] = mapped_column(Text, nullable=True)
    provenance: Mapped[str] = mapped_column(String(30))


class Event(Base):
    __tablename__ = "events"
    id: Mapped[str] = mapped_column(primary_key=True, default=uid)
    asset_id: Mapped[str] = mapped_column(ForeignKey("video_assets.id", ondelete="CASCADE"), index=True)
    observation_id: Mapped[str | None] = mapped_column(ForeignKey("observations.id", ondelete="CASCADE"), nullable=True)
    run_id: Mapped[str] = mapped_column(ForeignKey("model_runs.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text)
    type: Mapped[str] = mapped_column(String(50), index=True)
    category: Mapped[str] = mapped_column(String(20), default="observed")
    severity: Mapped[str] = mapped_column(String(20), default="info")
    start: Mapped[float] = mapped_column(Float, index=True)
    end: Mapped[float] = mapped_column(Float)
    provenance: Mapped[str] = mapped_column(String(30))
    created: Mapped[str] = mapped_column(default=now)


class Case(Base):
    __tablename__ = "cases"
    id: Mapped[str] = mapped_column(primary_key=True, default=uid)
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    title: Mapped[str] = mapped_column(String(150))
    description: Mapped[str] = mapped_column(Text)
    purpose: Mapped[str] = mapped_column(String(300))
    status: Mapped[str] = mapped_column(default="open")
    created: Mapped[str] = mapped_column(default=now)


class CaseEvidence(Base):
    __tablename__ = "case_evidence"
    case_id: Mapped[str] = mapped_column(ForeignKey("cases.id", ondelete="CASCADE"), primary_key=True)
    event_id: Mapped[str] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"), primary_key=True)


class CaseMember(Base):
    __tablename__ = "case_members"
    case_id: Mapped[str] = mapped_column(ForeignKey("cases.id", ondelete="CASCADE"), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)


class Report(Base):
    __tablename__ = "reports"
    id: Mapped[str] = mapped_column(primary_key=True, default=uid)
    case_id: Mapped[str] = mapped_column(ForeignKey("cases.id", ondelete="CASCADE"), index=True)
    version: Mapped[int] = mapped_column(Integer)
    author_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    content: Mapped[dict] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(default="draft")
    notes: Mapped[str] = mapped_column(Text, default="")
    reviewer_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    reviewed: Mapped[str | None] = mapped_column(nullable=True)
    created: Mapped[str] = mapped_column(default=now)
    __table_args__ = (UniqueConstraint("case_id", "version"),)


class Alert(Base):
    __tablename__ = "alerts"
    id: Mapped[str] = mapped_column(primary_key=True, default=uid)
    event_id: Mapped[str] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"), unique=True)
    status: Mapped[str] = mapped_column(default="open")
    reason: Mapped[str] = mapped_column(Text, default="")
    updated: Mapped[str] = mapped_column(default=now)


class Audit(Base):
    __tablename__ = "audit_events"
    seq: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    actor: Mapped[str] = mapped_column(String(80))
    action: Mapped[str] = mapped_column(String(80))
    target: Mapped[str] = mapped_column(String(100))
    detail: Mapped[dict] = mapped_column(JSON, default=dict)
    created: Mapped[str] = mapped_column(default=now)
    previous: Mapped[str] = mapped_column(String(64))
    hash: Mapped[str] = mapped_column(String(64))


class CameraRecord(Base):
    __tablename__ = "cameras"
    id: Mapped[str] = mapped_column(primary_key=True, default=uid)
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    label: Mapped[str] = mapped_column(String(80))
    metadata_json: Mapped[dict] = mapped_column(JSON, default=dict)


class SourceRecord(Base):
    __tablename__ = "media_sources"
    id: Mapped[str] = mapped_column(primary_key=True, default=uid)
    asset_id: Mapped[str] = mapped_column(ForeignKey("video_assets.id", ondelete="CASCADE"), index=True)
    path: Mapped[str] = mapped_column(Text)
    sha256: Mapped[str] = mapped_column(String(64))
    size: Mapped[int] = mapped_column(Integer)
    metadata_json: Mapped[dict] = mapped_column(JSON, default=dict)
    relationship: Mapped[str] = mapped_column(String(40), default="ingested_original")
    created: Mapped[str] = mapped_column(default=now)
    __table_args__ = (UniqueConstraint("asset_id", "sha256"),)


class VideoConfiguration(Base):
    __tablename__ = "video_configurations"
    asset_id: Mapped[str] = mapped_column(ForeignKey("video_assets.id", ondelete="CASCADE"), primary_key=True)
    camera_id: Mapped[str] = mapped_column(ForeignKey("cameras.id"))
    source_id: Mapped[str] = mapped_column(ForeignKey("media_sources.id"))
    clock_start: Mapped[str | None] = mapped_column(nullable=True)
    clock_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    clock_evidence: Mapped[str] = mapped_column(Text, default="")
    zones: Mapped[list] = mapped_column(JSON, default=list)


class IntelligenceSnapshot(Base):
    __tablename__ = "intelligence_snapshots"
    id: Mapped[str] = mapped_column(primary_key=True, default=uid)
    asset_id: Mapped[str] = mapped_column(ForeignKey("video_assets.id", ondelete="CASCADE"), index=True)
    fingerprint: Mapped[str] = mapped_column(String(64))
    data: Mapped[dict] = mapped_column(JSON)
    created: Mapped[str] = mapped_column(default=now)
    __table_args__ = (UniqueConstraint("asset_id", "fingerprint"),)


class AnalysisJob(Base):
    __tablename__ = "analysis_jobs"
    id: Mapped[str] = mapped_column(primary_key=True, default=uid)
    asset_id: Mapped[str] = mapped_column(ForeignKey("video_assets.id", ondelete="CASCADE"), index=True)
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    request_key: Mapped[str] = mapped_column(String(100))
    options: Mapped[dict] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(30), default="queued")
    progress: Mapped[int] = mapped_column(Integer, default=0)
    cancel_requested: Mapped[bool] = mapped_column(Boolean, default=False)
    result: Mapped[dict] = mapped_column(JSON, default=dict)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created: Mapped[str] = mapped_column(default=now)
    finished: Mapped[str | None] = mapped_column(nullable=True)
    __table_args__ = (UniqueConstraint("asset_id", "request_key"),)


class DerivedArtifact(Base):
    __tablename__ = "derived_artifacts"
    id: Mapped[str] = mapped_column(primary_key=True, default=uid)
    asset_id: Mapped[str] = mapped_column(ForeignKey("video_assets.id", ondelete="CASCADE"), index=True)
    source_id: Mapped[str] = mapped_column(ForeignKey("media_sources.id"))
    frame_id: Mapped[str | None] = mapped_column(ForeignKey("frames.id", ondelete="CASCADE"), nullable=True)
    kind: Mapped[str] = mapped_column(String(30))
    path: Mapped[str] = mapped_column(Text)
    sha256: Mapped[str] = mapped_column(String(64))
    provenance: Mapped[dict] = mapped_column(JSON)


class FindingEvent(Base):
    __tablename__ = "finding_events"
    id: Mapped[str] = mapped_column(primary_key=True)
    asset_id: Mapped[str] = mapped_column(ForeignKey("video_assets.id", ondelete="CASCADE"), index=True)
    event_id: Mapped[str] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"))


class EnrichmentRecord(Base):
    __tablename__ = "enrichment_records"
    id: Mapped[str] = mapped_column(primary_key=True, default=uid)
    case_id: Mapped[str] = mapped_column(ForeignKey("cases.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(30))
    source_sha256: Mapped[str] = mapped_column(String(64))
    rows: Mapped[list] = mapped_column(JSON)
    verified_identifiers: Mapped[bool] = mapped_column(Boolean, default=False)
    clock_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    imported_by: Mapped[str] = mapped_column(ForeignKey("users.id"))
    created: Mapped[str] = mapped_column(default=now)


V2_TABLES = [
    cls.__table__
    for cls in (
        CameraRecord,
        SourceRecord,
        VideoConfiguration,
        IntelligenceSnapshot,
        AnalysisJob,
        DerivedArtifact,
        FindingEvent,
        EnrichmentRecord,
    )
]


class CaseVideo(Base):
    __tablename__ = "case_videos"
    case_id: Mapped[str] = mapped_column(ForeignKey("cases.id", ondelete="CASCADE"), primary_key=True)
    asset_id: Mapped[str] = mapped_column(ForeignKey("video_assets.id", ondelete="CASCADE"), primary_key=True)


class DiscoveryRun(Base):
    __tablename__ = "discovery_runs"
    id: Mapped[str] = mapped_column(primary_key=True, default=uid)
    case_id: Mapped[str] = mapped_column(ForeignKey("cases.id", ondelete="CASCADE"), index=True)
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    request_key: Mapped[str] = mapped_column(String(100))
    options: Mapped[dict] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(30), default="queued")
    result: Mapped[dict] = mapped_column(JSON, default=dict)
    cancel_requested: Mapped[bool] = mapped_column(Boolean, default=False)
    created: Mapped[str] = mapped_column(default=now)
    __table_args__ = (UniqueConstraint("case_id", "request_key"),)


class FindingReview(Base):
    __tablename__ = "finding_reviews"
    id: Mapped[str] = mapped_column(primary_key=True, default=uid)
    case_id: Mapped[str] = mapped_column(ForeignKey("cases.id", ondelete="CASCADE"))
    reference: Mapped[str] = mapped_column(Text)
    disposition: Mapped[str] = mapped_column(String(30))
    notes: Mapped[str] = mapped_column(Text)
    reviewer_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    created: Mapped[str] = mapped_column(default=now)


V3_TABLES = [CaseVideo.__table__, DiscoveryRun.__table__, FindingReview.__table__]


class WorkItem(Base):
    __tablename__ = "durable_work"
    id: Mapped[str] = mapped_column(primary_key=True, default=uid)
    kind: Mapped[str] = mapped_column(String(30))
    target_id: Mapped[str] = mapped_column(String(100))
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    state: Mapped[str] = mapped_column(String(30), default="queued", index=True)
    worker: Mapped[str | None] = mapped_column(nullable=True)
    lease_until: Mapped[float] = mapped_column(Float, default=0)
    created: Mapped[str] = mapped_column(default=now)
    finished: Mapped[str | None] = mapped_column(nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    __table_args__ = (UniqueConstraint("kind", "target_id"),)


class RetentionPolicy(Base):
    __tablename__ = "retention_policy"
    id: Mapped[int] = mapped_column(primary_key=True, default=1)
    enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    days: Mapped[int] = mapped_column(Integer, default=90)
    updated_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)


class QuarantinedAsset(Base):
    __tablename__ = "quarantined_assets"
    asset_id: Mapped[str] = mapped_column(ForeignKey("video_assets.id", ondelete="CASCADE"), primary_key=True)
    prior_status: Mapped[str] = mapped_column(String(30))
    quarantined: Mapped[str] = mapped_column(default=now)
    restored: Mapped[str | None] = mapped_column(nullable=True)


class WorkerHeartbeat(Base):
    __tablename__ = "worker_heartbeats"
    id: Mapped[str] = mapped_column(primary_key=True)
    lease_until: Mapped[float] = mapped_column(Float)
    concurrency: Mapped[int] = mapped_column(Integer)


V4_TABLES = [WorkItem.__table__, RetentionPolicy.__table__, QuarantinedAsset.__table__, WorkerHeartbeat.__table__]


engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False, "timeout": 30} if DATABASE_URL.startswith("sqlite") else {},
    pool_pre_ping=True,
)
if DATABASE_URL.startswith("sqlite"):

    @event.listens_for(engine, "connect")
    def sqlite_pragmas(conn, _):
        conn.execute("PRAGMA foreign_keys=ON")
        conn.execute("PRAGMA journal_mode=WAL")


DB = sessionmaker(engine, expire_on_commit=False)
audit_lock = threading.RLock()


def migrate():
    # Immutable v1 schema; future changes require a numbered migration.
    with engine.begin() as conn:
        conn.execute(
            text(
                "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied VARCHAR(40) NOT NULL)"
            )
        )
        version = conn.execute(text("SELECT MAX(version) FROM schema_migrations")).scalar()
        if not version:
            Base.metadata.create_all(
                conn, tables=[t for t in Base.metadata.sorted_tables if t not in V2_TABLES + V3_TABLES + V4_TABLES]
            )
            conn.execute(text("INSERT INTO schema_migrations (version, applied) VALUES (1, :at)"), {"at": now()})
            version = 1
        if version == 1:
            Base.metadata.create_all(conn, tables=V2_TABLES)
            conn.execute(text("INSERT INTO schema_migrations (version, applied) VALUES (2, :at)"), {"at": now()})
            version = 2
        if version == 2:
            Base.metadata.create_all(conn, tables=V3_TABLES)
            conn.execute(text("INSERT INTO schema_migrations (version, applied) VALUES (3, :at)"), {"at": now()})
            version = 3
        if version == 3:
            Base.metadata.create_all(conn, tables=V4_TABLES)
            conn.execute(text("INSERT INTO schema_migrations (version, applied) VALUES (4, :at)"), {"at": now()})
        elif version != 4:
            raise RuntimeError("Unsupported schema version")


def audit(actor, action, target="", detail=None):
    with audit_lock, DB.begin() as db:
        if engine.dialect.name == "sqlite":
            db.connection().exec_driver_sql("BEGIN IMMEDIATE")
        elif engine.dialect.name == "postgresql":
            db.execute(text("SELECT pg_advisory_xact_lock(78242001)"))
        prev = db.scalars(select(Audit).order_by(Audit.seq.desc()).limit(1)).first()
        item = {
            "actor": actor,
            "action": action,
            "target": target,
            "detail": detail or {},
            "created": now(),
            "previous": prev.hash if prev else "0" * 64,
        }
        digest = hashlib.sha256(json.dumps(item, sort_keys=True).encode()).hexdigest()
        db.add(Audit(**item, hash=digest))


def reserve_sources(db, asset_ids):
    """Serialize admission across API processes, not only Python threads."""
    if engine.dialect.name == "sqlite":
        db.connection().exec_driver_sql("BEGIN IMMEDIATE")
    else:
        db.scalars(select(Asset).where(Asset.id.in_(asset_ids)).order_by(Asset.id).with_for_update()).all()


def serialize(row, exclude=()):
    return {c.name: getattr(row, c.name) for c in row.__table__.columns if c.name not in exclude}


if __name__ == "__main__":
    migrate()
    print("Schema migrations v1 through v4 applied (or already current).")
