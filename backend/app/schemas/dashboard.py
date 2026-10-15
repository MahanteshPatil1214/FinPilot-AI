from datetime import datetime
from typing import Dict

from pydantic import BaseModel


class StatusCounts(BaseModel):
    """Total plus a per-status breakdown where every known status is present.

    Keys are always the full set of statuses the domain understands, so a
    status with zero rows is represented as ``0`` rather than omitted.
    """

    total: int
    counts: Dict[str, int]


class DashboardSummaryResponse(BaseModel):
    """Aggregated operational summary for one organization.

    All figures are derived from persisted records with aggregate queries; no
    metrics are invented and no financial records are modified.
    """

    organization_id: str
    generated_at: datetime
    invoices_imported: int
    transactions_imported: int
    documents_total: int
    documents_indexed: int
    documents_pending_indexing: int
    reconciliation: StatusCounts
    investigations: StatusCounts
    reviews: StatusCounts
    investigations_awaiting_review: int
