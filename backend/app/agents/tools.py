"""Deterministic, allowlisted tools for the investigation workflow.

These are the only operations the workflow may perform to gather evidence. They
are plain Python functions with strict Pydantic input/output schemas, scoped to
an organization, and are strictly read-only: none of them can change
reconciliation results, payments or vendor bank details. The LLM never chooses
which tool to run - the graph calls them deterministically.
"""

from datetime import date
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from app.models.invoice import Invoice
from app.models.reconciliation_match import ReconciliationMatch
from app.models.transaction import BankTransaction
from app.services.embedding_service import EmbeddingProvider
from app.services.retrieval_service import retrieve


class InvoiceRecord(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    invoice_number: Optional[str] = None
    vendor_id: Optional[str] = None
    invoice_date: Optional[date] = None
    due_date: Optional[date] = None
    currency: Optional[str] = None
    total_amount: Optional[Decimal] = None
    source_document_id: Optional[str] = None
    extraction_status: Optional[str] = None


class TransactionRecord(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    transaction_reference: Optional[str] = None
    transaction_date: Optional[date] = None
    description: Optional[str] = None
    amount: Optional[Decimal] = None
    currency: Optional[str] = None
    counterparty: Optional[str] = None


class ReconciliationRecord(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    invoice_id: Optional[str] = None
    transaction_id: Optional[str] = None
    match_status: str
    matching_method: str
    difference_amount: Optional[Decimal] = None
    explanation: Optional[str] = None


class DocumentPassage(BaseModel):
    chunk_id: str
    document_id: str
    filename: str
    document_type: Optional[str] = None
    page_number: Optional[int] = None
    content: str
    score: float


def get_invoice(
    db: Session, organization_id: str, invoice_id: str
) -> Optional[InvoiceRecord]:
    invoice = (
        db.query(Invoice)
        .filter(
            Invoice.id == invoice_id,
            Invoice.organization_id == organization_id,
        )
        .first()
    )
    return InvoiceRecord.model_validate(invoice) if invoice else None


def get_transaction(
    db: Session, organization_id: str, transaction_id: str
) -> Optional[TransactionRecord]:
    transaction = (
        db.query(BankTransaction)
        .filter(
            BankTransaction.id == transaction_id,
            BankTransaction.organization_id == organization_id,
        )
        .first()
    )
    return TransactionRecord.model_validate(transaction) if transaction else None


def get_reconciliation_for_invoice(
    db: Session, organization_id: str, invoice_id: str
) -> List[ReconciliationRecord]:
    rows = (
        db.query(ReconciliationMatch)
        .filter(
            ReconciliationMatch.invoice_id == invoice_id,
            ReconciliationMatch.organization_id == organization_id,
        )
        .order_by(ReconciliationMatch.id)
        .all()
    )
    return [ReconciliationRecord.model_validate(row) for row in rows]


def get_reconciliation_match(
    db: Session, organization_id: str, match_id: str
) -> Optional[ReconciliationRecord]:
    row = (
        db.query(ReconciliationMatch)
        .filter(
            ReconciliationMatch.id == match_id,
            ReconciliationMatch.organization_id == organization_id,
        )
        .first()
    )
    return ReconciliationRecord.model_validate(row) if row else None


def calculate_payment_difference(
    invoice: Optional[InvoiceRecord],
    match: Optional[ReconciliationRecord],
    transaction: Optional[TransactionRecord],
) -> tuple[Optional[Decimal], Optional[str]]:
    """Return (difference, source).

    Prefers the stored deterministic reconciliation difference so the workflow
    never diverges from the engine. Falls back to a pure ``Decimal``
    subtraction only when both records exist and no stored difference is
    available.
    """
    if match is not None and match.difference_amount is not None:
        return match.difference_amount, "reconciliation_record"
    if (
        invoice is not None
        and invoice.total_amount is not None
        and transaction is not None
        and transaction.amount is not None
    ):
        difference = (invoice.total_amount - transaction.amount).quantize(
            Decimal("0.01")
        )
        return difference, "computed_from_records"
    return None, None


def search_financial_documents(
    db: Session,
    organization_id: str,
    query: str,
    embedder: EmbeddingProvider,
    document_type: Optional[str] = None,
    top_k: Optional[int] = None,
) -> List[DocumentPassage]:
    rows = retrieve(
        db,
        query,
        organization_id,
        embedder,
        top_k=top_k,
        document_type=document_type,
    )
    return [DocumentPassage(**row) for row in rows]


def get_vendor_payment_terms(
    db: Session,
    organization_id: str,
    vendor_id: Optional[str],
    invoice: Optional[InvoiceRecord],
    embedder: EmbeddingProvider,
) -> List[DocumentPassage]:
    """Retrieve passages that describe payment terms/discount policy."""
    parts = ["vendor agreement payment terms", "discount policy", "installment"]
    if vendor_id:
        parts.append(str(vendor_id))
    if invoice and invoice.invoice_number:
        parts.append(str(invoice.invoice_number))
    return search_financial_documents(
        db, organization_id, " ".join(parts), embedder
    )


def build_investigation_query(
    invoice: Optional[InvoiceRecord], match: Optional[ReconciliationRecord]
) -> str:
    """Deterministic RAG query for the discrepancy."""
    parts = ["payment terms", "discount", "policy", "vendor agreement"]
    if invoice is not None:
        if invoice.invoice_number:
            parts.append(f"invoice {invoice.invoice_number}")
        if invoice.vendor_id:
            parts.append(f"vendor {invoice.vendor_id}")
        if invoice.currency:
            parts.append(str(invoice.currency))
    return " ".join(parts)


__all__ = [
    "InvoiceRecord",
    "TransactionRecord",
    "ReconciliationRecord",
    "DocumentPassage",
    "get_invoice",
    "get_transaction",
    "get_reconciliation_for_invoice",
    "get_reconciliation_match",
    "calculate_payment_difference",
    "search_financial_documents",
    "get_vendor_payment_terms",
    "build_investigation_query",
]
