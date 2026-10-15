from sqlalchemy import Column, String, DateTime, DECIMAL, Date
from sqlalchemy.sql import func
from app.db.base import Base


class BankTransaction(Base):
    __tablename__ = "bank_transactions"

    id = Column(String(36), primary_key=True)
    organization_id = Column(String(36), nullable=False)
    transaction_reference = Column(String(100))
    transaction_date = Column(Date)
    description = Column(String(255))
    amount = Column(DECIMAL(precision=20, scale=2))
    currency = Column(String(10))
    counterparty = Column(String(255))
    source_document_id = Column(String(36))
    import_batch_id = Column(String(36))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
