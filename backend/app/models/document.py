from sqlalchemy import Column, String, DateTime, Text, Integer
from sqlalchemy.sql import func
from app.db.base import Base


class Document(Base):
    __tablename__ = "documents"

    id = Column(String(36), primary_key=True)
    organization_id = Column(String(36), nullable=False)
    uploaded_by = Column(String(36))
    original_filename = Column(String(255), nullable=False)
    content_type = Column(String(100))
    document_type = Column(String(50))
    file_hash = Column(String(64))
    storage_path = Column(String(500))
    file_size = Column(Integer)
    page_count = Column(Integer)
    processing_status = Column(String(20), default="pending")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
