"""Persistence for investigation records (organization-scoped)."""

import json
import uuid
from typing import Dict, List, Optional, Tuple

from sqlalchemy import func, text
from sqlalchemy.orm import Session

from app.core.exceptions import (
    ReviewConflictError,
    ReviewNotEligibleError,
    ReviewNotFoundError,
)
from app.models.audit_event import AuditEvent
from app.models.investigation import Investigation
from app.models.investigation_review import InvestigationReview

# An investigation can only be reviewed once it has a report and is awaiting a
# human decision. Terminal review outcomes (approved/rejected/
# needs_more_information) and in-flight states (pending/running/failed) are not
# reviewable, which prevents conflicting re-submissions.
REVIEWABLE_STATUSES = ("completed", "needs_review")


def create_investigation(
    db: Session,
    organization_id: str,
    created_by: Optional[str] = None,
    invoice_id: Optional[str] = None,
    reconciliation_match_id: Optional[str] = None,
) -> Investigation:
    investigation = Investigation(
        id=str(uuid.uuid4()),
        organization_id=organization_id,
        created_by=created_by,
        invoice_id=invoice_id,
        reconciliation_match_id=reconciliation_match_id,
        status="pending",
        workflow_state="pending",
    )
    try:
        db.add(investigation)
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(investigation)
    return investigation


def get_investigation(
    db: Session, organization_id: str, investigation_id: str
) -> Optional[Investigation]:
    return (
        db.query(Investigation)
        .filter(
            Investigation.id == investigation_id,
            Investigation.organization_id == organization_id,
        )
        .first()
    )


def list_investigations(
    db: Session,
    organization_id: str,
    status: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
) -> Tuple[List[Investigation], int]:
    query = db.query(Investigation).filter(
        Investigation.organization_id == organization_id
    )
    if status is not None:
        query = query.filter(Investigation.status == status)
    total = query.count()
    items = (
        query.order_by(Investigation.created_at.desc(), Investigation.id.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return items, total


def update_investigation(
    db: Session, investigation: Investigation, **fields
) -> Investigation:
    """Atomically update the given investigation.

    Commits on success and rolls back on failure so a failed run never leaves a
    partially written report.
    """
    try:
        for key, value in fields.items():
            setattr(investigation, key, value)
        db.add(investigation)
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(investigation)
    return investigation


def list_reviews(
    db: Session, organization_id: str, investigation_id: str
) -> List[InvestigationReview]:
    return (
        db.query(InvestigationReview)
        .filter(
            InvestigationReview.organization_id == organization_id,
            InvestigationReview.investigation_id == investigation_id,
        )
        .order_by(
            InvestigationReview.report_version.desc(),
            InvestigationReview.created_at.desc(),
            InvestigationReview.id.desc(),
        )
        .all()
    )


def get_latest_review(
    db: Session, organization_id: str, investigation_id: str
) -> Optional[InvestigationReview]:
    return (
        db.query(InvestigationReview)
        .filter(
            InvestigationReview.organization_id == organization_id,
            InvestigationReview.investigation_id == investigation_id,
        )
        .order_by(
            InvestigationReview.report_version.desc(),
            InvestigationReview.created_at.desc(),
            InvestigationReview.id.desc(),
        )
        .first()
    )


def count_by_status(db: Session, organization_id: str) -> Dict[str, int]:
    """Investigation counts per status for one organization (single query)."""
    rows = (
        db.query(Investigation.status, func.count())
        .filter(Investigation.organization_id == organization_id)
        .group_by(Investigation.status)
        .all()
    )
    return {status: count for status, count in rows}


def count_reviews_by_decision(db: Session, organization_id: str) -> Dict[str, int]:
    """Review-decision counts for one organization (single query)."""
    rows = (
        db.query(InvestigationReview.decision, func.count())
        .filter(InvestigationReview.organization_id == organization_id)
        .group_by(InvestigationReview.decision)
        .all()
    )
    return {decision: count for decision, count in rows}


def get_latest_reviews(
    db: Session, organization_id: str, investigation_ids: List[str]
) -> Dict[str, InvestigationReview]:
    """Return the most recent review per investigation id (avoids N+1)."""
    if not investigation_ids:
        return {}
    rows = (
        db.query(InvestigationReview)
        .filter(
            InvestigationReview.organization_id == organization_id,
            InvestigationReview.investigation_id.in_(investigation_ids),
        )
        .order_by(
            InvestigationReview.report_version.desc(),
            InvestigationReview.created_at.desc(),
            InvestigationReview.id.desc(),
        )
        .all()
    )
    latest: Dict[str, InvestigationReview] = {}
    for row in rows:
        latest.setdefault(row.investigation_id, row)
    return latest


def record_review_decision(
    db: Session,
    *,
    investigation: Investigation,
    organization_id: str,
    decision: str,
    resulting_status: str,
    rationale: str,
    reviewer_id: Optional[str],
    expected_report_version: int,
) -> InvestigationReview:
    """Atomically record a review decision, its audit event and the new status.

    The eligibility and staleness checks are re-run inside the transaction,
    under a lock, so two submissions racing on the same investigation cannot
    both succeed. Everything (review row, audit event and status update)
    commits once; any failure rolls back cleanly.

    ``report_version`` is the version of the generated report the reviewer acted
    on. It is *not* changed here: it only advances when a report is (re)generated
    (see ``investigation_service.run_investigation``). Keeping it stable is what
    lets a rerun mark prior reviews as superseded while preserving history.

    Only INSERTs are performed for the append-only ``investigation_reviews`` and
    ``audit_events`` tables; existing rows are never updated or deleted.

    Raises ``ReviewNotFoundError``, ``ReviewNotEligibleError`` or
    ``ReviewConflictError`` for expected rejections.
    """
    try:
        if db.get_bind().dialect.name == "postgresql":
            # Serialise concurrent reviews for the same investigation.
            db.execute(
                text("SELECT pg_advisory_xact_lock(hashtext(:key)::bigint)"),
                {"key": investigation.id},
            )

        current = (
            db.query(Investigation)
            .filter(
                Investigation.id == investigation.id,
                Investigation.organization_id == organization_id,
            )
            .with_for_update()
            .first()
        )
        if current is None:
            raise ReviewNotFoundError("Investigation not found")
        if current.status not in REVIEWABLE_STATUSES:
            raise ReviewNotEligibleError(current.status)

        previous_status = current.status
        current_version = int(current.report_version or 0)
        if current_version != expected_report_version:
            raise ReviewConflictError(expected_report_version, current_version)

        review = InvestigationReview(
            id=str(uuid.uuid4()),
            investigation_id=current.id,
            organization_id=organization_id,
            reviewer_id=reviewer_id,
            decision=decision,
            rationale=rationale,
            previous_status=previous_status,
            resulting_status=resulting_status,
            report_version=current_version,
        )
        audit = AuditEvent(
            id=str(uuid.uuid4()),
            organization_id=organization_id,
            actor_id=reviewer_id,
            entity_type="investigation",
            entity_id=current.id,
            action="review_decision",
            details_json=json.dumps(
                {
                    "decision": decision,
                    "previous_status": previous_status,
                    "resulting_status": resulting_status,
                    "report_version": current_version,
                    "reviewer_id": reviewer_id,
                }
            ),
        )

        # The investigation's report_version is intentionally left unchanged: a
        # review annotates the current report, it does not produce a new one.
        current.status = resulting_status

        db.add(review)
        db.add(audit)
        db.add(current)
        db.commit()
    except Exception:
        db.rollback()
        raise

    db.refresh(review)
    return review
