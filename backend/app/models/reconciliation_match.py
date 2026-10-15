from sqlalchemy import Column, String, DateTime, DECIMAL, UniqueConstraint, Index
from sqlalchemy.sql import func
from app.db.base import Base


class ReconciliationMatch(Base):
    """One deterministic reconciliation outcome.

    A row is a *link* only when both ``invoice_id`` and ``transaction_id`` are
    set. Ambiguous rows deliberately leave one side NULL so no transaction can
    ever be linked to more than one invoice (and vice versa). The unique
    constraints below allow many NULLs while forbidding the same real
    invoice/transaction from being referenced twice.
    """

    __tablename__ = "reconciliation_matches"

    id = Column(String(36), primary_key=True)
    organization_id = Column(String(36), nullable=False, index=True)
    invoice_id = Column(String(36))
    transaction_id = Column(String(36))
    match_status = Column(String(30), nullable=False)
    matching_method = Column(String(40), nullable=False)
    difference_amount = Column(DECIMAL(precision=20, scale=2))
    explanation = Column(String(1000))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        # NULLs are permitted multiple times in both SQLite and PostgreSQL, so
        # unmatched/ambiguous rows never collide, but a real invoice or
        # transaction can appear at most once.
        UniqueConstraint("invoice_id", name="uq_reconciliation_invoice"),
        UniqueConstraint("transaction_id", name="uq_reconciliation_transaction"),
        Index("ix_reconciliation_org_status", "organization_id", "match_status"),
    )
