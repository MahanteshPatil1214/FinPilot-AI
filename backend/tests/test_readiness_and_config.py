"""Production-readiness behaviours: health probes and settings validation."""

import pytest
from pydantic import ValidationError

from app.core.config import Settings
from app.db.session import get_db
from app.main import app

READY_URL = "/api/v1/health/ready"


class _BrokenSession:
    def execute(self, *args, **kwargs):
        raise RuntimeError("database is down")


def _broken_db():
    yield _BrokenSession()


def test_liveness_does_not_touch_the_database(client):
    resp = client.get("/api/v1/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_readiness_reports_ready_when_database_responds(client):
    resp = client.get(READY_URL)
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ready"
    assert body["checks"]["database"] == "ok"


def test_readiness_reports_unavailable_without_leaking_details(client):
    app.dependency_overrides[get_db] = _broken_db
    try:
        resp = client.get(READY_URL)
    finally:
        app.dependency_overrides.clear()

    assert resp.status_code == 503
    body = resp.json()
    assert body["status"] == "unavailable"
    assert body["checks"]["database"] == "unavailable"
    assert "database is down" not in resp.text


def test_production_rejects_wildcard_cors_origin():
    with pytest.raises(ValidationError):
        Settings(
            ENVIRONMENT="production",
            ALLOWED_ORIGINS=["*"],
            DATABASE_URL="postgresql://user:pw@db:5432/finpilot",
        )


def test_production_rejects_development_database_url():
    with pytest.raises(ValidationError):
        Settings(
            ENVIRONMENT="production",
            ALLOWED_ORIGINS=["https://app.example.com"],
            DATABASE_URL="postgresql://postgres:postgres@localhost:5432/finpilot",
        )


def test_production_accepts_explicit_configuration():
    configured = Settings(
        ENVIRONMENT="production",
        ALLOWED_ORIGINS=["https://app.example.com"],
        DATABASE_URL="postgresql://user:pw@db:5432/finpilot",
    )
    assert configured.is_production is True


def test_development_stays_permissive():
    configured = Settings(ENVIRONMENT="development")
    assert configured.is_production is False
