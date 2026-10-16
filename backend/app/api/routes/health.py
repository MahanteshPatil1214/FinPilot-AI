from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.core.config import settings

router = APIRouter()


@router.get("/health")
def health():
    """Liveness probe: the process is up and serving requests.

    Intentionally does no I/O, so a slow or briefly unavailable database does
    not cause an orchestrator to restart an otherwise healthy process.
    """
    return {"status": "ok", "service": "finpilot-ai"}


@router.get("/health/ready")
def readiness(db: Session = Depends(get_db)):
    """Readiness probe: the service can actually serve traffic.

    Verifies a database round-trip. Returns 503 (not 500) when a dependency is
    not ready so load balancers stop routing without restarting the process.
    The response never echoes connection strings or driver messages.
    """
    try:
        db.execute(text("SELECT 1"))
    except Exception:
        return JSONResponse(
            status_code=503,
            content={
                "status": "unavailable",
                "service": "finpilot-ai",
                "environment": settings.ENVIRONMENT,
                "checks": {"database": "unavailable"},
            },
        )
    return {
        "status": "ready",
        "service": "finpilot-ai",
        "environment": settings.ENVIRONMENT,
        "checks": {"database": "ok"},
    }
