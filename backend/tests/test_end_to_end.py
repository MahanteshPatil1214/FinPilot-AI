"""End-to-end journey test across every milestone boundary.

This drives the real HTTP API through the complete product workflow using only
synthetic data:

    upload PDF invoice -> import bank-transaction CSV -> deterministic
    reconciliation -> knowledge index/search/ask -> investigation run ->
    human review -> append-only audit trail

Every layer exercised here is the production code path (real PDF parser, real
CSV parser, real reconciliation engine, real chunking/indexing/retrieval, real
LangGraph workflow, real review + audit persistence). Only the two external AI
dependencies are faked with deterministic stand-ins: the local embedding model
and the hosted LLM.

The tests also assert that investigating and reviewing never change
reconciliation results, invoice amounts or bank transactions.
"""

import io
import json
import uuid
from datetime import date
from decimal import Decimal

import pymupdf
import pytest
from fastapi.testclient import TestClient

from app.api.deps import get_embedding_provider, get_llm_client
from app.core.config import settings
from app.db.init_db import init_db
from app.db.session import SessionLocal
from app.main import app
from app.models.audit_event import AuditEvent
from app.models.document import Document
from app.models.document_chunk import DocumentChunk
from app.models.document_page import DocumentPage
from app.models.investigation import Investigation
from app.models.investigation_review import InvestigationReview
from app.models.invoice import Invoice
from app.models.reconciliation_match import ReconciliationMatch
from app.models.transaction import BankTransaction
from app.repositories import document_repository

client = TestClient(app)

ORG = "org_1"
DIM = 384

INVOICE_NUMBER = "INV-104"
INVOICE_TOTAL = "12000.00"
TRANSACTION_AMOUNT = "11700.00"
DIFFERENCE = "300.00"


class FakeEmbedder:
    """Deterministic bag-of-topics embedding; no model download required."""

    dim = DIM

    _BUCKETS = {
        "invoice": 0,
        "total": 0,
        "amount": 0,
        "bank": 1,
        "transaction": 1,
        "tax": 2,
        "gst": 2,
        "payment": 3,
        "discount": 3,
        "policy": 3,
        "terms": 3,
        "vendor": 3,
        "agreement": 3,
    }

    def _vec(self, text):
        vector = [0.0] * DIM
        lowered = text.lower()
        for token, index in self._BUCKETS.items():
            if token in lowered:
                vector[index] = 1.0
        return vector

    def embed_documents(self, texts):
        return [self._vec(text) for text in texts]

    def embed_query(self, text):
        return self._vec(text)


class JourneyLLM:
    """Prompt-aware fake: JSON report for investigations, prose for RAG asks."""

    def __init__(self, report):
        self.report = report
        self.investigation_calls = 0
        self.answer_calls = 0

    def answer(self, system_prompt, user_prompt):
        if "investigation analyst" in system_prompt:
            self.investigation_calls += 1
            return self.report
        self.answer_calls += 1
        return "A 300.00 early payment discount applies to this invoice [1]."


def report_json(citations=(2, 4)):
    return json.dumps(
        {
            "summary": "The stored difference is documented by the vendor policy.",
            "findings": [
                {
                    "statement": "A 300.00 early-payment discount explains the difference.",
                    "kind": "fact",
                    "citations": list(citations),
                }
            ],
            "missing_evidence": [],
            "recommended_action": "Review supporting documents",
            "confidence": "high",
            "requires_human_review": False,
        }
    )


def _make_pdf(page_texts):
    doc = pymupdf.open()
    for text in page_texts:
        page = doc.new_page()
        page.insert_text((72, 72), text)
    data = doc.tobytes()
    doc.close()
    return data


INVOICE_PDF_TEXT = (
    "ACME SUPPLIES INV-104 TOTAL 12000.00 INR "
    "Invoice Date 01/10/2026 Due Date 30/10/2026"
)

TRANSACTIONS_CSV = (
    "transaction_reference,transaction_date,description,amount,currency,counterparty\n"
    f"{INVOICE_NUMBER},2026-10-05,ACME SUPPLIES PAYMENT,"
    f"{TRANSACTION_AMOUNT},INR,ACME SUPPLIES\n"
)


