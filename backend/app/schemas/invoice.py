from pydantic import BaseModel
from decimal import Decimal
from datetime import date, datetime
from typing import Optional


class InvoiceCreate(BaseModel):
    organization_id: str = "org_1"
    invoice_number: Optional[str] = None
    invoice_date: Optional[date] = None
    due_date: Optional[date] = None
    currency: Optional[str] = "INR"
    total_amount: Optional[Decimal] = None
    source_document_id: Optional[str] = None
    extraction_status: str = "pending"


class InvoiceResponse(BaseModel):
    id: str
    organization_id: str
    invoice_number: Optional[str]
    invoice_date: Optional[date]
    due_date: Optional[date]
    currency: Optional[str]
    total_amount: Optional[Decimal]
    source_document_id: Optional[str]
    extraction_status: str
    created_at: datetime

    class Config:
        from_attributes = True
