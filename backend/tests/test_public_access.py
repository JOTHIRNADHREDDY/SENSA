from fastapi.testclient import TestClient

from app import config
from app.main import app


def test_public_workspace_opens_existing_evidence_and_allows_investigation_writes(client, admin, asset, monkeypatch):
    owned = client.post(
        "/api/cases",
        json={"title": "Existing review", "description": "Saved evidence", "purpose": "Operations review"},
    )
    assert owned.status_code == 201
    monkeypatch.setattr(config, "AUTH_MODE", "public")
    monkeypatch.setattr(config, "PRODUCTION", True)
    monkeypatch.setattr(config, "ORIGINS", ["https://sensa.example.workers.dev"])
    visitor = TestClient(app, base_url="https://sensa.example.workers.dev")
    assert visitor.get("/api/health").json()["auth_mode"] == "public"
    identity = visitor.get("/api/auth/me")
    assert identity.status_code == 200
    assert identity.json()["role"] == "operator"
    assert "password" not in identity.json()
    assert not visitor.cookies.get("sensa_session")
    assert any(row["id"] == asset.id for row in visitor.get("/api/videos").json())
    assert any(row["id"] == owned.json()["id"] for row in visitor.get("/api/cases").json())
    created = visitor.post(
        "/api/cases",
        json={"title": "Visitor review", "description": "Open case", "purpose": "Operations review"},
        headers={"origin": "https://sensa.example.workers.dev"},
    )
    assert created.status_code == 201
    assert visitor.get("/api/users").status_code == 403
    assert visitor.get("/api/audit").status_code == 403
    assert visitor.post("/api/auth/local").status_code == 404
    assert (
        visitor.post(
            "/api/auth/login", json={"email": "anyone@example.test", "password": "test-only-password-123"}
        ).status_code
        == 404
    )
