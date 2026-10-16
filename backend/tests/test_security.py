"""The pluggable identity boundary: resolvers and FastAPI dependencies."""

from datetime import datetime, timedelta, timezone

import jwt
import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from starlette.requests import Request

from app.core.config import Settings
from app.core.security import (
    DevelopmentPrincipalResolver,
    HeaderPrincipalResolver,
    JwtPrincipalResolver,
    Principal,
    get_current_principal,
)
from app.main import app


def _request(headers: dict[str, str] | None = None) -> Request:
    raw = [(k.lower().encode(), v.encode()) for k, v in (headers or {}).items()]
    return Request(
        {"type": "http", "method": "GET", "path": "/", "headers": raw}
    )


def test_development_resolver_returns_fixed_principal():
    principal = DevelopmentPrincipalResolver().resolve(_request())
    assert principal == Principal(
        user_id="demo-user",
        organization_id="org_1",
        display_name="Demo User",
        roles=("admin",),
    )


def test_header_resolver_maps_identity_headers():
    resolver = HeaderPrincipalResolver()
    principal = resolver.resolve(
        _request(
            {
                "X-User-Id": "user-42",
                "X-Organization-Id": "org-acme",
                "X-Roles": "reviewer, audit",
            }
        )
    )
    assert principal.user_id == "user-42"
    assert principal.organization_id == "org-acme"
    assert principal.roles == ("reviewer", "audit")


def test_header_resolver_rejects_missing_identity():
    with pytest.raises(HTTPException) as exc:
        HeaderPrincipalResolver().resolve(_request({"X-User-Id": "user-42"}))
    assert exc.value.status_code == 401


def _token(secret: str, **overrides) -> str:
    claims = {
        "sub": "user-7",
        "org": "org-jwt",
        "name": "JWT User",
        "roles": ["approver"],
        "exp": datetime.now(timezone.utc) + timedelta(minutes=5),
    }
    claims.update(overrides)
    return jwt.encode(claims, secret, algorithm="HS256")


def test_jwt_resolver_maps_verified_claims():
    secret = "test-secret"
    resolver = JwtPrincipalResolver(secret)
    principal = resolver.resolve(
        _request({"Authorization": f"Bearer {_token(secret)}"})
    )
    assert principal.user_id == "user-7"
    assert principal.organization_id == "org-jwt"
    assert principal.roles == ("approver",)


def test_jwt_resolver_rejects_bad_signature():
    resolver = JwtPrincipalResolver("right-secret")
    with pytest.raises(HTTPException) as exc:
        resolver.resolve(_request({"Authorization": f"Bearer {_token('wrong')}"}))
    assert exc.value.status_code == 401


def test_jwt_resolver_requires_bearer_scheme():
    resolver = JwtPrincipalResolver("secret")
    with pytest.raises(HTTPException) as exc:
        resolver.resolve(_request({"Authorization": "Basic abc"}))
    assert exc.value.status_code == 401


def test_jwt_resolver_requires_secret():
    with pytest.raises(ValueError):
        JwtPrincipalResolver("")


def test_dependency_boundary_is_swappable(client):
    """Overriding the principal resolver changes the tenant the API acts on."""
    app.dependency_overrides[get_current_principal] = lambda: Principal(
        user_id="user-9", organization_id="org-swapped"
    )
    try:
        resp = client.get("/api/v1/dashboard/summary")
    finally:
        app.dependency_overrides.clear()

    assert resp.status_code == 200
    assert resp.json()["organization_id"] == "org-swapped"


def test_production_rejects_header_identity_provider():
    with pytest.raises(ValidationError):
        Settings(
            ENVIRONMENT="production",
            ALLOWED_ORIGINS=["https://app.example.com"],
            DATABASE_URL="postgresql://user:pw@db:5432/finpilot",
            AUTH_PROVIDER="header",
        )


def test_production_jwt_provider_requires_secret():
    with pytest.raises(ValidationError):
        Settings(
            ENVIRONMENT="production",
            ALLOWED_ORIGINS=["https://app.example.com"],
            DATABASE_URL="postgresql://user:pw@db:5432/finpilot",
            AUTH_PROVIDER="jwt",
            AUTH_JWT_SECRET="",
        )


def test_unknown_auth_provider_is_rejected():
    with pytest.raises(ValidationError):
        Settings(AUTH_PROVIDER="nonsense")
