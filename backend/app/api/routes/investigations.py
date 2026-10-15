import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.agents import tools
from app.api.deps import get_db, get_embedding_provider, get_llm_client
from app.models.investigation import Investigation
from app.repositories import investigation_repository as repo
from app.schemas.investigation import (
    InvestigationCreateRequest,
    InvestigationListResponse,
    InvestigationReportSchema,
    InvestigationResponse,
)
from app.services import investigation_service as service
from app.services.embedding_service import EmbeddingProvider
from app.services.llm_client import LLMClient

logger = logging.getLogger(__name__)

router = APIRouter()

ORGANIZATION_ID = "org_1"


def _serialize(investigation: Investigation) -> InvestigationResponse:
    report = service.parse_report(investigation)
    return InvestigationResponse(
        id=investigation.id,
        organization_id=investigation.organization_id,
        created_by=investigation.created_by,
        invoice_id=investigation.invoice_id,
        reconciliation_match_id=investigation.reconciliation_match_id,
        status=investigation.status,
        workflow_state=investigation.workflow_state,
        model_name=investigation.model_name,
        report=InvestigationReportSchema(**report) if report else None,
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
    return InvestigationListResponse(
        total=total,
        skip=skip,
        limit=limit,
        items=[_serialize(item) for item in items],
    )


@router.get("/investigations/{investigation_id}", response_model=InvestigationResponse)
def get_investigation(investigation_id: str, db: Session = Depends(get_db)):
    investigation = repo.get_investigation(db, ORGANIZATION_ID, investigation_id)
    if investigation is None:
        raise HTTPException(status_code=404, detail="Investigation not found")
    return _serialize(investigation)


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
    return _serialize(investigation)


@router.post(
    "/investigations/{investigation_id}/review", response_model=InvestigationResponse
)
def review_investigation(investigation_id: str, db: Session = Depends(get_db)):
    investigation = repo.get_investigation(db, ORGANIZATION_ID, investigation_id)
    if investigation is None:
        raise HTTPException(status_code=404, detail="Investigation not found")
    raise HTTPException(
        status_code=501,
        detail="Report review is implemented in Milestone 6",
    )
