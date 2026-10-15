from sqlalchemy import Column, String, DateTime, Text, Index
from sqlalchemy.sql import func

from app.db.base import Base


class AuditEvent(Base):
    """Append-only audit trail of significant actions.

    Records who did what to which entity and when. Details that do not fit the
    fixed columns are stored as JSON in ``details_json``. Rows are never updated
    or deleted.
    """

    __tablename__ = "audit_events"

    id = Column(String(36), primary_key=True)
    organization_id = Column(String(36), nullable=False, index=True)
    actor_id = Column(String(36))
    entity_type = Column(String(50), nullable=False)
    entity_id = Column(String(36), nullable=False, index=True)
    action = Column(String(50), nullable=False)
    details_json = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index(
            "ix_audit_events_org_entity",
            "organization_id",
            "entity_type",
            "entity_id",
        ),
    )
