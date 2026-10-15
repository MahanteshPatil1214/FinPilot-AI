"""Persistence for investigation records (organization-scoped)."""

import uuid
from typing import List, Optional, Tuple

from sqlalchemy.orm import Session

from app.models.investigation import Investigation


def create_investigation(
    db: Session,
    organization_id: str,
    created_by: Optional[str] = None,
    invoice_id: Optional[str] = None,
    reconciliation_match_id: Optional[str] = None,
) -> Investigation:
    investigation = Investigation(
        id=str(uuid.uuid4()),
        organization_id=organization_id,
        created_by=created_by,
        invoice_id=invoice_id,
        reconciliation_match_id=reconciliation_match_id,
        status="pending",
        workflow_state="pending",
    )
    try:
        db.add(investigation)
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(investigation)
    return investigation


def get_investigation(
    db: Session, organization_id: str, investigation_id: str
) -> Optional[Investigation]:
    return (
        db.query(Investigation)
        .filter(
            Investigation.id == investigation_id,
            Investigation.organization_id == organization_id,
        )
        .first()
    )


def list_investigations(
    db: Session,
    organization_id: str,
    status: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
) -> Tuple[List[Investigation], int]:
    query = db.query(Investigation).filter(
        Investigation.organization_id == organization_id
    )
    if status is not None:
        query = query.filter(Investigation.status == status)
    total = query.count()
    items = (
        query.order_by(Investigation.created_at.desc(), Investigation.id.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return items, total


def update_investigation(
    db: Session, investigation: Investigation, **fields
) -> Investigation:
    """Atomically update the given investigation.

    Commits on success and rolls back on failure so a failed run never leaves a
    partially written report.
    """
    try:
        for key, value in fields.items():
            setattr(investigation, key, value)
        db.add(investigation)
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(investigation)
    return investigation
