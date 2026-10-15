from sqlalchemy import Column, String, DateTime, Text, Index
from sqlalchemy.sql import func

from app.db.base import Base


class Investigation(Base):
    """A persisted investigation of one reconciliation discrepancy.

    An investigation is read-only with respect to the deterministic engine: it
    records findings, citations and a recommended action, but never changes
    reconciliation results, payments or vendor bank details. ``report_json``
    holds the validated structured report.
    """

    __tablename__ = "investigations"

    id = Column(String(36), primary_key=True)
    organization_id = Column(String(36), nullable=False, index=True)
    created_by = Column(String(36))
    invoice_id = Column(String(36), index=True)
    reconciliation_match_id = Column(String(36))
    # pending | running | completed | needs_review | failed
    status = Column(String(30), nullable=False, default="pending")
    # Last graph node reached (e.g. validate_request, generate_report, human_review).
    workflow_state = Column(String(40))
    report_json = Column(Text)
    model_name = Column(String(100))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        Index("ix_investigations_org_status", "organization_id", "status"),
    )
