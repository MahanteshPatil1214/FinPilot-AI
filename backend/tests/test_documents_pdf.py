import io
import logging
import os
from decimal import Decimal

import pymupdf
import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.db.init_db import init_db
from app.db.session import SessionLocal
from app.main import app
from app.models.document import Document
from app.models.document_page import DocumentPage
from app.models.invoice import Invoice

client = TestClient(app)

# A structurally valid PDF with zero pages.
ZERO_PAGE_PDF = (
    b"%PDF-1.4\n"
    b"1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
    b"2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\n"
    b"xref\n"
    b"0 3\n"
    b"0000000000 65535 f \n"
    b"trailer<</Root 1 0 R/Size 3>>\n"
    b"startxref\n"
    b"0\n"
    b"%%EOF"
)


def _make_pdf(page_texts):
    doc = pymupdf.open()
    for text in page_texts:
        page = doc.new_page()
        page.insert_text((72, 72), text)
    data = doc.tobytes()
    doc.close()
    return data


def _make_encrypted_pdf():
    doc = pymupdf.open()
    page = doc.new_page()
    page.insert_text((72, 72), "SECRET INVOICE 999 CONFIDENTIAL")
    data = doc.tobytes(
        encryption=pymupdf.PDF_ENCRYPT_AES_256,
        owner_pw="owner",
        user_pw="user",
    )
    doc.close()
    return data


def _post_pdf(content, filename="invoice.pdf"):
    files = {"file": (filename, io.BytesIO(content), "application/pdf")}
    return client.post("/api/v1/documents/upload", files=files)


@pytest.fixture(autouse=True)
def _env(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "STORAGE_DIR", str(tmp_path / "storage"))
    init_db()
    db = SessionLocal()
    try:
        db.query(DocumentPage).delete()
        db.query(Invoice).delete()
        db.query(Document).delete()
        db.commit()
    finally:
        db.close()
    yield


def test_upload_text_pdf_success():
    pdf = _make_pdf(["ACME INVOICE 1001 TOTAL 5000.00 INR"])
    resp = _post_pdf(pdf)
    assert resp.status_code == 200
    data = resp.json()
    assert data["page_count"] == 1
    assert data["status"] == "processed"
    assert data["filename"] == "invoice.pdf"
    document_id = data["document_id"]

    detail = client.get(f"/api/v1/documents/{document_id}")
    assert detail.status_code == 200
    body = detail.json()
    assert body["page_count"] == 1
    assert len(body["pages"]) == 1
    assert body["pages"][0]["page_number"] == 1
    assert "ACME INVOICE 1001" in body["pages"][0]["content"]


def test_multi_page_pdf_preserves_page_numbers():
    pdf = _make_pdf(["PAGE ONE CONTENT", "PAGE TWO CONTENT", "PAGE THREE CONTENT"])
    resp = _post_pdf(pdf, filename="agreement.pdf")
    assert resp.status_code == 200
    data = resp.json()
    assert data["page_count"] == 3

    body = client.get(f"/api/v1/documents/{data['document_id']}").json()
    assert [p["page_number"] for p in body["pages"]] == [1, 2, 3]
    assert "PAGE TWO CONTENT" in body["pages"][1]["content"]


def test_document_and_pages_are_persisted():
    pdf = _make_pdf(["VENDOR AGREEMENT PAYMENT TERMS NET 30"])
    resp = _post_pdf(pdf)
    assert resp.status_code == 200
    document_id = resp.json()["document_id"]

    db = SessionLocal()
    try:
        doc = db.query(Document).filter(Document.id == document_id).first()
        assert doc is not None
        assert doc.page_count == 1
        assert doc.file_size == len(pdf)
        assert doc.file_hash
        assert doc.original_filename == "invoice.pdf"
        assert doc.storage_path and os.path.exists(doc.storage_path)

        pages = db.query(DocumentPage).filter(DocumentPage.document_id == document_id).all()
        assert len(pages) == 1
        assert pages[0].page_number == 1
    finally:
        db.close()


def test_malformed_pdf_rejected():
    resp = _post_pdf(b"%PDF-1.4 this is not really a valid pdf structure")
    assert resp.status_code == 400


def test_wrong_file_type_rejected():
    resp = _post_pdf(_make_pdf(["hello"]), filename="notes.txt")
    assert resp.status_code == 400


def test_non_pdf_signature_rejected():
    resp = _post_pdf(b"this is plain text pretending to be a pdf")
    assert resp.status_code == 400


def test_oversized_file_rejected(monkeypatch):
    monkeypatch.setattr(settings, "MAX_PDF_SIZE_MB", 1)
    oversized = b"%PDF-1.4\n" + b"0" * (1024 * 1024 + 1)
    resp = _post_pdf(oversized)
    assert resp.status_code == 413


def test_encrypted_pdf_rejected():
    resp = _post_pdf(_make_encrypted_pdf())
    assert resp.status_code == 400
    assert "ncrypt" in resp.json()["detail"]