@pytest.fixture(autouse=True)
def _env(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "STORAGE_DIR", str(tmp_path / "storage"))
    init_db()
    db = SessionLocal()
    try:
        for model in (
            AuditEvent,
            InvestigationReview,
            Investigation,
            DocumentChunk,
            DocumentPage,
            Document,
            ReconciliationMatch,
            Invoice,
            BankTransaction,
        ):
            db.query(model).delete()
        db.commit()
    finally:
        db.close()

    llm = JourneyLLM(report_json())
    app.dependency_overrides[get_embedding_provider] = lambda: FakeEmbedder()
    app.dependency_overrides[get_llm_client] = lambda: llm
    yield llm
    app.dependency_overrides.clear()


def _upload_invoice():
    files = {"file": ("invoice.pdf", io.BytesIO(_make_pdf([INVOICE_PDF_TEXT])), "application/pdf")}
    resp = client.post("/api/v1/documents/upload", files=files)
    assert resp.status_code == 200, resp.text
    return resp.json()


def _import_transactions():
    files = {
        "file": ("transactions.csv", io.BytesIO(TRANSACTIONS_CSV.encode()), "text/csv")
    }
    resp = client.post("/api/v1/transactions/import", files=files)
    assert resp.status_code == 200, resp.text
    return resp.json()


def _index_policy_document():
    db = SessionLocal()
    try:
        doc = document_repository.create_document_with_pages(
            db,
            document={
                "id": str(uuid.uuid4()),
                "organization_id": ORG,
                "original_filename": "vendor_policy.pdf",
                "document_type": "policy",
                "processing_status": "completed",
            },
            pages=[
                {
                    "page_number": 1,
                    "content": (
                        "Payment terms: a 300.00 early payment discount applies to "
                        "this vendor invoice agreement."
                    ),
                    "char_count": 86,
                }
            ],
        )
        doc_id = doc.id
    finally:
        db.close()
    resp = client.post(f"/api/v1/knowledge/index/{doc_id}")
    assert resp.status_code == 200, resp.text
    return doc_id


def _reconcile_and_get_match(invoice_id):
    run = client.post("/api/v1/reconciliation/run", json={})
    assert run.status_code == 200, run.text
    results = client.get(
        "/api/v1/reconciliation/results", params={"status": "partial_match"}
    )
    assert results.status_code == 200, results.text
    match = next(
        (m for m in results.json()["items"] if m["invoice_id"] == invoice_id), None
    )
    assert match is not None, "expected a partial match for the uploaded invoice"
    return match


def _snapshot_financial_rows():
    db = SessionLocal()
    try:
        return {
            "matches": sorted(
                (m.id, m.match_status, str(m.difference_amount), m.transaction_id)
                for m in db.query(ReconciliationMatch).all()
            ),
            "invoices": sorted(
                (i.id, str(i.total_amount), i.currency)
                for i in db.query(Invoice).all()
            ),
            "transactions": sorted(
                (t.id, str(t.amount), t.currency)
                for t in db.query(BankTransaction).all()
            ),
        }
    finally:
        db.close()


