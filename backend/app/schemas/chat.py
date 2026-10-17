from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ConversationCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: Optional[str] = Field(default=None, max_length=200)


class ConversationSummary(BaseModel):
    id: str
    title: Optional[str] = None
    message_count: int = 0
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class ConversationListResponse(BaseModel):
    total: int
    items: List[ConversationSummary]


class ChatToolCall(BaseModel):
    """Compact, honest record of one tool the assistant actually executed."""

    name: str
    label: str
    # ok | empty | error | skipped
    status: str
    summary: str
    duration_ms: int


class ChatCitation(BaseModel):
    index: int
    document_id: str
    filename: str
    page_number: Optional[int] = None
    chunk_id: str
    score: float


class ChatResultRef(BaseModel):
    """A clickable pointer to a record the answer is grounded in."""

    # invoice | transaction | document | reconciliation | investigation | review
    kind: str
    id: str
    label: str
    href: str
    status: Optional[str] = None


class ChatMessageSchema(BaseModel):
    id: str
    role: str
    content: str
    # answered | success | insufficient_evidence | needs_clarification
    # | requires_confirmation | unavailable | unsupported | error
    outcome: Optional[str] = None
    tool_calls: List[ChatToolCall] = Field(default_factory=list)
    citations: List[ChatCitation] = Field(default_factory=list)
    result_refs: List[ChatResultRef] = Field(default_factory=list)
    created_at: Optional[datetime] = None


class ChatMessageRequest(BaseModel):
    """A user turn.

    Only the message text and references to already-uploaded documents are
    accepted. No identity, organization, or financial field is trusted from the
    client; unknown fields are rejected.
    """

    model_config = ConfigDict(extra="forbid")

    content: str = Field(min_length=1, max_length=4000)
    # Document ids already uploaded through the existing upload pipeline. They
    # narrow retrieval to the attached documents; they are never re-uploaded.
    attachment_document_ids: List[str] = Field(default_factory=list)

    @field_validator("content")
    @classmethod
    def _content_not_blank(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("content must not be empty or whitespace only")
        return cleaned


class ChatMessageResponse(BaseModel):
    conversation_id: str
    user_message: ChatMessageSchema
    assistant_message: ChatMessageSchema


class ConversationDetailResponse(BaseModel):
    id: str
    organization_id: str
    title: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    messages: List[ChatMessageSchema]
