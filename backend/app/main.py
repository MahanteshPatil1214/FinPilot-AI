import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

import app.core.logging  # noqa: F401  (configures logging once at import)
from app.api.routes import (
    health,
    documents,
    invoices,
    transactions,
    reconciliation,
    knowledge,
    investigations,
    audit,
    dashboard,
)
from app.core.config import settings
from app.core.exceptions import (
    DomainError,
    ReviewConflictError,
    ReviewNotEligibleError,
    ReviewNotFoundError,
)
from app.db.init_db import init_db

logger = logging.getLogger("finpilot.api")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Development and test create the schema from the models for zero-setup.
    # Production applies Alembic migrations as a deploy step and must never
    # mutate the schema implicitly on boot.
    if not settings.is_production:
        init_db()
    if settings.is_production and settings.AUTH_PROVIDER == "development":
        logger.warning(
            "Running in production with AUTH_PROVIDER='development': all "
            "requests share one fixed identity. This is not a security "
            "boundary; configure a real AUTH_PROVIDER before exposing this "
            "service to untrusted users."
        )
    yield


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Expected domain errors map to specific HTTP statuses. Routes that already
# translate these keep working; this is the single fallback so no service can
# leak an unhandled domain error as a 500.
_DOMAIN_STATUS = (
    (ReviewNotFoundError, 404),
    (ReviewConflictError, 409),
    (ReviewNotEligibleError, 409),
)


@app.exception_handler(DomainError)
async def _handle_domain_error(request: Request, exc: DomainError):
    status = next(
        (code for cls, code in _DOMAIN_STATUS if isinstance(exc, cls)), 400
    )
    return JSONResponse(status_code=status, content={"detail": str(exc)})


@app.exception_handler(Exception)
async def _handle_unexpected_error(request: Request, exc: Exception):
    # Log the type only. Exception messages can embed request payloads and
    # extracted financial data, which must never reach the logs.
    logger.error(
        "Unhandled error on %s %s (error: %s)",
        request.method,
        request.url.path,
        type(exc).__name__,
    )
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


app.include_router(health.router, prefix=settings.API_V1_STR)
app.include_router(documents.router, prefix=settings.API_V1_STR)
app.include_router(invoices.router, prefix=settings.API_V1_STR)
app.include_router(transactions.router, prefix=settings.API_V1_STR)
app.include_router(reconciliation.router, prefix=settings.API_V1_STR)
app.include_router(knowledge.router, prefix=settings.API_V1_STR)
app.include_router(investigations.router, prefix=settings.API_V1_STR)
app.include_router(audit.router, prefix=settings.API_V1_STR)
app.include_router(dashboard.router, prefix=settings.API_V1_STR)
