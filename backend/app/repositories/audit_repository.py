"""Persistence for the append-only audit trail (organization-scoped).

Only INSERTs ever reach the ``audit_events`` table: this module exposes no
update or delete helper. Listing is always scoped to a single organization so a
caller can never read another tenant's trail.
"""

import json
import uuid
from typing import Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from app.models.audit_event import AuditEvent


def build_event(
    *,
    organization_id: str,
    entity_type: str,
    entity_id: str,
    action: str,
    actor_id: Optional[str] = None,
    details: Optional[Dict[str, object]] = None,
) -> AuditEvent:
    """Construct (but do not persist) an audit event.

    The returned instance is meant to be added to whichever transaction is
    performing the state change it describes, so the action and its audit row
    commit or roll back together.
    """
    return AuditEvent(
        id=str(uuid.uuid4()),
        organization_id=organization_id,
        actor_id=actor_id,
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
        details_json=json.dumps(details) if details is not None else None,
    )


def append_event(
    db: Session,
    *,
    organization_id: str,
    entity_type: str,
    entity_id: str,
    action: str,
    actor_id: Optional[str] = None,
    details: Optional[Dict[str, object]] = None,
) -> AuditEvent:
    """Insert one audit event in its own transaction.

    Used when there is no surrounding transaction to join; the append is atomic
    with respect to itself and rolls back cleanly on failure.
    """
    event = build_event(
        organization_id=organization_id,
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
        actor_id=actor_id,
        details=details,
    )
    try:
        db.add(event)
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(event)
    return event


def list_events(
    db: Session,
    organization_id: str,
    *,
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    action: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
) -> Tuple[List[AuditEvent], int]:
    """Return one page of audit events for an organization, newest first."""
    query = db.query(AuditEvent).filter(
        AuditEvent.organization_id == organization_id
    )
    if entity_type is not None:
        query = query.filter(AuditEvent.entity_type == entity_type)
    if entity_id is not None:
        query = query.filter(AuditEvent.entity_id == entity_id)
    if action is not None:
        query = query.filter(AuditEvent.action == action)

    total = query.count()
    items = (
        query.order_by(AuditEvent.created_at.desc(), AuditEvent.id.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return items, total


def count_events(db: Session, organization_id: str) -> int:
    """Total number of audit events recorded for one organization."""
    return (
        db.query(AuditEvent)
        .filter(AuditEvent.organization_id == organization_id)
        .count()
    )
