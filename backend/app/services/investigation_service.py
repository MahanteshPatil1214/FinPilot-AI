"""Investigation orchestration: create, run the graph, persist the report.

The service is the only place that writes investigation state. It never touches
reconciliation results, payments or vendor bank details. A run is atomic: on
success the validated report and status are stored in one commit; on failure the
record is marked ``failed`` with a short reason.
"""

import json
import logging
from typing import Optional

from sqlalchemy.orm import Session

from app.agents.graph import build_investigation_graph
from app.core.config import settings
from app.models.investigation import Investigation
from app.repositories import investigation_repository as repo
from app.services.embedding_service import EmbeddingProvider
from app.services.llm_client import LLMClient

logger = logging.getLogger(__name__)

STATUS_PENDING = "pending"
STATUS_RUNNING = "running"
STATUS_COMPLETED = "completed"
STATUS_NEEDS_REVIEW = "needs_review"
STATUS_FAILED = "failed"
# Terminal review outcomes.
STATUS_APPROVED = "approved"
STATUS_REJECTED = "rejected"
STATUS_NEEDS_MORE_INFORMATION = "needs_more_information"

ALL_STATUSES = (
    STATUS_PENDING,
    STATUS_RUNNING,
    STATUS_COMPLETED,
    STATUS_NEEDS_REVIEW,
    STATUS_FAILED,
    STATUS_APPROVED,
    STATUS_REJECTED,
    STATUS_NEEDS_MORE_INFORMATION,
)

DETERMINISTIC_MODEL_LABEL = "deterministic"


def create_investigation(
    db: Session,
    organization_id: str,
    created_by: Optional[str] = None,
    invoice_id: Optional[str] = None,
    reconciliation_match_id: Optional[str] = None,
) -> Investigation:
    return repo.create_investigation(
        db,
        organization_id=organization_id,
        created_by=created_by,
        invoice_id=invoice_id,
        reconciliation_match_id=reconciliation_match_id,
    )


def parse_report(investigation: Investigation) -> Optional[dict]:
    if not investigation.report_json:
        return None
    try:
        return json.loads(investigation.report_json)
    except (ValueError, TypeError):
        return None


def run_investigation(
    db: Session,
    investigation: Investigation,
    embedder: EmbeddingProvider,
    llm: LLMClient,
) -> Investigation:
    """Run the bounded graph and persist the outcome. No financial side effects."""
    repo.update_investigation(db, investigation, status=STATUS_RUNNING)

    initial_state = {
        "investigation_id": investigation.id,
        "organization_id": investigation.organization_id,
        "invoice_id": investigation.invoice_id,
        "reconciliation_match_id": investigation.reconciliation_match_id,
        "errors": [],
    }

    try:
        graph = build_investigation_graph(db, embedder, llm)
        final_state = graph.invoke(initial_state)
    except Exception as exc:  # pragma: no cover - defensive
        logger.error(
            "Investigation %s failed (error: %s)", investigation.id, type(exc).__name__
        )
        return repo.update_investigation(
            db,
            investigation,
            status=STATUS_FAILED,
            workflow_state="failed",
        )

    report = final_state.get("report")
    status = final_state.get("status") or STATUS_NEEDS_REVIEW
    if report is None:
        status = STATUS_FAILED
    model_name = (
        settings.GROQ_MODEL_NAME
        if final_state.get("llm_used")
        else DETERMINISTIC_MODEL_LABEL
    )

    # A (re)generated report advances the version so any review the reviewer was
    # looking at becomes detectably stale.
    report_version = int(investigation.report_version or 0)
    if report is not None:
        report_version += 1

    return repo.update_investigation(
        db,
        investigation,
        status=status,
        workflow_state=final_state.get("workflow_state"),
        report_json=json.dumps(report) if report is not None else None,
        model_name=model_name,
        report_version=report_version,
    )
