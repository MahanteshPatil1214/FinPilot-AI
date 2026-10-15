from sqlalchemy import (
    Column,
    String,
    DateTime,
    Text,
    Integer,
    Index,
    ForeignKey,
    CheckConstraint,
)
from sqlalchemy.sql import func

from app.db.base import Base

DECISION_VALUES = ("approved", "rejected", "needs_more_information")


class InvestigationReview(Base):
    """An append-only human review decision for one investigation.

    Rows are never updated or deleted: the table is the review history. Each row
    records the status transition, the decision, the reviewer's rationale and the
    reviewer identity, so the full trail is auditable. Reviews never change
    reconciliation results, invoice amounts, transactions or vendor bank details.
    """

    __tablename__ = "investigation_reviews"

    id = Column(String(36), primary_key=True)
    investigation_id = Column(
        String(36),
        ForeignKey("investigations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    organization_id = Column(String(36), nullable=False, index=True)
    # Identity of the reviewer where available (development: the demo user).
    reviewer_id = Column(String(36))
    # approved | rejected | needs_more_information
    decision = Column(String(30), nullable=False)
    rationale = Column(Text, nullable=False)
    previous_status = Column(String(30), nullable=False)
    resulting_status = Column(String(30), nullable=False)
    # The investigation report_version the reviewer acted upon.
    report_version = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        CheckConstraint(
            "decision IN ('approved', 'rejected', 'needs_more_information')",
            name="ck_investigation_reviews_decision",
        ),
        Index(
            "ix_investigation_reviews_org_investigation",
            "organization_id",
            "investigation_id",
        ),
    )
