from sqlalchemy import func
from sqlalchemy.orm import Session
from app.models.transaction import BankTransaction
from typing import Dict, Iterable, List, Optional, Set
import uuid


def create_transaction(db: Session, **kwargs) -> BankTransaction:
    if "id" not in kwargs:
        kwargs["id"] = str(uuid.uuid4())
    t = BankTransaction(**kwargs)
    db.add(t)
    db.commit()
    db.refresh(t)
    return t


def find_existing_references(
    db: Session, organization_id: str, references: Iterable[str]
) -> Set[str]:
    refs = [r for r in references if r]
    if not refs:
        return set()
    rows = (
        db.query(BankTransaction.transaction_reference)
        .filter(
            BankTransaction.organization_id == organization_id,
            BankTransaction.transaction_reference.in_(refs),
        )
        .all()
    )
    return {row[0] for row in rows}


def create_transactions(
    db: Session,
    rows: List[Dict],
    organization_id: str,
    import_batch_id: str,
) -> List[str]:
    """Insert many transactions in a single transaction, rolling back on error."""
    if not rows:
        return []
    objects = [
        BankTransaction(
            id=str(uuid.uuid4()),
            organization_id=organization_id,
            import_batch_id=import_batch_id,
            **row,
        )
        for row in rows
    ]
    try:
        db.add_all(objects)
        db.commit()
    except Exception:
        db.rollback()
        raise
    return [obj.id for obj in objects]


def list_transactions(
    db: Session, organization_id: str, skip: int = 0, limit: int = 100
) -> List[BankTransaction]:
    return (
        db.query(BankTransaction)
        .filter(BankTransaction.organization_id == organization_id)
        .offset(skip)
        .limit(limit)
        .all()
    )


def get_transaction(
    db: Session, organization_id: str, transaction_id: str
) -> Optional[BankTransaction]:
    return (
        db.query(BankTransaction)
        .filter(
            BankTransaction.id == transaction_id,
            BankTransaction.organization_id == organization_id,
        )
        .first()
    )


def search_transactions(
    db: Session,
    organization_id: str,
    reference: Optional[str] = None,
    amount_min: Optional[object] = None,
    limit: int = 50,
) -> List[BankTransaction]:
    """Organization-scoped transaction search with allowlisted filters.

    ``reference`` matches the reference, description or counterparty
    (case-insensitive substring); ``amount_min`` is an inclusive floor on the
    stored amount. No caller-supplied SQL or column names are accepted.
    """
    query = db.query(BankTransaction).filter(
        BankTransaction.organization_id == organization_id
    )
    if reference:
        pattern = f"%{reference.strip().lower()}%"
        query = query.filter(
            func.lower(BankTransaction.transaction_reference).like(pattern)
            | func.lower(BankTransaction.description).like(pattern)
            | func.lower(BankTransaction.counterparty).like(pattern)
        )
    if amount_min is not None:
        query = query.filter(BankTransaction.amount >= amount_min)
    return (
        query.order_by(BankTransaction.transaction_date.desc(), BankTransaction.id)
        .limit(limit)
        .all()
    )


def count_transactions(db: Session, organization_id: str) -> int:
    return (
        db.query(func.count(BankTransaction.id))
        .filter(BankTransaction.organization_id == organization_id)
        .scalar()
        or 0
    )
