import time

from fastapi.testclient import TestClient
from sqlalchemy import select

from app import config
from app.db import DB, Session
from app.main import app


def local_client():
    return TestClient(app, base_url="http://127.0.0.1:8001", client=("127.0.0.1", 50000))


def test_signin_mode_does_not_allow_automatic_access(client):
    assert client.get("/api/videos").status_code == 401
    assert client.post("/api/auth/local").status_code == 404


def test_local_workspace_opens_without_credentials_and_reuses_session(monkeypatch):
    monkeypatch.setattr(config, "AUTH_MODE", "local")
    client = local_client()
    assert client.get("/api/health").json()["auth_mode"] == "local"
    assert client.get("/api/health").json()["setup_required"] is False
    assert client.get("/api/videos").status_code == 401
    response = client.post("/api/auth/local")
    assert response.status_code == 200, response.text
    assert response.json()["role"] == "admin"
    assert "password" not in response.json()
    assert "HttpOnly" in response.headers["set-cookie"]
    token = client.cookies.get("sensa_session")
    assert client.get("/api/dashboard").status_code == 200
    assert client.post("/api/auth/local").status_code == 200
    assert client.cookies.get("sensa_session") == token
    with DB() as db:
        assert len(db.scalars(select(Session)).all()) == 1


def test_local_access_keeps_existing_workspace_owner(client, admin, monkeypatch):
    monkeypatch.setattr(config, "AUTH_MODE", "local")
    response = local_client().post("/api/auth/local")
    assert response.status_code == 200
    assert response.json()["id"] == admin["id"]


def test_local_session_can_be_renewed_without_signin(monkeypatch):
    monkeypatch.setattr(config, "AUTH_MODE", "local")
    client = local_client()
    assert client.post("/api/auth/local").status_code == 200
    with DB.begin() as db:
        for session in db.scalars(select(Session)):
            session.expires = time.time() - 1
    assert client.get("/api/auth/me").status_code == 401
    assert client.post("/api/auth/local").status_code == 200
    assert client.get("/api/auth/me").status_code == 200


def test_local_access_rejects_remote_clients_and_foreign_hosts(monkeypatch):
    monkeypatch.setattr(config, "AUTH_MODE", "local")
    remote = TestClient(app, base_url="http://127.0.0.1:8001", client=("203.0.113.10", 50000))
    assert remote.post("/api/auth/local").status_code == 403
    for headers in (
        {"Host": "evil.example"},
        {"x-forwarded-host": "evil.example"},
        {"Origin": "https://evil.example"},
        {"sec-fetch-site": "cross-site"},
    ):
        assert local_client().post("/api/auth/local", headers=headers).status_code == 403


def test_local_access_is_denied_in_production(monkeypatch):
    monkeypatch.setattr(config, "AUTH_MODE", "local")
    monkeypatch.setattr(config, "PRODUCTION", True)
    assert local_client().post("/api/auth/local").status_code == 403
