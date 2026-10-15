from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.api.deps import get_current_organization_id, get_db
from app.repositories.invoice_repository import get_invoice, list_invoices
from app.schemas.invoice import InvoiceResponse
from typing import List

router = APIRouter()


@router.get("/invoices", response_model=List[InvoiceResponse])
def get_invoices(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    organization_id: str = Depends(get_current_organization_id),
):
    return list_invoices(db, organization_id, skip=skip, limit=limit)


@router.get("/invoices/{invoice_id}", response_model=InvoiceResponse)
def get_invoice_detail(
    invoice_id: str,
    db: Session = Depends(get_db),
    organization_id: str = Depends(get_current_organization_id),
):
    invoice = get_invoice(db, organization_id, invoice_id)
    if invoice is None:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return invoice
