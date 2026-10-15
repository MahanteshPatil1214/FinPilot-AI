import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import (
    get_current_organization_id,
    get_db,
    get_embedding_provider,
    get_llm_client,
)
from app.repositories import document_repository
from app.schemas.knowledge import (
    AskRequest,
    AskResponse,
    IndexResponse,
    SearchRequest,
    SearchResponse,
)
from app.services import indexing_service, rag_service, retrieval_service
from app.services.embedding_service import EmbeddingProvider
from app.services.llm_client import LLMClient, LLMUnavailable

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/knowledge/index/{document_id}", response_model=IndexResponse)
def index_document(
    document_id: str,
    db: Session = Depends(get_db),
    embedder: EmbeddingProvider = Depends(get_embedding_provider),
    organization_id: str = Depends(get_current_organization_id),
):
    document = document_repository.get_document(db, organization_id, document_id)
    if document is None:
        raise HTTPException(status_code=404, detail="Document not found")

    try:
        count = indexing_service.index_document(db, document, embedder)
    except Exception as exc:  # pragma: no cover - defensive
        logger.error("Indexing failed for document %s (error: %s)", document_id, type(exc).__name__)
        raise HTTPException(status_code=500, detail="Failed to index document")

    logger.info("Indexed document %s into %d chunk(s)", document_id, count)
    return IndexResponse(document_id=document_id, chunks_indexed=count)


@router.post("/knowledge/search", response_model=SearchResponse)
def search_knowledge(
    payload: SearchRequest,
    db: Session = Depends(get_db),
    embedder: EmbeddingProvider = Depends(get_embedding_provider),
    organization_id: str = Depends(get_current_organization_id),
):
    filters = payload.filters
    results = retrieval_service.retrieve(
        db,
        payload.query,
        organization_id,
        embedder,
        top_k=payload.top_k,
        document_id=filters.document_id if filters else None,
        document_type=filters.document_type if filters else None,
    )
    return SearchResponse(query=payload.query, total=len(results), results=results)


@router.post("/knowledge/ask", response_model=AskResponse)
def ask_knowledge(
    payload: AskRequest,
    db: Session = Depends(get_db),
    embedder: EmbeddingProvider = Depends(get_embedding_provider),
    llm: LLMClient = Depends(get_llm_client),
    organization_id: str = Depends(get_current_organization_id),
):
    filters = payload.filters
    try:
        result = rag_service.answer_question(
            db,
            payload.query,
            organization_id,
            embedder,
            llm,
            top_k=payload.top_k,
            document_id=filters.document_id if filters else None,
            document_type=filters.document_type if filters else None,
        )
    except LLMUnavailable:
        raise HTTPException(
            status_code=503,
            detail="Answer generation is unavailable (LLM not configured)",
        )
    return AskResponse(**result)
