"""Aggregated, read-only operational summary for the dashboard.

Composes counts from the existing repositories using aggregate queries (no
per-record loading) and guarantees that every known status appears in the
breakdowns, including zero-count ones. Nothing here mutates state.
"""

from datetime import datetime, timezone
from typing import Dict

from sqlalchemy.orm import Session

from app.models.investigation_review import DECISION_VALUES
from app.repositories import document_repository, investigation_repository
from app.repositories import reconciliation_repository
from app.repositories import invoice_repository, transaction_repository
from app.repositories.investigation_repository import REVIEWABLE_STATUSES
from app.services import investigation_service, reconciliation_service


def _fill(statuses, counts: Dict[str, int]) -> Dict[str, int]:
    """Return counts for exactly ``statuses``, defaulting missing keys to zero."""
    return {status: int(counts.get(status, 0)) for status in statuses}


def build_summary(db: Session, organization_id: str) -> dict:
    documents_total = document_repository.count_documents(db, organization_id)
    documents_indexed = document_repository.count_indexed_documents(
        db, organization_id
    )
    # Guard against a chunk referencing a document that no longer exists.
    documents_indexed = min(documents_indexed, documents_total)

    reconciliation_counts = _fill(
        reconciliation_service.ALL_STATUSES,
        reconciliation_repository.count_by_status(db, organization_id),
    )
    investigation_counts = _fill(
        investigation_service.ALL_STATUSES,
        investigation_repository.count_by_status(db, organization_id),
    )
    review_counts = _fill(
        DECISION_VALUES,
        investigation_repository.count_reviews_by_decision(db, organization_id),
    )

    awaiting_review = sum(
        investigation_counts[status]
        for status in REVIEWABLE_STATUSES
        if status in investigation_counts
    )

    return {
        "organization_id": organization_id,
        "generated_at": datetime.now(timezone.utc),
        "invoices_imported": invoice_repository.count_invoices(db, organization_id),
        "transactions_imported": transaction_repository.count_transactions(
            db, organization_id
        ),
        "documents_total": documents_total,
        "documents_indexed": documents_indexed,
        "documents_pending_indexing": documents_total - documents_indexed,
        "reconciliation": {
            "total": sum(reconciliation_counts.values()),
            "counts": reconciliation_counts,
        },
        "investigations": {
            "total": sum(investigation_counts.values()),
            "counts": investigation_counts,
        },
        "reviews": {
            "total": sum(review_counts.values()),
            "counts": review_counts,
        },
        "investigations_awaiting_review": awaiting_review,
    }