def test_full_journey_upload_to_audit():
    # 1. Upload the invoice PDF ------------------------------------------------
    upload = _upload_invoice()
    document_id = upload["document_id"]
    invoice_id = upload["invoice_id"]
    assert upload["status"] == "processed"
    assert upload["page_count"] == 1
    assert invoice_id, "invoice fields should have been extracted from the PDF"

    db = SessionLocal()
    try:
        invoice = db.query(Invoice).filter(Invoice.id == invoice_id).first()
        assert invoice is not None
        assert invoice.invoice_number == INVOICE_NUMBER
        assert invoice.currency == "INR"
        assert invoice.total_amount == Decimal(INVOICE_TOTAL)
        assert invoice.invoice_date == date(2026, 10, 1)
        assert invoice.due_date == date(2026, 10, 30)
    finally:
        db.close()

    # 2. Import bank transactions ---------------------------------------------
    import_result = _import_transactions()
    assert import_result["imported"] == 1
    assert import_result["duplicates"] == 0

    # 3. Deterministic reconciliation -----------------------------------------
    match = _reconcile_and_get_match(invoice_id)
    match_id = match["id"]
    assert match["match_status"] == "partial_match"
    assert Decimal(str(match["difference_amount"])) == Decimal(DIFFERENCE)

    # Freeze the financial records: nothing below may change them.
    financial_before = _snapshot_financial_rows()

    # 4. Knowledge base: index the invoice document + a policy document -------
    index_resp = client.post(f"/api/v1/knowledge/index/{document_id}")
    assert index_resp.status_code == 200, index_resp.text
    assert index_resp.json()["chunks_indexed"] >= 1
    policy_document_id = _index_policy_document()

    search = client.post(
        "/api/v1/knowledge/search", json={"query": "payment terms discount"}
    )
    assert search.status_code == 200, search.text
    assert search.json()["total"] >= 1

    ask = client.post(
        "/api/v1/knowledge/ask", json={"query": "What payment terms apply?"}
    )
    assert ask.status_code == 200, ask.text
    ask_body = ask.json()
    assert ask_body["status"] == "answered"
    assert ask_body["citations"], "answer must cite retrieved evidence"

    # 5. Investigation run -----------------------------------------------------
    created = client.post("/api/v1/investigations", json={"invoice_id": invoice_id})
    assert created.status_code == 201, created.text
    investigation_id = created.json()["id"]
    assert created.json()["status"] == "pending"

    run = client.post(f"/api/v1/investigations/{investigation_id}/run")
    assert run.status_code == 200, run.text
    run_body = run.json()
    assert run_body["status"] == "completed"
    assert run_body["report_version"] == 1
    assert run_body["report"]["findings"]
    cited_filenames = {
        c["filename"]
        for c in run_body["report"]["citations"]
        if c["kind"] == "document_chunk"
    }
    assert "vendor_policy.pdf" in cited_filenames

    # 6. Human review: approve the current report ------------------------------
    review = client.post(
        f"/api/v1/investigations/{investigation_id}/review",
        json={
            "decision": "approved",
            "rationale": "Discount documented in the vendor policy.",
            "report_version": run_body["report_version"],
        },
    )
    assert review.status_code == 200, review.text
    review_body = review.json()
    assert review_body["status"] == "approved"
    assert review_body["review_status"] == "approved"
    assert review_body["latest_review"]["is_current"] is True

    history = client.get(f"/api/v1/investigations/{investigation_id}/reviews")
    assert history.status_code == 200, history.text
    assert history.json()["total"] == 1
    assert history.json()["review_status"] == "approved"

    # 7. Audit trail -----------------------------------------------------------
    db = SessionLocal()
    try:
        audits = (
            db.query(AuditEvent)
            .filter(
                AuditEvent.entity_type == "investigation",
                AuditEvent.entity_id == investigation_id,
            )
            .all()
        )
        assert len(audits) == 1
        assert audits[0].action == "review_decision"
        assert audits[0].actor_id == "demo-user"
        details = json.loads(audits[0].details_json)
        assert details["decision"] == "approved"
        assert details["previous_status"] == "completed"
        assert details["resulting_status"] == "approved"
        assert details["report_version"] == 1
    finally:
        db.close()

    # 8. Rerun supersedes the prior review but preserves it --------------------
    rerun = client.post(f"/api/v1/investigations/{investigation_id}/run")
    assert rerun.status_code == 200, rerun.text
    rerun_body = rerun.json()
    assert rerun_body["report_version"] == 2
    assert rerun_body["review_status"] is None
    assert rerun_body["latest_review"]["is_current"] is False

    # 9. Re-review at the new report version ----------------------------------
    re_review = client.post(
        f"/api/v1/investigations/{investigation_id}/review",
        json={
            "decision": "needs_more_information",
            "rationale": "Second look after regeneration.",
            "report_version": rerun_body["report_version"],
        },
    )
    assert re_review.status_code == 200, re_review.text
    re_review_body = re_review.json()
    assert re_review_body["status"] == "needs_more_information"
    assert re_review_body["review_status"] == "needs_more_information"

    history = client.get(f"/api/v1/investigations/{investigation_id}/reviews").json()
    assert history["total"] == 2, "history must be append-only"
    assert history["items"][0]["is_current"] is True
    assert history["items"][0]["decision"] == "needs_more_information"
    assert history["items"][1]["decision"] == "approved"
    assert history["items"][1]["is_current"] is False

    db = SessionLocal()
    try:
        assert (
            db.query(AuditEvent)
            .filter(AuditEvent.entity_id == investigation_id)
            .count()
            == 2
        )
        assert (
            db.query(InvestigationReview)
            .filter(InvestigationReview.investigation_id == investigation_id)
            .count()
            == 2
        )
    finally:
        db.close()

    # 10. Financial integrity: nothing above touched money records ------------
    assert _snapshot_financial_rows() == financial_before


