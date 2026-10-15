"""Retrieve evidence chunks for a query.

Retrieval is deterministic and model-light: embed the query, rank stored chunks
by cosine similarity, and return tidy evidence records. No LLM is involved, so
search works with no API key.
"""

import json
from typing import Dict, List, Optional

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.document import Document
from app.models.document_chunk import DocumentChunk
from app.repositories import chunk_repository
from app.services.embedding_service import EmbeddingProvider


def _evidence_from(
    chunk: DocumentChunk, document: Document, score: float
) -> Dict:
    metadata = {}
    if chunk.metadata_json:
        try:
            metadata = json.loads(chunk.metadata_json)
        except (ValueError, TypeError):
            metadata = {}
    return {
        "chunk_id": chunk.id,
        "document_id": chunk.document_id,
        "filename": document.original_filename,
        "document_type": document.document_type,
        "page_number": chunk.page_number,
        "content": chunk.content,
        "score": round(float(score), 4),
        "metadata": metadata,
    }


def retrieve(
    db: Session,
    query: str,
    organization_id: str,
    embedder: EmbeddingProvider,
    top_k: Optional[int] = None,
    document_id: Optional[str] = None,
    document_type: Optional[str] = None,
) -> List[Dict]:
    """Return up to ``top_k`` evidence records ranked by similarity."""
    top_k = top_k or settings.RAG_TOP_K
    query_embedding = embedder.embed_query(query)
    ranked = chunk_repository.search_chunks(
        db,
        organization_id=organization_id,
        query_embedding=query_embedding,
        top_k=top_k,
        document_id=document_id,
        document_type=document_type,
    )
    return [_evidence_from(chunk, document, score) for chunk, document, score in ranked]
