"""Shared state passed between investigation graph nodes."""

from typing import Any, Dict, List, Optional, TypedDict


class InvestigationState(TypedDict, total=False):
    # Identity / request
    investigation_id: str
    organization_id: str
    invoice_id: Optional[str]
    reconciliation_match_id: Optional[str]

    # Deterministically gathered records (dicts of the tool schemas)
    invoice: Optional[Dict[str, Any]]
    match: Optional[Dict[str, Any]]
    transaction: Optional[Dict[str, Any]]

    # Facts + assessment
    facts: Dict[str, Any]
    assessment: Dict[str, Any]

    # Retrieval
    query: str
    evidence: List[Dict[str, Any]]
    usable_evidence: List[Dict[str, Any]]

    # Report generation
    report: Optional[Dict[str, Any]]
    raw_response: str
    report_valid: bool
    retry_count: int
    llm_used: bool

    # Outcome
    errors: List[str]
    status: str
    workflow_state: str
    requires_human_review: bool
