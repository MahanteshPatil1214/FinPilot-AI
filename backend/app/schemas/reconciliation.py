from datetime import datetime
from decimal import Decimal
from typing import Dict, List, Optional

from pydantic import BaseModel


class ReconciliationRunRequest(BaseModel):
    # Optional override of the configured date-window; must be positive.
    date_window_days: Optional[int] = None


class MatchResponse(BaseModel):
    id: str
    organization_id: str
    invoice_id: Optional[str]
    transaction_id: Optional[str]
    match_status: str
    matching_method: str
    difference_amount: Optional[Decimal]
    explanation: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class ReconciliationRunResponse(BaseModel):
    organization_id: str
    date_window_days: int
    generated_at: datetime
    total_matches: int
    counts: Dict[str, int]


class ReconciliationResultsResponse(BaseModel):
    organization_id: str
    total: int
    skip: int
    limit: int
    counts: Dict[str, int]
    items: List[MatchResponse]