def test_knowledge_ask_reports_insufficient_evidence_without_documents():
    ask = client.post(
        "/api/v1/knowledge/ask", json={"query": "What are the payment terms?"}
    )
    assert ask.status_code == 200, ask.text
    body = ask.json()
    assert body["status"] == "insufficient_evidence"
    assert body["citations"] == []


def test_investigation_without_evidence_routes_to_review_and_records_decision():
    upload = _upload_invoice()
    _import_transactions()
    match = _reconcile_and_get_match(upload["invoice_id"])

    created = client.post(
        "/api/v1/investigations", json={"reconciliation_match_id": match["id"]}
    )
    assert created.status_code == 201, created.text
    investigation_id = created.json()["id"]

    run = client.post(f"/api/v1/investigations/{investigation_id}/run")
    assert run.status_code == 200, run.text
    run_body = run.json()
    # No policy document was indexed, so the difference is unexplained.
    assert run_body["status"] == "needs_review"
    assert run_body["report"]["requires_human_review"] is True

    review = client.post(
        f"/api/v1/investigations/{investigation_id}/review",
        json={
            "decision": "needs_more_information",
            "rationale": "Awaiting the vendor policy document.",
            "report_version": run_body["report_version"],
        },
    )
    assert review.status_code == 200, review.text
    assert review.json()["status"] == "needs_more_information"


def test_read_endpoints_are_organization_scoped():
    """A row belonging to another organization must never be exposed."""
    from app.repositories.invoice_repository import create_invoice

    db = SessionLocal()
    try:
        org2_invoice = create_invoice(
            db,
            organization_id="org_2",
            invoice_number="INV-OTHER",
            currency="INR",
            total_amount=Decimal("999.00"),
        )
        db.add(
            BankTransaction(
                id=str(uuid.uuid4()),
                organization_id="org_2",
                transaction_reference="TXN-OTHER",
                transaction_date=date(2026, 10, 5),
                description="OTHER ORG PAYMENT",
                amount=Decimal("999.00"),
                currency="INR",
            )
        )
        db.commit()
        org2_invoice_id = org2_invoice.id
    finally:
        db.close()

    org2_document_id = None
    db = SessionLocal()
    try:
        org2_document = document_repository.create_document_with_pages(
            db,
            document={
                "id": str(uuid.uuid4()),
                "organization_id": "org_2",
                "original_filename": "other_org.pdf",
                "document_type": "invoice",
                "processing_status": "completed",
            },
            pages=[
                {
                    "page_number": 1,
                    "content": "SECRET OTHER ORG TEXT",
                    "char_count": 21,
                }
            ],
        )
        org2_document_id = org2_document.id
    finally:
        db.close()

    invoices = client.get("/api/v1/invoices").json()
    assert all(item["id"] != org2_invoice_id for item in invoices)

    transactions = client.get("/api/v1/transactions").json()
    assert all(item["transaction_reference"] != "TXN-OTHER" for item in transactions)

    detail = client.get(f"/api/v1/documents/{org2_document_id}")
    assert detail.status_code == 404

