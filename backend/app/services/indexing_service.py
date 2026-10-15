"""Build, embed and store chunks for a document.

Separate from ingestion on purpose: uploading a document stays model-free, and
indexing is an explicit step so tests never trigger a model download. Re-indexing
a document replaces its chunks atomically.
"""

import json
import logging
import uuid

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.document import Document
from app.repositories import chunk_repository, document_repository
from app.services.embedding_service import EmbeddingProvider
from app.services.text_chunker import chunk_pages

logger = logging.getLogger(__name__)


def index_document(
    db: Session, document: Document, embedder: EmbeddingProvider
) -> int:
    """Chunk, embed and persist a document. Returns the chunk count."""
    pages = document_repository.get_document_pages(db, document.id)
    page_dicts = [
        {"page_number": page.page_number, "content": page.content} for page in pages
    ]
    chunks = chunk_pages(
        page_dicts, settings.RAG_CHUNK_SIZE, settings.RAG_CHUNK_OVERLAP
    )

    if not chunks:
        chunk_repository.replace_chunks_for_document(
            db, document.organization_id, document.id, []
        )
        return 0

    vectors = embedder.embed_documents([chunk["content"] for chunk in chunks])

    rows = []
    for chunk, vector in zip(chunks, vectors):
        chunk_id = str(uuid.uuid4())
        metadata = {
            "chunk_id": chunk_id,
            "organization_id": document.organization_id,
            "document_id": document.id,
            "filename": document.original_filename,
            "document_type": document.document_type,
            "vendor_id": None,
            "page_number": chunk["page_number"],
            "chunk_index": chunk["chunk_index"],
            "upload_date": (
                document.created_at.isoformat() if document.created_at else None
            ),
        }
        rows.append(
            {
                "id": chunk_id,
                "organization_id": document.organization_id,
                "document_id": document.id,
                "chunk_index": chunk["chunk_index"],
                "page_number": chunk["page_number"],
                "content": chunk["content"],
                "embedding": vector,
                "metadata_json": json.dumps(metadata),
            }
        )

    chunk_repository.replace_chunks_for_document(
        db, document.organization_id, document.id, rows
    )
    logger.info(
        "Indexed document %s into %d chunks", document.id, len(rows)
    )
    return len(rows)
