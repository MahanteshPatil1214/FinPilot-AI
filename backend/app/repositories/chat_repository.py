"""Persistence for assistant conversations and messages (org-scoped).

Every query filters by ``organization_id`` so one tenant can never read or
mutate another's transcript. Messages are append-only: the repository exposes
no update helper for message text.
"""

import json
import uuid
from typing import Dict, List, Optional, Tuple

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.chat_conversation import ChatConversation
from app.models.chat_message import ChatMessage


def create_conversation(
    db: Session, organization_id: str, title: Optional[str] = None
) -> ChatConversation:
    conversation = ChatConversation(
        id=str(uuid.uuid4()),
        organization_id=organization_id,
        title=(title or None),
    )
    try:
        db.add(conversation)
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(conversation)
    return conversation


def get_conversation(
    db: Session, organization_id: str, conversation_id: str
) -> Optional[ChatConversation]:
    return (
        db.query(ChatConversation)
        .filter(
            ChatConversation.id == conversation_id,
            ChatConversation.organization_id == organization_id,
        )
        .first()
    )


def list_conversations(
    db: Session, organization_id: str, skip: int = 0, limit: int = 50
) -> Tuple[List[ChatConversation], int, Dict[str, int]]:
    """Return conversations (newest first), the total, and their message counts."""
    query = db.query(ChatConversation).filter(
        ChatConversation.organization_id == organization_id
    )
    total = query.count()
    items = (
        query.order_by(
            ChatConversation.updated_at.desc(), ChatConversation.id.desc()
        )
        .offset(skip)
        .limit(limit)
        .all()
    )
    counts: Dict[str, int] = {}
    if items:
        rows = (
            db.query(ChatMessage.conversation_id, func.count())
            .filter(
                ChatMessage.organization_id == organization_id,
                ChatMessage.conversation_id.in_([item.id for item in items]),
            )
            .group_by(ChatMessage.conversation_id)
            .all()
        )
        counts = {conversation_id: count for conversation_id, count in rows}
    return items, total, counts


def delete_conversation(
    db: Session, organization_id: str, conversation_id: str
) -> bool:
    conversation = get_conversation(db, organization_id, conversation_id)
    if conversation is None:
        return False
    try:
        db.query(ChatMessage).filter(
            ChatMessage.organization_id == organization_id,
            ChatMessage.conversation_id == conversation_id,
        ).delete(synchronize_session=False)
        db.delete(conversation)
        db.commit()
    except Exception:
        db.rollback()
        raise
    return True


def add_message(
    db: Session,
    *,
    conversation_id: str,
    organization_id: str,
    role: str,
    content: str,
    payload: Optional[dict] = None,
) -> ChatMessage:
    message = ChatMessage(
        id=str(uuid.uuid4()),
        conversation_id=conversation_id,
        organization_id=organization_id,
        role=role,
        content=content,
        payload_json=json.dumps(payload) if payload is not None else None,
    )
    try:
        db.add(message)
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(message)
    return message


def list_messages(
    db: Session,
    organization_id: str,
    conversation_id: str,
    limit: int = 200,
) -> List[ChatMessage]:
    return (
        db.query(ChatMessage)
        .filter(
            ChatMessage.organization_id == organization_id,
            ChatMessage.conversation_id == conversation_id,
        )
        .order_by(ChatMessage.ordinal.asc())
        .limit(limit)
        .all()
    )


def count_messages(
    db: Session, organization_id: str, conversation_id: str
) -> int:
    return (
        db.query(func.count(ChatMessage.id))
        .filter(
            ChatMessage.organization_id == organization_id,
            ChatMessage.conversation_id == conversation_id,
        )
        .scalar()
        or 0
    )


def set_title_if_empty(
    db: Session, conversation: ChatConversation, title: str
) -> None:
    if conversation.title:
        return
    try:
        conversation.title = title[:200]
        db.add(conversation)
        db.commit()
    except Exception:
        db.rollback()
        raise
