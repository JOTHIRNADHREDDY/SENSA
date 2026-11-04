import os
import shutil
import tempfile
from pathlib import Path

os.environ["SENSA_DATA_DIR"] = tempfile.mkdtemp(prefix="sensa-tests-")
os.environ.pop("DATABASE_URL", None)
os.environ.pop("MODEL_API_KEY", None)
os.environ.pop("SENSA_AUTH_MODE", None)
os.environ["SENSA_WORKER_MODE"] = "external"

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app import config
from app.db import Base, engine, migrate, uid
from app.demo import generate
from app.main import app, auth_attempts
from app.workflows import ingest, process


@pytest.fixture(autouse=True)
def database(monkeypatch):
    Base.metadata.drop_all(engine)
    with engine.begin() as conn:
        conn.execute(text("DROP TABLE IF EXISTS schema_migrations"))
    migrate()
    auth_attempts.clear()
    monkeypatch.setattr("app.main.submit", lambda asset_id, real=False: process(asset_id, real))


@pytest.fixture
def client():
    with TestClient(app) as client:
        yield client


@pytest.fixture
def admin(client):
    result = client.post(
        "/api/auth/setup",
        json={"email": "admin@example.test", "password": "test-only-password-123", "name": "Test Admin"},
    )
    assert result.status_code == 201, result.text
    return result.json()


@pytest.fixture(scope="session")
def source():
    folder = Path(tempfile.mkdtemp(prefix="sensa-source-"))
    generate(folder, 0)
    yield folder
    shutil.rmtree(folder)


@pytest.fixture
def asset(source, admin):
    folder = config.DATA / uid()
    shutil.copytree(source, folder)
    row = ingest(folder / "original.mp4", admin["id"], "Synthetic warehouse test", "Loading dock", True)
    process(row.id)
    return row


def account(client, email="operator@example.test", role="operator"):
    res = client.post(
        "/api/users", json={"email": email, "password": "test-only-password-123", "name": role.title(), "role": role}
    )
    assert res.status_code == 201, res.text
    return res.json()


def sign_in(client, email):
    res = client.post("/api/auth/login", json={"email": email, "password": "test-only-password-123"})
    assert res.status_code == 200, res.text


def case(client):
    res = client.post(
        "/api/cases",
        json={
            "title": "Exit activity review",
            "description": "Review authorized synthetic evidence",
            "purpose": "Authorized operations review",
        },
    )
    assert res.status_code == 201, res.text
    return res.json()
