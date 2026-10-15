from typing import List, Optional

from pydantic import BaseModel, Field


class KnowledgeFilter(BaseModel):
    document_id: Optional[str] = None
    document_type: Optional[str] = None


class SearchRequest(BaseModel):
    query: str = Field(..., min_length=1)
    top_k: Optional[int] = Field(None, ge=1)
    filters: Optional[KnowledgeFilter] = None


class EvidenceItem(BaseModel):
    chunk_id: str
    document_id: str
    filename: str
    document_type: Optional[str] = None
    page_number: Optional[int] = None
    content: str
    score: float


class SearchResponse(BaseModel):
    query: str
    total: int
    results: List[EvidenceItem]


class AskRequest(BaseModel):
    query: str = Field(..., min_length=1)
    top_k: Optional[int] = Field(None, ge=1)
    filters: Optional[KnowledgeFilter] = None


class Citation(BaseModel):
    index: int
    document_id: str
    filename: str
    page_number: Optional[int] = None
    chunk_id: str
    score: float


class AskResponse(BaseModel):
    query: str
    status: str
    answer: str
    citations: List[Citation]
    evidence: List[EvidenceItem]


class IndexResponse(BaseModel):
    document_id: str
    chunks_indexed: int
