from sqlalchemy import Column, String, DateTime, DECIMAL, Date
from sqlalchemy.sql import func
from app.db.base import Base


class Invoice(Base):
    __tablename__ = "invoices"

    id = Column(String(36), primary_key=True)
    organization_id = Column(String(36), nullable=False)
    vendor_id = Column(String(36))
    invoice_number = Column(String(100))
    invoice_date = Column(Date)
    due_date = Column(Date)
    currency = Column(String(10))
    total_amount = Column(DECIMAL(precision=20, scale=2))
    source_document_id = Column(String(36))
    extraction_status = Column(String(20), default="pending")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
