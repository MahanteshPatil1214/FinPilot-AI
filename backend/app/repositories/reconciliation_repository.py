import uuid
from typing import Dict, List, Optional, Tuple

from sqlalchemy import func, text
from sqlalchemy.orm import Session

from app.models.invoice import Invoice
from app.models.reconciliation_match import ReconciliationMatch
from app.models.transaction import BankTransaction


def list_invoices_for_org(db: Session, organization_id: str) -> List[Invoice]:
    return (
        db.query(Invoice)
        .filter(Invoice.organization_id == organization_id)
        .order_by(Invoice.id)
        .all()
    )


def list_transactions_for_org(db: Session, organization_id: str) -> List[BankTransaction]:
    return (
        db.query(BankTransaction)
        .filter(BankTransaction.organization_id == organization_id)
        .order_by(BankTransaction.id)
        .all()
    )


def replace_matches_for_org(
    db: Session, organization_id: str, rows: List[Dict]
) -> int:
    """Atomically replace all reconciliation rows for one organization.

    The delete and the inserts happen in a single transaction, so a failure
    rolls back cleanly and the previous results are preserved. On PostgreSQL a
    transaction-scoped advisory lock keyed on the organization serialises
    concurrent runs for the same organization.
    """
    try:
        if db.get_bind().dialect.name == "postgresql":
            db.execute(
                text("SELECT pg_advisory_xact_lock(hashtext(:key)::bigint)"),
                {"key": organization_id},
            )
        db.query(ReconciliationMatch).filter(
            ReconciliationMatch.organization_id == organization_id
        ).delete(synchronize_session=False)
        db.add_all(
            [
                ReconciliationMatch(
                    id=str(uuid.uuid4()),
                    organization_id=organization_id,
                    **row,
                )
                for row in rows
            ]
        )
        db.commit()
        return len(rows)
    except Exception:
        db.rollback()
        raise


def list_matches(
    db: Session,
    organization_id: str,
    status: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
) -> Tuple[List[ReconciliationMatch], int]:
    query = db.query(ReconciliationMatch).filter(
        ReconciliationMatch.organization_id == organization_id
    )
    if status is not None:
        query = query.filter(ReconciliationMatch.match_status == status)
    total = query.count()
    items = (
        query.order_by(
            ReconciliationMatch.match_status,
            ReconciliationMatch.invoice_id,
            ReconciliationMatch.transaction_id,
            ReconciliationMatch.id,
        )
        .offset(skip)
        .limit(limit)
        .all()
    )
    return items, total


def get_match(
    db: Session, organization_id: str, match_id: str
) -> Optional[ReconciliationMatch]:
    return (
        db.query(ReconciliationMatch)
        .filter(
            ReconciliationMatch.id == match_id,
            ReconciliationMatch.organization_id == organization_id,
        )
        .first()
    )


def search_matches_with_records(
    db: Session,
    organization_id: str,
    status: Optional[str] = None,
    limit: int = 100,
) -> List[Tuple[ReconciliationMatch, Optional[Invoice], Optional[BankTransaction]]]:
    """Return matches (optionally by status) joined to their invoice/transaction.

    Read-only and organization-scoped. The join lets a caller reason about the
    effective amount (transaction amount, else invoice total) without a second
    round-trip per row. Ordering is deterministic for stable pagination.
    """
    query = (
        db.query(ReconciliationMatch, Invoice, BankTransaction)
        .outerjoin(Invoice, ReconciliationMatch.invoice_id == Invoice.id)
        .outerjoin(
            BankTransaction,
            ReconciliationMatch.transaction_id == BankTransaction.id,
        )
        .filter(ReconciliationMatch.organization_id == organization_id)
    )
    if status is not None:
        query = query.filter(ReconciliationMatch.match_status == status)
    return (
        query.order_by(
            ReconciliationMatch.match_status,
            ReconciliationMatch.id,
        )
        .limit(limit)
        .all()
    )


def count_by_status(db: Session, organization_id: str) -> Dict[str, int]:
    rows = (
        db.query(ReconciliationMatch.match_status, func.count())
        .filter(ReconciliationMatch.organization_id == organization_id)
        .group_by(ReconciliationMatch.match_status)
        .all()
    )
    return {status: count for status, count in rows}
