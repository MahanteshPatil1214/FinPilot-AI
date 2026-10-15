from sqlalchemy import Column, String, DateTime, Text, Integer, JSON, Index
from sqlalchemy.sql import func
from pgvector.sqlalchemy import Vector

from app.core.config import settings
from app.db.base import Base


class DocumentChunk(Base):
    """A contiguous, page-tagged slice of a document plus its embedding.

    The embedding uses pgvector's ``Vector`` type on PostgreSQL. SQLite (used by
    the test suite) has no vector type, so the column degrades to ``JSON`` and
    similarity is computed in Python there. Production always uses pgvector.
    """

    __tablename__ = "document_chunks"

    id = Column(String(36), primary_key=True)
    organization_id = Column(String(36), nullable=False, index=True)
    document_id = Column(String(36), nullable=False, index=True)
    chunk_index = Column(Integer, nullable=False)
    page_number = Column(Integer)
    content = Column(Text, nullable=False)
    embedding = Column(Vector(settings.EMBEDDING_DIM).with_variant(JSON, "sqlite"))
    # JSON text with filename, document_type, vendor_id, upload_date, chunk_id.
    metadata_json = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index("ix_document_chunks_org_document", "organization_id", "document_id"),
    )
