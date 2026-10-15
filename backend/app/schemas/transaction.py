from pydantic import BaseModel
from decimal import Decimal
from datetime import date, datetime
from typing import Optional


class TransactionCreate(BaseModel):
    organization_id: str = "org_1"
    transaction_reference: Optional[str] = None
    transaction_date: Optional[date] = None
    description: Optional[str] = None
    amount: Optional[Decimal] = None
    currency: Optional[str] = "INR"
    counterparty: Optional[str] = None
    source_document_id: Optional[str] = None
    import_batch_id: Optional[str] = None


class TransactionResponse(BaseModel):
    id: str
    organization_id: str
    transaction_reference: Optional[str]
    transaction_date: Optional[date]
    description: Optional[str]
    amount: Optional[Decimal]
    currency: Optional[str]
    counterparty: Optional[str]
    source_document_id: Optional[str]
    import_batch_id: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True
