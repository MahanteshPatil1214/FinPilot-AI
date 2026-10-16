from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from sqlalchemy.orm import Session
from app.api.deps import get_current_organization_id
from app.core.config import settings
from app.db.session import get_db
from app.repositories.document_repository import (
    create_document_with_pages,
    count_chunks_for_document,
    get_document,
    get_document_pages,
    list_documents,
)
from app.repositories.invoice_repository import create_invoice
from app.services.pdf_service import PDFValidationError, extract_pdf_pages
from app.services.file_storage import sanitize_filename, save_pdf, delete_file
from app.services.document_parser import (
    compute_file_hash,
    extract_invoice_fields,
    to_decimal_amount,
)
from app.schemas.document import (
    DocumentDetailResponse,
    DocumentListResponse,
    DocumentPageResponse,
    DocumentResponse,
    DocumentStatusResponse,
)
import logging
import os

logger = logging.getLogger(__name__)

router = APIRouter()

_STATUS_BY_CODE = {
    "empty": 422,
    "bad_signature": 400,
    "malformed": 400,
    "encrypted": 400,
    "no_text": 422,
    "too_many_pages": 422,
}


@router.post("/documents/upload")
async def upload_document(
    file: UploadFile = File(...),
    document_type: str = Form("invoice"),
    db: Session = Depends(get_db),
    organization_id: str = Depends(get_current_organization_id),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    document_type = (document_type or "invoice").strip().lower()
    if document_type not in {"invoice", "policy", "contract", "bank_statement", "other"}:
        raise HTTPException(status_code=422, detail="Unsupported document type")

    ext = os.path.splitext(file.filename.lower())[1]
    if ext != ".pdf":
        raise HTTPException(
            status_code=400,
            detail="Unsupported file type. Only PDF documents are supported here.",
        )

    content = await file.read()
    max_bytes = settings.MAX_PDF_SIZE_MB * 1024 * 1024
    if len(content) == 0:
        raise HTTPException(status_code=422, detail="PDF file is empty")
    if len(content) > max_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"File too large (max {settings.MAX_PDF_SIZE_MB}MB)",
        )

    try:
        extracted = extract_pdf_pages(content, max_pages=settings.MAX_PDF_PAGES)
    except PDFValidationError as e:
        status_code = _STATUS_BY_CODE.get(e.code, 400)
        raise HTTPException(status_code=status_code, detail=e.message)

    pages = extracted["pages"]
    page_count = extracted["page_count"]
    combined_text = "\n".join(p["content"] for p in pages)

    safe_filename = sanitize_filename(file.filename)
    file_hash = compute_file_hash(content)
    from uuid import uuid4

    document_id = str(uuid4())
    storage_path = None

    try:
        storage_path = save_pdf(content, document_id, settings.STORAGE_DIR)

        doc = create_document_with_pages(
            db,
            document={
                "id": document_id,
                "organization_id": organization_id,
                "original_filename": safe_filename,
                "content_type": file.content_type or "application/pdf",
                "document_type": document_type,
                "file_hash": file_hash,
                "storage_path": storage_path,
                "file_size": len(content),
                "page_count": page_count,
                "processing_status": "completed",
            },
            pages=pages,
        )
    except HTTPException:
        raise
    except Exception as e:
        # Clean up the stored file and surface a generic error (no row contents).
        if storage_path:
            delete_file(storage_path)
        # Log only the error type: DBAPI error messages can embed the failing
        # SQL parameters (i.e. extracted document text), which must not be logged.
        logger.error("Failed to store uploaded document (error: %s)", type(e).__name__)
        raise HTTPException(status_code=500, detail="Failed to store document")

    # Best-effort structured extraction. Failure here must not discard the
    # successfully stored document. Only an invoice-like document with at least
    # one recognisable field becomes an Invoice row; policy/contract uploads (or
    # text with no extractable figures) must not create empty invoice records.
    invoice_id = None
    if document_type == "invoice":
        try:
            fields = extract_invoice_fields(combined_text)
            if fields.get("invoice_number") or fields.get("total_amount"):
                inv = create_invoice(
                    db,
                    organization_id=organization_id,
                    invoice_number=fields.get("invoice_number"),
                    invoice_date=fields.get("invoice_date"),
                    due_date=fields.get("due_date"),
                    currency=fields.get("currency") or "INR",
                    total_amount=to_decimal_amount(fields.get("total_amount")),
                    source_document_id=doc.id,
                    extraction_status="completed",
                )
                invoice_id = inv.id
        except Exception as e:
            # Do not log the exception message; it can contain extracted field values.
            logger.error(
                "Invoice field extraction failed for document %s (error: %s)",
                doc.id,
                type(e).__name__,
            )

    logger.info(
        "Stored document %s (%d page(s), %d bytes)",
        doc.id,
        page_count,
        len(content),
    )

    return {
        "document_id": doc.id,
        "invoice_id": invoice_id,
        "page_count": page_count,
        "filename": safe_filename,
        "status": "processed",
    }


@router.get("/documents", response_model=DocumentListResponse)
def list_documents_endpoint(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    organization_id: str = Depends(get_current_organization_id),
):
    if skip < 0:
        raise HTTPException(status_code=422, detail="skip must be >= 0")
    if limit < 1 or limit > 500:
        raise HTTPException(status_code=422, detail="limit must be between 1 and 500")
    items, total = list_documents(db, organization_id, skip=skip, limit=limit)
    return DocumentListResponse(
        total=total,
        skip=skip,
        limit=limit,
        items=[DocumentResponse.model_validate(d) for d in items],
    )


@router.get("/documents/{document_id}", response_model=DocumentDetailResponse)
def get_document_detail(
    document_id: str,
    db: Session = Depends(get_db),
    organization_id: str = Depends(get_current_organization_id),
):
    doc = get_document(db, organization_id, document_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")
    pages = get_document_pages(db, document_id)
    detail = DocumentDetailResponse.model_validate(doc)
    detail.pages = [DocumentPageResponse.model_validate(p) for p in pages]
    return detail


@router.get(
    "/documents/{document_id}/status", response_model=DocumentStatusResponse
)
def get_document_status(
    document_id: str,
    db: Session = Depends(get_db),
    organization_id: str = Depends(get_current_organization_id),
):
    doc = get_document(db, organization_id, document_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")
    chunk_count = count_chunks_for_document(db, organization_id, document_id)
    indexed = chunk_count > 0
    return DocumentStatusResponse(
        document_id=doc.id,
        processing_status=doc.processing_status or "pending",
        indexing_status="indexed" if indexed else "not_indexed",
        indexed=indexed,
        chunk_count=chunk_count,
        page_count=doc.page_count,
    )
