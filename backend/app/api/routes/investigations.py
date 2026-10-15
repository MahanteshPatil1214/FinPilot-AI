import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.agents import tools
from app.api.deps import (
    get_current_user_id,
    get_db,
    get_embedding_provider,
    get_llm_client,
)
from app.core.exceptions import (
    ReviewConflictError,
    ReviewNotEligibleError,
    ReviewNotFoundError,
)
from app.models.investigation import Investigation
from app.models.investigation_review import InvestigationReview
from app.repositories import investigation_repository as repo
from app.schemas.investigation import (
    InvestigationCreateRequest,
    InvestigationListResponse,
    InvestigationReportSchema,
    InvestigationResponse,
    ReviewDecisionRequest,
    ReviewDecisionSchema,
    ReviewHistoryResponse,
)
from app.services import investigation_review_service as review_service
from app.services import investigation_service as service
from app.services.embedding_service import EmbeddingProvider
from app.services.llm_client import LLMClient

logger = logging.getLogger(__name__)

router = APIRouter()

# Single-organization MVP: there is no authentication yet. The organization is
# fixed for the whole API and every query is scoped to it. This is a documented
# development limitation, not a security boundary.
ORGANIZATION_ID = "org_1"


def _review_schema(
    review: InvestigationReview, current_version: int
) -> ReviewDecisionSchema:
    return ReviewDecisionSchema(
        id=review.id,
        investigation_id=review.investigation_id,
        decision=review.decision,
        rationale=review.rationale,
        reviewer_id=review.reviewer_id,
        previous_status=review.previous_status,
        resulting_status=review.resulting_status,
        report_version=review.report_version,
        is_current=review.report_version == current_version,
        created_at=review.created_at,
    )


def _serialize(
    investigation: Investigation, review: Optional[InvestigationReview] = None
) -> InvestigationResponse:
    report = service.parse_report(investigation)
    current_version = int(investigation.report_version or 0)
    latest = _review_schema(review, current_version) if review is not None else None
    # A review only counts as the investigation's current review status when it
    # still applies to the current report. After a rerun the prior review becomes
    # historical (is_current=False) and the review status is cleared.
    current_decision = (
        latest.decision if latest is not None and latest.is_current else None
    )
    return InvestigationResponse(
        id=investigation.id,
        organization_id=investigation.organization_id,
        created_by=investigation.created_by,
        invoice_id=investigation.invoice_id,
        reconciliation_match_id=investigation.reconciliation_match_id,
        status=investigation.status,
        workflow_state=investigation.workflow_state,
        model_name=investigation.model_name,
        report_version=current_version,
        report=InvestigationReportSchema(**report) if report else None,
        review_status=current_decision,
        latest_review=latest,
        created_at=investigation.created_at,
        updated_at=investigation.updated_at,
    )


@router.post("/investigations", response_model=InvestigationResponse, status_code=201)
def create_investigation(
    payload: InvestigationCreateRequest,
    db: Session = Depends(get_db),
):
    if not payload.invoice_id and not payload.reconciliation_match_id:
        raise HTTPException(
            status_code=422,
            detail="Provide invoice_id or reconciliation_match_id",
        )

    if payload.invoice_id:
        invoice = tools.get_invoice(db, ORGANIZATION_ID, payload.invoice_id)
        if invoice is None:
            raise HTTPException(status_code=404, detail="Invoice not found")

    if payload.reconciliation_match_id:
        match = tools.get_reconciliation_match(
            db, ORGANIZATION_ID, payload.reconciliation_match_id
        )
        if match is None:
            raise HTTPException(status_code=404, detail="Reconciliation match not found")

    investigation = service.create_investigation(
        db,
        organization_id=ORGANIZATION_ID,
        created_by=payload.created_by,
        invoice_id=payload.invoice_id,
        reconciliation_match_id=payload.reconciliation_match_id,
    )
    return _serialize(investigation)


