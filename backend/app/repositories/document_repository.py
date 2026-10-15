from sqlalchemy import func
from sqlalchemy.orm import Session
from app.models.document import Document
from app.models.document_chunk import DocumentChunk
from app.models.document_page import DocumentPage
from typing import Dict, List, Optional, Tuple
import uuid


def create_document(db: Session, **kwargs) -> Document:
    if "id" not in kwargs:
        kwargs["id"] = str(uuid.uuid4())
    if "organization_id" not in kwargs:
        kwargs["organization_id"] = "org_1"
    doc = Document(**kwargs)
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc


def create_document_with_pages(
    db: Session,
    document: Dict,
    pages: List[Dict],
) -> Document:
    """Persist a document and its page text in a single transaction."""
    document = dict(document)
    document.setdefault("id", str(uuid.uuid4()))
    document.setdefault("organization_id", "org_1")

    doc = Document(**document)
    page_objects = [
        DocumentPage(
            id=str(uuid.uuid4()),
            organization_id=document["organization_id"],
            document_id=document["id"],
            page_number=page["page_number"],
            content=page.get("content"),
            char_count=page.get("char_count"),
        )
        for page in pages
    ]

    try:
        db.add(doc)
        db.add_all(page_objects)
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(doc)
    return doc


def get_document(
    db: Session, organization_id: str, doc_id: str
) -> Optional[Document]:
    return (
        db.query(Document)
        .filter(
            Document.id == doc_id,
            Document.organization_id == organization_id,
        )
        .first()
    )


def get_document_pages(db: Session, doc_id: str) -> List[DocumentPage]:
    return (
        db.query(DocumentPage)
        .filter(DocumentPage.document_id == doc_id)
        .order_by(DocumentPage.page_number)
        .all()
    )


def list_documents(
    db: Session,
    organization_id: str,
    skip: int = 0,
    limit: int = 100,
) -> Tuple[List[Document], int]:
    """Return organization-scoped documents (newest first) and the total count."""
    query = db.query(Document).filter(Document.organization_id == organization_id)
    total = query.count()
    items = (
        query.order_by(Document.created_at.desc(), Document.id.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return items, total


def count_documents(db: Session, organization_id: str) -> int:
    return (
        db.query(func.count(Document.id))
        .filter(Document.organization_id == organization_id)
        .scalar()
        or 0
    )


def count_indexed_documents(db: Session, organization_id: str) -> int:
    """Number of distinct organization documents that have at least one chunk."""
    return (
        db.query(func.count(func.distinct(DocumentChunk.document_id)))
        .filter(DocumentChunk.organization_id == organization_id)
        .scalar()
        or 0
    )


def count_chunks_for_document(db: Session, organization_id: str, doc_id: str) -> int:
    return (
        db.query(func.count(DocumentChunk.id))
        .filter(
            DocumentChunk.organization_id == organization_id,
            DocumentChunk.document_id == doc_id,
        )
        .scalar()
        or 0
    )
