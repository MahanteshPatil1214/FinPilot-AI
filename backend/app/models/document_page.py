from sqlalchemy import Column, String, DateTime, Text, Integer, ForeignKey
from sqlalchemy.sql import func
from app.db.base import Base


class DocumentPage(Base):
    """Page-level extracted text, ready for future RAG chunking.

    Embeddings/vector search are intentionally out of scope at this stage.
    """

    __tablename__ = "document_pages"

    id = Column(String(36), primary_key=True)
    organization_id = Column(String(36), nullable=False)
    document_id = Column(String(36), ForeignKey("documents.id"), nullable=False, index=True)
    page_number = Column(Integer, nullable=False)
    content = Column(Text)
    char_count = Column(Integer)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