def test_empty_file_rejected():
    resp = _post_pdf(b"")
    assert resp.status_code == 422


def test_zero_page_pdf_rejected():
    resp = _post_pdf(ZERO_PAGE_PDF)
    assert resp.status_code == 422


def test_page_count_at_limit_accepted(monkeypatch):
    monkeypatch.setattr(settings, "MAX_PDF_PAGES", 3)
    pdf = _make_pdf(["PAGE ONE TEXT CONTENT", "PAGE TWO TEXT CONTENT", "PAGE THREE TEXT"])
    resp = _post_pdf(pdf)
    assert resp.status_code == 200
    assert resp.json()["page_count"] == 3


def test_page_count_over_limit_rejected(monkeypatch):
    monkeypatch.setattr(settings, "MAX_PDF_PAGES", 2)
    pdf = _make_pdf(["PAGE ONE TEXT CONTENT", "PAGE TWO TEXT CONTENT", "PAGE THREE TEXT"])
    resp = _post_pdf(pdf)
    assert resp.status_code == 422
    assert "pages" in resp.json()["detail"].lower()


def test_scanned_image_only_pdf_rejected():
    doc = pymupdf.open()
    doc.new_page()  # page with no text layer
    data = doc.tobytes()
    doc.close()
    resp = _post_pdf(data)
    assert resp.status_code == 422
    assert "text" in resp.json()["detail"].lower()


def test_missing_document_returns_404():
    resp = client.get("/api/v1/documents/does-not-exist")
    assert resp.status_code == 404


def test_filename_is_sanitized():
    pdf = _make_pdf(["INVOICE 42 TOTAL 100.00"])
    resp = _post_pdf(pdf, filename="../../etc/passwd.pdf")
    assert resp.status_code == 200
    filename = resp.json()["filename"]
    assert "/" not in filename
    assert "\\" not in filename
    assert ".." not in filename


def test_db_failure_does_not_log_page_content_and_cleans_up(monkeypatch, caplog):
    import app.api.routes.documents as routes

    secret = "SUPERSECRETFINANCIALDATA1234567890"
    monkeypatch.setattr(
        routes,
        "extract_pdf_pages",
        lambda content, max_pages: {
            "pages": [
                {"page_number": None, "content": secret, "char_count": len(secret)}
            ],
            "page_count": 1,
        },
    )
    documents_dir = os.path.join(settings.STORAGE_DIR, "documents")

    with caplog.at_level(logging.DEBUG):
        resp = _post_pdf(_make_pdf(["placeholder text for extraction"]))

    assert resp.status_code == 500
    assert secret not in caplog.text
    # The stored file must be removed when persistence fails.
    if os.path.isdir(documents_dir):
        assert os.listdir(documents_dir) == []


def test_invoice_amount_persisted_as_decimal():
    pdf = _make_pdf(["ACME INVOICE 1001 TOTAL 5000.00 INR"])
    resp = _post_pdf(pdf)
    assert resp.status_code == 200
    document_id = resp.json()["document_id"]

    db = SessionLocal()
    try:
        inv = db.query(Invoice).filter(Invoice.source_document_id == document_id).first()
        assert inv is not None
        assert isinstance(inv.total_amount, Decimal)
        assert inv.total_amount == Decimal("5000.00")
    finally:
        db.close()


def test_invoice_extraction_failure_keeps_document(monkeypatch, caplog):
    import app.api.routes.documents as routes

    secret = "SUPERSECRETINVOICEAMOUNT1234.56"

    def boom(*args, **kwargs):
        raise RuntimeError(secret)

    monkeypatch.setattr(routes, "create_invoice", boom)
    pdf = _make_pdf(["VENDOR INVOICE 55 TOTAL 1234.56 INR"])

    with caplog.at_level(logging.DEBUG):
        resp = _post_pdf(pdf)

    assert resp.status_code == 200
    document_id = resp.json()["document_id"]
    assert secret not in caplog.text

    db = SessionLocal()
    try:
        assert db.query(Document).filter(Document.id == document_id).first() is not None
        assert db.query(Invoice).filter(Invoice.source_document_id == document_id).count() == 0
    finally:
        db.close()

    # The session/database must remain usable for subsequent requests.
    detail = client.get(f"/api/v1/documents/{document_id}")
    assert detail.status_code == 200


def test_create_invoice_rolls_back_on_commit_failure(monkeypatch):
    from app.repositories.invoice_repository import create_invoice

    db = SessionLocal()
    try:
        def boom():
            raise RuntimeError("commit failed")

        monkeypatch.setattr(db, "commit", boom)
        with pytest.raises(RuntimeError):
            create_invoice(db, organization_id="org_1", total_amount=Decimal("1.00"))

        monkeypatch.undo()
        # Session must still be usable and no partial row committed.
        assert db.query(Invoice).count() == 0
    finally:
        db.close()
