from sqlalchemy.orm import Session
from app.models.document import Document
from app.models.document_page import DocumentPage
from typing import Dict, List, Optional
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


def get_document(db: Session, doc_id: str) -> Optional[Document]:
    return db.query(Document).filter(Document.id == doc_id).first()


def get_document_pages(db: Session, doc_id: str) -> List[DocumentPage]:
    return (
        db.query(DocumentPage)
        .filter(DocumentPage.document_id == doc_id)
        .order_by(DocumentPage.page_number)
        .all()
    )
