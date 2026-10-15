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
