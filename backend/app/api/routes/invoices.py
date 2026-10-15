from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.repositories.invoice_repository import list_invoices
from app.schemas.invoice import InvoiceResponse
from typing import List

router = APIRouter()


@router.get("/invoices", response_model=List[InvoiceResponse])
def get_invoices(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return list_invoices(db, skip=skip, limit=limit)
