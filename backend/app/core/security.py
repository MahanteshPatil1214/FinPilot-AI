"""Server-side identity boundary.

Every route resolves the caller through a :class:`Principal` produced by a
:class:`PrincipalResolver`. The resolver is selected by ``settings.AUTH_PROVIDER``
and is the single trusted source of identity and tenancy. Nothing here is ever
read from request bodies or query strings, and an organization id supplied by a
client is never treated as authorization.

Honest scope: only the ``development`` provider is wired for the demo. It is a
fixed single-organization identity, *not* a security boundary. The ``header``
and ``jwt`` providers show how a real identity source plugs into the same seam
without touching a single route handler:

* ``development`` - fixed local identity. Default. Warned about in production.
* ``header``      - trusts ``X-User-Id`` / ``X-Organization-Id`` from a trusted
                    reverse proxy. Development/testing only; rejected in
                    production by settings validation.
* ``jwt``         - verifies a bearer HS256 JWT and maps its claims. Requires
                    ``AUTH_JWT_SECRET``.

Route handlers depend on ``get_current_principal`` (or the thin
``get_current_user_id`` / ``get_current_organization_id`` helpers) via
``app.api.deps``.
"""

from dataclasses import dataclass
from functools import lru_cache
from typing import Protocol, runtime_checkable

from fastapi import Depends, HTTPException, Request, status

from app.core.config import settings

def _unauthenticated() -> HTTPException:
    # Fresh instance each time so tracebacks never accumulate on a shared object.
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Not authenticated",
        headers={"WWW-Authenticate": "Bearer"},
    )


@dataclass(frozen=True)
class Principal:
    """The authenticated caller: who they are and which tenant they may see."""

    user_id: str
    organization_id: str
    display_name: str = ""
    roles: tuple[str, ...] = ()
    authenticated: bool = True


@runtime_checkable
class PrincipalResolver(Protocol):
    """Turns an inbound request into a :class:`Principal`.

    Implementations must be pure with respect to tenant selection: they may only
    return an organization the caller is genuinely entitled to. Returning a value
    taken from a body/query is a vulnerability, not an implementation detail.
    """

    def resolve(self, request: Request) -> Principal:  # pragma: no cover - protocol
        ...


class DevelopmentPrincipalResolver:
    """Fixed single-organization identity for local development and tests."""

    def __init__(
        self,
        organization_id: str = "org_1",
        user_id: str = "demo-user",
        display_name: str = "Demo User",
    ) -> None:
        self._organization_id = organization_id
        self._user_id = user_id
        self._display_name = display_name

    def resolve(self, request: Request) -> Principal:
        return Principal(
            user_id=self._user_id,
            organization_id=self._organization_id,
            display_name=self._display_name,
            roles=("admin",),
        )


def _split_roles(raw: str | None) -> tuple[str, ...]:
    if not raw:
        return ()
    return tuple(part.strip() for part in raw.split(",") if part.strip())


class HeaderPrincipalResolver:
    """Reads identity from headers injected by a trusted reverse proxy.

    Only safe when the app is reachable exclusively through that proxy and the
    proxy strips any client-supplied copies of these headers. Never enable this
    on the public internet; it lets any caller choose their own tenant.
    """

    def __init__(
        self,
        user_header: str = "X-User-Id",
        organization_header: str = "X-Organization-Id",
        roles_header: str = "X-Roles",
    ) -> None:
        self._user_header = user_header
        self._organization_header = organization_header
        self._roles_header = roles_header

    def resolve(self, request: Request) -> Principal:
        user_id = request.headers.get(self._user_header)
        organization_id = request.headers.get(self._organization_header)
        if not user_id or not organization_id:
            raise _unauthenticated()
        return Principal(
            user_id=user_id,
            organization_id=organization_id,
            roles=_split_roles(request.headers.get(self._roles_header)),
        )


class JwtPrincipalResolver:
    """Verifies a bearer HS256 JWT and maps its claims to a :class:`Principal`."""

    def __init__(
        self,
        secret: str,
        algorithm: str = "HS256",
        organization_claim: str = "org",
        roles_claim: str = "roles",
    ) -> None:
        if not secret:
            raise ValueError("A JWT secret is required")
        self._secret = secret
        self._algorithm = algorithm
        self._organization_claim = organization_claim
        self._roles_claim = roles_claim

    def resolve(self, request: Request) -> Principal:
        import jwt  # imported lazily so the dependency is only needed for this provider

        header = request.headers.get("Authorization", "")
        scheme, _, token = header.partition(" ")
        if scheme.lower() != "bearer" or not token:
            raise _unauthenticated()

        try:
            claims = jwt.decode(token, self._secret, algorithms=[self._algorithm])
        except jwt.PyJWTError:
            raise _unauthenticated()

        user_id = claims.get("sub")
        organization_id = claims.get(self._organization_claim)
        if not user_id or not organization_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Token is missing a subject or organization claim",
            )

        roles = claims.get(self._roles_claim) or ()
        if isinstance(roles, str):
            roles = _split_roles(roles)

        return Principal(
            user_id=str(user_id),
            organization_id=str(organization_id),
            display_name=str(claims.get("name", "")),
            roles=tuple(str(role) for role in roles),
        )


@lru_cache(maxsize=None)
def _build_resolver(provider: str) -> PrincipalResolver:
    if provider == "development":
        return DevelopmentPrincipalResolver()
    if provider == "header":
        return HeaderPrincipalResolver()
    if provider == "jwt":
        return JwtPrincipalResolver(
            secret=settings.AUTH_JWT_SECRET,
            algorithm=settings.AUTH_JWT_ALGORITHM,
            organization_claim=settings.AUTH_JWT_ORG_CLAIM,
        )
    raise ValueError(f"Unknown AUTH_PROVIDER: {provider!r}")


def get_principal_resolver() -> PrincipalResolver:
    """Return the configured resolver (cached per provider)."""
    return _build_resolver(settings.AUTH_PROVIDER)


# --- FastAPI dependencies ------------------------------------------------


def get_current_principal(request: Request) -> Principal:
    """Dependency: resolve and return the caller's :class:`Principal`."""
    return get_principal_resolver().resolve(request)


def get_current_user_id(
    principal: Principal = Depends(get_current_principal),
) -> str:
    """Dependency: the authenticated user id."""
    return principal.user_id


def get_current_organization_id(
    principal: Principal = Depends(get_current_principal),
) -> str:
    """Dependency: the organization the caller may access."""
    return principal.organization_id


def check_authentication(
    principal: Principal = Depends(get_current_principal),
) -> bool:
    return principal.authenticated
