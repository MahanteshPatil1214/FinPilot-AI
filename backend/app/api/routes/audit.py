import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import get_current_organization_id, get_db
from app.repositories import audit_repository as repo
from app.schemas.audit import AuditEventListResponse, AuditEventSchema

logger = logging.getLogger(__name__)

router = APIRouter()

MAX_LIMIT = 200


@router.get("/audit/events", response_model=AuditEventListResponse)
def list_audit_events(
    entity_type: Optional[str] = Query(default=None, max_length=50),
    entity_id: Optional[str] = Query(default=None, max_length=36),
    action: Optional[str] = Query(default=None, max_length=50),
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    organization_id: str = Depends(get_current_organization_id),
):
    # Read-only, organization-scoped and append-only by construction: this route
    # can never mutate the trail.
    if skip < 0 or limit < 1:
        raise HTTPException(status_code=422, detail="invalid pagination")
    if limit > MAX_LIMIT:
        raise HTTPException(
            status_code=422, detail=f"limit must not exceed {MAX_LIMIT}"
        )

    items, total = repo.list_events(
        db,
        organization_id,
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
        skip=skip,
        limit=limit,
    )
    return AuditEventListResponse(
        total=total,
        skip=skip,
        limit=limit,
        items=[AuditEventSchema.from_model(event) for event in items],
    )