@router.get("/investigations", response_model=InvestigationListResponse)
def list_investigations(
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

    items, total = repo.list_investigations(
        db, ORGANIZATION_ID, status=status, skip=skip, limit=limit
    )
    latest = repo.get_latest_reviews(db, ORGANIZATION_ID, [item.id for item in items])
    return InvestigationListResponse(
        total=total,
        skip=skip,
        limit=limit,
        items=[_serialize(item, latest.get(item.id)) for item in items],
    )


@router.get("/investigations/{investigation_id}", response_model=InvestigationResponse)
def get_investigation(investigation_id: str, db: Session = Depends(get_db)):
    investigation = repo.get_investigation(db, ORGANIZATION_ID, investigation_id)
    if investigation is None:
        raise HTTPException(status_code=404, detail="Investigation not found")
    review = repo.get_latest_review(db, ORGANIZATION_ID, investigation_id)
    return _serialize(investigation, review)


@router.post(
    "/investigations/{investigation_id}/run", response_model=InvestigationResponse
)
def run_investigation(
    investigation_id: str,
    db: Session = Depends(get_db),
    embedder: EmbeddingProvider = Depends(get_embedding_provider),
    llm: LLMClient = Depends(get_llm_client),
):
    investigation = repo.get_investigation(db, ORGANIZATION_ID, investigation_id)
    if investigation is None:
        raise HTTPException(status_code=404, detail="Investigation not found")

    investigation = service.run_investigation(db, investigation, embedder, llm)
    logger.info(
        "Investigation %s finished with status %s",
        investigation_id,
        investigation.status,
    )
    review = repo.get_latest_review(db, ORGANIZATION_ID, investigation_id)
    return _serialize(investigation, review)


@router.post(
    "/investigations/{investigation_id}/review", response_model=InvestigationResponse
)
def review_investigation(
    investigation_id: str,
    payload: ReviewDecisionRequest,
    db: Session = Depends(get_db),
    reviewer_id: str = Depends(get_current_user_id),
):
    investigation = repo.get_investigation(db, ORGANIZATION_ID, investigation_id)
    if investigation is None:
        raise HTTPException(status_code=404, detail="Investigation not found")

    try:
        review_service.submit_review(
            db,
            organization_id=ORGANIZATION_ID,
            investigation=investigation,
            decision=payload.decision,
            rationale=payload.rationale,
            reviewer_id=reviewer_id,
            expected_report_version=payload.report_version,
        )
    except ReviewNotFoundError:
        raise HTTPException(status_code=404, detail="Investigation not found")
    except ReviewNotEligibleError as exc:
        raise HTTPException(
            status_code=409,
            detail=f"Investigation is not eligible for review (status '{exc.status}')",
        )
    except ReviewConflictError:
        raise HTTPException(
            status_code=409,
            detail="Stale review: the investigation changed since it was reviewed",
        )

    investigation = repo.get_investigation(db, ORGANIZATION_ID, investigation_id)
    review = repo.get_latest_review(db, ORGANIZATION_ID, investigation_id)
    logger.info(
        "Investigation %s reviewed as %s", investigation_id, payload.decision
    )
    return _serialize(investigation, review)


@router.get(
    "/investigations/{investigation_id}/reviews",
    response_model=ReviewHistoryResponse,
)
def list_investigation_reviews(
    investigation_id: str, db: Session = Depends(get_db)
):
    investigation = repo.get_investigation(db, ORGANIZATION_ID, investigation_id)
    if investigation is None:
        raise HTTPException(status_code=404, detail="Investigation not found")

    reviews = repo.list_reviews(db, ORGANIZATION_ID, investigation_id)
    current_version = int(investigation.report_version or 0)
    items = [_review_schema(review, current_version) for review in reviews]
    current = next((item for item in items if item.is_current), None)
    return ReviewHistoryResponse(
        investigation_id=investigation_id,
        total=len(items),
        review_status=current.decision if current else None,
        items=items,
    )
