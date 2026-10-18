"""Assistant conversation API.

Every endpoint is organization-scoped through the shared principal resolver.
The route is thin: it persists the transcript, delegates the actual reasoning to
the orchestrator, and returns structured provenance (outcome, tool-call statuses,
citations and result references). No financial value is computed here.
"""

import json
import logging
import re

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.agents.chat import orchestrator
from app.api.deps import (
    get_current_organization_id,
    get_current_user_id,
    get_db,
    get_embedding_provider,
    get_llm_client,
)
from app.repositories import chat_repository
from app.schemas.chat import (
    ChatMessageRequest,
    ChatMessageResponse,
    ChatMessageSchema,
    ConversationCreateRequest,
    ConversationDetailResponse,
    ConversationListResponse,
    ConversationSummary,
)
from app.services.embedding_service import EmbeddingProvider
from app.services.llm_client import LLMClient

logger = logging.getLogger(__name__)

router = APIRouter()

_TITLE_MAX = 60
_WHITESPACE_RE = re.compile(r"\s+")


def _payload(message) -> dict:
    if not message.payload_json:
        return {}
    try:
        return json.loads(message.payload_json)
    except (ValueError, TypeError):
        return {}


def _message_to_schema(message) -> ChatMessageSchema:
    payload = _payload(message)
    return ChatMessageSchema(
        id=message.id,
        role=message.role,
        content=message.content,
        outcome=payload.get("outcome"),
        tool_calls=payload.get("tool_calls") or [],
        citations=payload.get("citations") or [],
        result_refs=payload.get("result_refs") or [],
        created_at=message.created_at,
    )


def _derive_title(content: str) -> str:
    collapsed = _WHITESPACE_RE.sub(" ", content).strip()
    if len(collapsed) <= _TITLE_MAX:
        return collapsed
    return collapsed[: _TITLE_MAX - 1].rstrip() + "…"


@router.post(
    "/chat/conversations",
    response_model=ConversationSummary,
    status_code=status.HTTP_201_CREATED,
)
def create_conversation(
    payload: ConversationCreateRequest,
    db: Session = Depends(get_db),
    organization_id: str = Depends(get_current_organization_id),
):
    conversation = chat_repository.create_conversation(
        db, organization_id, title=payload.title
    )
    return ConversationSummary(
        id=conversation.id,
        title=conversation.title,
        message_count=0,
        created_at=conversation.created_at,
        updated_at=conversation.updated_at,
    )


@router.get("/chat/conversations", response_model=ConversationListResponse)
def list_conversations(
    db: Session = Depends(get_db),
    organization_id: str = Depends(get_current_organization_id),
):
    items, total, counts = chat_repository.list_conversations(
        db, organization_id
    )
    return ConversationListResponse(
        total=total,
        items=[
            ConversationSummary(
                id=item.id,
                title=item.title,
                message_count=counts.get(item.id, 0),
                created_at=item.created_at,
                updated_at=item.updated_at,
            )
            for item in items
        ],
    )


@router.get(
    "/chat/conversations/{conversation_id}",
    response_model=ConversationDetailResponse,
)
def get_conversation(
    conversation_id: str,
    db: Session = Depends(get_db),
    organization_id: str = Depends(get_current_organization_id),
):
    conversation = chat_repository.get_conversation(
        db, organization_id, conversation_id
    )
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    messages = chat_repository.list_messages(db, organization_id, conversation_id)
    return ConversationDetailResponse(
        id=conversation.id,
        organization_id=conversation.organization_id,
        title=conversation.title,
        created_at=conversation.created_at,
        updated_at=conversation.updated_at,
        messages=[_message_to_schema(message) for message in messages],
    )


@router.delete(
    "/chat/conversations/{conversation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_conversation(
    conversation_id: str,
    db: Session = Depends(get_db),
    organization_id: str = Depends(get_current_organization_id),
):
    deleted = chat_repository.delete_conversation(
        db, organization_id, conversation_id
    )
    if not deleted:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/chat/conversations/{conversation_id}/messages",
    response_model=ChatMessageResponse,
)
def post_message(
    conversation_id: str,
    payload: ChatMessageRequest,
    db: Session = Depends(get_db),
    embedder: EmbeddingProvider = Depends(get_embedding_provider),
    llm: LLMClient = Depends(get_llm_client),
    organization_id: str = Depends(get_current_organization_id),
    user_id: str = Depends(get_current_user_id),
):
    conversation = chat_repository.get_conversation(
        db, organization_id, conversation_id
    )
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # History is read before the new turn is stored, so the orchestrator can
    # carry references forward without seeing the current message twice.
    history = [
        {
            "role": message.role,
            "content": message.content,
            "result_refs": _payload(message).get("result_refs") or [],
            "attachment_document_ids": _payload(message).get("attachment_document_ids") or [],
        }
        for message in chat_repository.list_messages(
            db, organization_id, conversation_id
        )
    ]

    user_payload = None
    if payload.attachment_document_ids:
        user_payload = {"attachment_document_ids": payload.attachment_document_ids}

    user_message = chat_repository.add_message(
        db,
        conversation_id=conversation_id,
        organization_id=organization_id,
        role="user",
        content=payload.content,
        payload=user_payload,
    )
    chat_repository.set_title_if_empty(
        db, conversation, _derive_title(payload.content)
    )

    result = orchestrator.handle_message(
        db=db,
        organization_id=organization_id,
        user_id=user_id,
        content=payload.content,
        attachment_document_ids=payload.attachment_document_ids,
        embedder=embedder,
        llm=llm,
        history=history,
    )

    assistant_message = chat_repository.add_message(
        db,
        conversation_id=conversation_id,
        organization_id=organization_id,
        role="assistant",
        content=result.content,
        payload={
            "outcome": result.outcome,
            "tool_calls": result.tool_calls,
            "citations": result.citations,
            "result_refs": result.result_refs,
        },
    )

    logger.info(
        "Assistant turn handled (intent outcome=%s tools=%d conversation=%s)",
        result.outcome,
        len(result.tool_calls),
        conversation_id,
    )

    return ChatMessageResponse(
        conversation_id=conversation_id,
        user_message=_message_to_schema(user_message),
        assistant_message=_message_to_schema(assistant_message),
    )
