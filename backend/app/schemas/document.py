from pydantic import BaseModel
from datetime import datetime
from typing import List, Optional


class DocumentCreate(BaseModel):
    original_filename: str
    content_type: Optional[str] = None
    document_type: Optional[str] = None


class DocumentResponse(BaseModel):
    id: str
    organization_id: str
    original_filename: str
    content_type: Optional[str]
    document_type: Optional[str]
    file_hash: Optional[str]
    file_size: Optional[int]
    page_count: Optional[int]
    processing_status: str
    created_at: datetime

    class Config:
        from_attributes = True


class DocumentPageResponse(BaseModel):
    page_number: int
    content: Optional[str]
    char_count: Optional[int]

    class Config:
        from_attributes = True


class DocumentDetailResponse(DocumentResponse):
    pages: List[DocumentPageResponse] = []


class DocumentListResponse(BaseModel):
    total: int
    skip: int
    limit: int
    items: List[DocumentResponse]


class DocumentStatusResponse(BaseModel):
    """Indexing status for one document.

    ``processing_status`` is the persisted upload/processing state stored on the
    document. ``indexing_status`` is derived solely from whether the document has
    any stored chunks; no state is invented for the client.
    """

    document_id: str
    processing_status: str
    indexing_status: str
    indexed: bool
    chunk_count: int
    page_count: Optional[int] = None
