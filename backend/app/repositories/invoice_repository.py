from sqlalchemy import func
from sqlalchemy.orm import Session
from app.models.invoice import Invoice
from typing import List, Optional
import uuid


def create_invoice(db: Session, **kwargs) -> Invoice:
    if "id" not in kwargs:
        kwargs["id"] = str(uuid.uuid4())
    inv = Invoice(**kwargs)
    try:
        db.add(inv)
        db.commit()
    except Exception:
        # Leave the session usable for the caller's best-effort handling.
        db.rollback()
        raise
    db.refresh(inv)
    return inv


def list_invoices(
    db: Session, organization_id: str, skip: int = 0, limit: int = 100
) -> List[Invoice]:
    return (
        db.query(Invoice)
        .filter(Invoice.organization_id == organization_id)
        .offset(skip)
        .limit(limit)
        .all()
    )


def get_invoice(
    db: Session, organization_id: str, invoice_id: str
) -> Optional[Invoice]:
    return (
        db.query(Invoice)
        .filter(
            Invoice.id == invoice_id,
            Invoice.organization_id == organization_id,
        )
        .first()
    )


def count_invoices(db: Session, organization_id: str) -> int:
    return (
        db.query(func.count(Invoice.id))
        .filter(Invoice.organization_id == organization_id)
        .scalar()
        or 0
    )
