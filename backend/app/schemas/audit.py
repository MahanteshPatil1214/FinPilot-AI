import json
from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from app.models.audit_event import AuditEvent


class AuditEventSchema(BaseModel):
    """One row of the append-only audit trail.

    ``details_json`` is parsed into a plain object for the client; malformed or
    non-object payloads degrade to ``None`` rather than failing the read.
    """

    id: str
    organization_id: str
    actor_id: Optional[str] = None
    entity_type: str
    entity_id: str
    action: str
    details: Optional[Dict[str, Any]] = None
    created_at: Optional[datetime] = None

    @classmethod
    def from_model(cls, event: AuditEvent) -> "AuditEventSchema":
        details: Optional[Dict[str, Any]] = None
        if event.details_json:
            try:
                parsed = json.loads(event.details_json)
            except (ValueError, TypeError):
                parsed = None
            if isinstance(parsed, dict):
                details = parsed
        return cls(
            id=event.id,
            organization_id=event.organization_id,
            actor_id=event.actor_id,
            entity_type=event.entity_type,
            entity_id=event.entity_id,
            action=event.action,
            details=details,
            created_at=event.created_at,
        )


class AuditEventListResponse(BaseModel):
    total: int
    skip: int
    limit: int
    items: List[AuditEventSchema] = Field(default_factory=list)
