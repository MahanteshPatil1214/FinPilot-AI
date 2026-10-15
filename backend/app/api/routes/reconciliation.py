import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.core.config import settings
from app.repositories import reconciliation_repository as repo
from app.schemas.reconciliation import (
    MatchResponse,
    ReconciliationResultsResponse,
    ReconciliationRunRequest,
    ReconciliationRunResponse,
)
from app.services import reconciliation_service as service

logger = logging.getLogger(__name__)

router = APIRouter()

ORGANIZATION_ID = "org_1"


@router.post("/reconciliation/run", response_model=ReconciliationRunResponse)
def run_reconciliation(
    payload: Optional[ReconciliationRunRequest] = Body(default=None),
    db: Session = Depends(get_db),
):
    organization_id = ORGANIZATION_ID
    window = settings.RECONCILIATION_DATE_WINDOW_DAYS
    if payload is not None and payload.date_window_days is not None:
        if payload.date_window_days < 0:
            raise HTTPException(
                status_code=422, detail="date_window_days must be zero or positive"
            )
        window = payload.date_window_days

    invoices = repo.list_invoices_for_org(db, organization_id)
    transactions = repo.list_transactions_for_org(db, organization_id)

    results = service.build_matches(invoices, transactions, window)

    try:
        repo.replace_matches_for_org(db, organization_id, results)
    except Exception as exc:  # pragma: no cover - defensive
        # Log only the type; instance messages may embed amounts/descriptions.
        logger.error("Reconciliation run failed (error: %s)", type(exc).__name__)
        raise HTTPException(status_code=500, detail="Failed to store reconciliation results")

    counts = service.summarize(results)
    logger.info(
        "Reconciled %d invoice(s) against %d transaction(s); %d result row(s)",
        len(invoices),
        len(transactions),
        len(results),
    )
    return ReconciliationRunResponse(
        organization_id=organization_id,
        date_window_days=window,
        generated_at=datetime.now(timezone.utc),
        total_matches=len(results),
        counts=counts,
    )


@router.get("/reconciliation/results", response_model=ReconciliationResultsResponse)
def get_reconciliation_results(
    status: Optional[str] = Query(default=None),
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    if status is not None and status not in service.ALL_STATUSES:
        raise HTTPException(
            status_code=422,
            detail=f"Unknown status. Expected one of: {', '.join(service.ALL_STATUSES)}",
        )
    if skip < 0 or limit < 1:
        raise HTTPException(status_code=422, detail="invalid pagination")

    organization_id = ORGANIZATION_ID
    items, total = repo.list_matches(
        db, organization_id, status=status, skip=skip, limit=limit
    )
    counts = {status_name: 0 for status_name in service.ALL_STATUSES}
    counts.update(repo.count_by_status(db, organization_id))
    return ReconciliationResultsResponse(
        organization_id=organization_id,
        total=total,
        skip=skip,
        limit=limit,
        counts=counts,
        items=[MatchResponse.model_validate(item) for item in items],
    )


@router.get("/reconciliation/results/{match_id}", response_model=MatchResponse)
def get_reconciliation_result(match_id: str, db: Session = Depends(get_db)):
    match = repo.get_match(db, ORGANIZATION_ID, match_id)
    if match is None:
        raise HTTPException(status_code=404, detail="Match not found")
    return MatchResponse.model_validate(match)
