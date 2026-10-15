from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


class InvestigationCreateRequest(BaseModel):
    invoice_id: Optional[str] = None
    reconciliation_match_id: Optional[str] = None
    created_by: Optional[str] = None


class Citation(BaseModel):
    index: int
    kind: str
    document_id: Optional[str] = None
    filename: Optional[str] = None
    document_type: Optional[str] = None
    page_number: Optional[int] = None
    chunk_id: Optional[str] = None
    score: Optional[float] = None
    record_type: Optional[str] = None
    record_id: Optional[str] = None


class Finding(BaseModel):
    statement: str
    kind: str
    citations: List[int] = Field(default_factory=list)


class InvestigationReportSchema(BaseModel):
    summary: str
    findings: List[Finding] = Field(default_factory=list)
    missing_evidence: List[str] = Field(default_factory=list)
    recommended_action: str
    confidence: str
    requires_human_review: bool
    citations: List[Citation] = Field(default_factory=list)


ReviewDecisionValue = Literal["approved", "rejected", "needs_more_information"]


class ReviewDecisionRequest(BaseModel):
    """Human review submission.

    No reviewer identity is accepted from the client: identity is derived
    server-side and never trusted from the request body. Unknown fields (such as
    a client-supplied ``reviewer_id``) are rejected outright.
    """

    model_config = ConfigDict(extra="forbid")

    decision: ReviewDecisionValue
    rationale: str = Field(min_length=1, max_length=2000)
    report_version: int = Field(ge=0)

    @field_validator("rationale")
    @classmethod
    def _rationale_not_blank(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("rationale must not be empty or whitespace only")
        return cleaned


class ReviewDecisionSchema(BaseModel):
    id: str
    investigation_id: str
    decision: str
    rationale: str
    reviewer_id: Optional[str] = None
    previous_status: str
    resulting_status: str
    report_version: int
    # True when this review still applies to the investigation's current report
    # (its report_version matches). False once the report is regenerated.
    is_current: bool = True
    created_at: Optional[datetime] = None


class ReviewHistoryResponse(BaseModel):
    investigation_id: str
    total: int
    review_status: Optional[str] = None
    items: List[ReviewDecisionSchema] = Field(default_factory=list)


class InvestigationResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    id: str
    organization_id: str
    created_by: Optional[str] = None
    invoice_id: Optional[str] = None
    reconciliation_match_id: Optional[str] = None
    status: str
    workflow_state: Optional[str] = None
    model_name: Optional[str] = None
    report_version: int = 0
    report: Optional[InvestigationReportSchema] = None
    review_status: Optional[str] = None
    latest_review: Optional[ReviewDecisionSchema] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class InvestigationListResponse(BaseModel):
    total: int
    skip: int
    limit: int
    items: List[InvestigationResponse]
