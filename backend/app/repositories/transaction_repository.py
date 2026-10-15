from sqlalchemy.orm import Session
from app.models.transaction import BankTransaction
from typing import Dict, Iterable, List, Set
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


def list_transactions(db: Session, skip: int = 0, limit: int = 100) -> List[BankTransaction]:
    return db.query(BankTransaction).offset(skip).limit(limit).all()
