from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


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
    report: Optional[InvestigationReportSchema] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class InvestigationListResponse(BaseModel):
    total: int
    skip: int
    limit: int
    items: List[InvestigationResponse]
