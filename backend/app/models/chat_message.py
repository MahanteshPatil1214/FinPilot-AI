from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.sql import func

from app.db.base import Base


class ChatMessage(Base):
    """One turn in a conversation.

    ``role`` is ``user`` or ``assistant``. Assistant turns carry a structured
    ``payload_json`` (outcome, tool-call status, citations, result references)
    so the UI can render provenance without re-deriving it. Financial amounts
    are never recomputed here; they are copied from the deterministic services.

    ``ordinal`` is a monotonic, auto-incrementing primary key so a transcript
    always reads back in the exact order it was appended, independent of the
    database's timestamp precision. ``id`` is the public, opaque identifier.
    """

    __tablename__ = "chat_messages"

    ordinal = Column(Integer, primary_key=True, autoincrement=True)
    id = Column(String(36), nullable=False, unique=True, index=True)
    conversation_id = Column(
        String(36),
        ForeignKey("chat_conversations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    organization_id = Column(String(36), nullable=False, index=True)
    role = Column(String(20), nullable=False)
    content = Column(Text, nullable=False)
    payload_json = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        Index(
            "ix_chat_messages_org_conversation",
            "organization_id",
            "conversation_id",
        ),
    )
