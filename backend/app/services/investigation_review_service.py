"""Human review orchestration for investigations.

A review records a human decision, appends an audit event and moves the
investigation to its resulting status - all in one atomic transaction. Reviews
never touch reconciliation results, invoice amounts, transactions or bank
details; they only annotate the investigation and its audit trail.
"""

from typing import Optional

from sqlalchemy.orm import Session

from app.models.investigation import Investigation
from app.models.investigation_review import InvestigationReview
from app.repositories import investigation_repository as repo

# Review decisions accepted by the API (also enforced by the request schema).
DECISION_TO_STATUS = {
    "approved": "approved",
    "rejected": "rejected",
    "needs_more_information": "needs_more_information",
}


def submit_review(
    db: Session,
    *,
    organization_id: str,
    investigation: Investigation,
    decision: str,
    rationale: str,
    reviewer_id: Optional[str],
    expected_report_version: int,
) -> InvestigationReview:
    """Record one human review decision atomically.

    ``reviewer_id`` must be derived server-side; it is never taken from the
    request body. Raises domain errors for not-found / not-eligible / stale
    submissions.
    """
    resulting_status = DECISION_TO_STATUS.get(decision)
    if resulting_status is None:
        raise ValueError(f"unsupported decision: {decision}")

    return repo.record_review_decision(
        db,
        investigation=investigation,
        organization_id=organization_id,
        decision=decision,
        resulting_status=resulting_status,
        rationale=rationale,
        reviewer_id=reviewer_id,
        expected_report_version=expected_report_version,
    )
