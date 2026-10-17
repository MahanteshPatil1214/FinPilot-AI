from sqlalchemy import Column, DateTime, Index, String
from sqlalchemy.sql import func

from app.db.base import Base


class ChatConversation(Base):
    """A persisted assistant conversation, scoped to one organization.

    A conversation stores only the transcript the user chose to send and the
    structured references the assistant produced (which records it consulted).
    It never stores document contents, and it is always filtered by
    ``organization_id`` so one tenant can never read another's history.
    """

    __tablename__ = "chat_conversations"

    id = Column(String(36), primary_key=True)
    organization_id = Column(String(36), nullable=False, index=True)
    # Derived from the first user message (truncated). Never taken from
    # retrieved document text.
    title = Column(String(200))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        Index("ix_chat_conversations_org_updated", "organization_id", "updated_at"),
    )
