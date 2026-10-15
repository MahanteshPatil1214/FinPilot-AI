"""Persistence and similarity search for document chunks.

On PostgreSQL this uses pgvector's ``cosine_distance`` operator so ranking happens
in the database. SQLite (tests only) has no vector type, so the same query is
ranked in Python. Both paths return the same shape:
``[(DocumentChunk, Document, similarity_score), ...]`` where score is cosine
similarity in ``[-1, 1]`` (higher is more similar).
"""

import math
from typing import Dict, List, Optional

from sqlalchemy.orm import Session

from app.models.document import Document
from app.models.document_chunk import DocumentChunk


def replace_chunks_for_document(
    db: Session,
    organization_id: str,
    document_id: str,
    rows: List[Dict],
) -> int:
    """Atomically swap a document's chunks: delete old, insert new.

    Rolls back on any failure so a document is never left half-indexed.
    """
    try:
        db.query(DocumentChunk).filter(
            DocumentChunk.organization_id == organization_id,
            DocumentChunk.document_id == document_id,
        ).delete(synchronize_session=False)
        for row in rows:
            db.add(DocumentChunk(**row))
        db.commit()
    except Exception:
        db.rollback()
        raise
    return len(rows)


def list_chunks_for_document(
    db: Session, organization_id: str, document_id: str
) -> List[DocumentChunk]:
    return (
        db.query(DocumentChunk)
        .filter(
            DocumentChunk.organization_id == organization_id,
            DocumentChunk.document_id == document_id,
        )
        .order_by(DocumentChunk.chunk_index)
        .all()
    )


def count_chunks(db: Session, organization_id: str, document_id: str) -> int:
    return (
        db.query(DocumentChunk)
        .filter(
            DocumentChunk.organization_id == organization_id,
            DocumentChunk.document_id == document_id,
        )
        .count()
    )


def _cosine_similarity(a: List[float], b: List[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(y * y for y in b))
    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0
    return dot / (norm_a * norm_b)


def search_chunks(
    db: Session,
    organization_id: str,
    query_embedding: List[float],
    top_k: int,
    document_id: Optional[str] = None,
    document_type: Optional[str] = None,
) -> List[tuple]:
    query = (
        db.query(DocumentChunk, Document)
        .join(Document, Document.id == DocumentChunk.document_id)
        .filter(
            DocumentChunk.organization_id == organization_id,
            Document.organization_id == organization_id,
            DocumentChunk.embedding.isnot(None),
        )
    )
    if document_id:
        query = query.filter(DocumentChunk.document_id == document_id)
    if document_type:
        query = query.filter(Document.document_type == document_type)

    if db.get_bind().dialect.name == "postgresql":
        distance = DocumentChunk.embedding.cosine_distance(query_embedding).label(
            "distance"
        )
        rows = (
            query.add_columns(distance)
            .order_by(distance.asc())
            .limit(top_k)
            .all()
        )
        results = []
        for chunk, document, dist in rows:
            # pgvector yields NULL/NaN distance for a zero vector; the SQLite
            # path scores those 0.0, so mirror it to keep both backends equal.
            if dist is None or math.isnan(dist):
                score = 0.0
            else:
                score = 1.0 - float(dist)
            results.append((chunk, document, score))
        return results

    scored = []
    for chunk, document in query.all():
        score = _cosine_similarity(query_embedding, chunk.embedding or [])
        scored.append((chunk, document, score))
    scored.sort(key=lambda item: (-item[2], item[0].chunk_index, item[0].id))
    return scored[:top_k]
