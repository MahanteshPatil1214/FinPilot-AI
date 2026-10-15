from sqlalchemy.orm import Session
from app.models.invoice import Invoice
from typing import List
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


def list_invoices(db: Session, skip: int = 0, limit: int = 100) -> List[Invoice]:
    return db.query(Invoice).offset(skip).limit(limit).all()
