import json
import uuid
from datetime import date
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from app.api.deps import get_embedding_provider, get_llm_client
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
from app.services.llm_client import LLMUnavailable

client = TestClient(app)

ORG = "org_1"
INV_URL = "/api/v1/investigations"
DIM = 384


class FakeEmbedder:
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


class ScriptedLLM:
    """Returns queued replies in order, recording calls."""

    def __init__(self, replies):
        self.replies = list(replies)
        self.calls = 0

    def answer(self, system_prompt, user_prompt):
        reply = self.replies[min(self.calls, len(self.replies) - 1)]
        self.calls += 1
        return reply


class UnavailableLLM:
    def __init__(self):
        self.calls = 0

    def answer(self, system_prompt, user_prompt):
        self.calls += 1
        raise LLMUnavailable("no key")


def report_json(
    citations=(1,),
    action="Review supporting documents",
    requires_review=False,
    findings=None,
):
    if findings is None:
        findings = [
            {"statement": "Reconciliation difference is documented.", "kind": "fact", "citations": list(citations)}
        ]
    return json.dumps(
        {
            "summary": "Summary of the deterministic facts and evidence.",
            "findings": findings,
            "missing_evidence": [],
            "recommended_action": action,
            "confidence": "high",
            "requires_human_review": requires_review,
        }
    )


@pytest.fixture(autouse=True)
def _clean_tables():
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
    yield
    app.dependency_overrides.clear()


def override(embedder=None, llm=None):
    app.dependency_overrides[get_embedding_provider] = lambda: embedder or FakeEmbedder()
    if llm is not None:
        app.dependency_overrides[get_llm_client] = lambda: llm


def seed_invoice(amount="12000.00", currency="INR", number="INV-104", org=ORG):
    db = SessionLocal()
    try:
        invoice = Invoice(
            id=str(uuid.uuid4()),
            organization_id=org,
            invoice_number=number,
            vendor_id="vendor-1",
            invoice_date=date(2026, 10, 1),
            due_date=date(2026, 10, 30),
            currency=currency,
            total_amount=Decimal(amount),
            extraction_status="completed",
        )
        db.add(invoice)
        db.commit()
        return invoice.id
    finally:
        db.close()


def seed_transaction(amount="11700.00", currency="INR", org=ORG):
    db = SessionLocal()
    try:
        txn = BankTransaction(
            id=str(uuid.uuid4()),
            organization_id=org,
            transaction_reference="TXN-778",
            transaction_date=date(2026, 10, 5),
            description="NORTHSTAR OFFICE SUPPLIES",
            amount=Decimal(amount),
            currency=currency,
        )
        db.add(txn)
        db.commit()
        return txn.id
    finally:
        db.close()


def seed_match(invoice_id, transaction_id, status="partial_match", difference="300.00"):
    db = SessionLocal()
    try:
        match = ReconciliationMatch(
            id=str(uuid.uuid4()),
            organization_id=ORG,
            invoice_id=invoice_id,
            transaction_id=transaction_id,
            match_status=status,
            matching_method="reference_exact",
            difference_amount=Decimal(difference) if difference is not None else None,
            explanation="Reference matched but amounts differ.",
        )
        db.add(match)
        db.commit()
        return match.id
    finally:
        db.close()


def seed_and_index_document(filename, pages, document_type="policy"):
    # Always index with the deterministic fake embedder, regardless of test order.
    app.dependency_overrides[get_embedding_provider] = lambda: FakeEmbedder()
    db = SessionLocal()
    try:
        doc = document_repository.create_document_with_pages(
            db,
            document={
                "id": str(uuid.uuid4()),
                "organization_id": ORG,
                "original_filename": filename,
                "document_type": document_type,
                "processing_status": "completed",
            },
            pages=[
                {"page_number": n, "content": c, "char_count": len(c)}
                for n, c in pages
            ],
        )
        doc_id = doc.id
    finally:
        db.close()
    resp = client.post(f"/api/v1/knowledge/index/{doc_id}")
    assert resp.status_code == 200, resp.text
    return doc_id


def create_investigation(invoice_id):
    resp = client.post(INV_URL, json={"invoice_id": invoice_id})
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


# --- creation ----------------------------------------------------------------


def test_create_investigation_persists_pending_record():
    invoice_id = seed_invoice()
    override()
    resp = client.post(INV_URL, json={"invoice_id": invoice_id})
    assert resp.status_code == 201
    body = resp.json()
    assert body["status"] == "pending"
    assert body["invoice_id"] == invoice_id
    assert body["report"] is None


def test_create_rejects_unknown_invoice():
    override()
    resp = client.post(INV_URL, json={"invoice_id": "nope"})
    assert resp.status_code == 404


def test_create_requires_a_reference():
    override()
    resp = client.post(INV_URL, json={})
    assert resp.status_code == 422


def test_get_and_list_are_organization_scoped():
    invoice_id = seed_invoice()
    override()
    inv_id = create_investigation(invoice_id)

    assert client.get(f"{INV_URL}/{inv_id}").status_code == 200
    assert client.get(f"{INV_URL}/does-not-exist").status_code == 404

    listing = client.get(INV_URL).json()
    assert listing["total"] >= 1
    assert any(item["id"] == inv_id for item in listing["items"])


def test_other_organization_invoice_is_not_visible():
    invoice_id = seed_invoice(org="org_2")
    override()
    resp = client.post(INV_URL, json={"invoice_id": invoice_id})
    assert resp.status_code == 404


# --- run: happy paths --------------------------------------------------------


def test_run_completes_when_evidence_explains_difference():
    invoice_id = seed_invoice()
    txn_id = seed_transaction()
    seed_match(invoice_id, txn_id)
    override(llm=ScriptedLLM([report_json(citations=(2, 4))]))
    seed_and_index_document(
        "policy.pdf",
        [(1, "Payment terms: a 3% early payment discount. The 300.00 difference is an early-payment discount.")],
    )
    inv_id = create_investigation(invoice_id)

    resp = client.post(f"{INV_URL}/{inv_id}/run")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "completed"
    assert body["model_name"]  # LLM model recorded
    report = body["report"]
    assert report["findings"], "expected findings"
    kinds = {c["kind"] for c in report["citations"]}
    assert "document_chunk" in kinds
    doc_citations = [c for c in report["citations"] if c["kind"] == "document_chunk"]
    assert doc_citations[0]["filename"] == "policy.pdf"
    assert doc_citations[0]["page_number"] == 1


def test_run_completes_clean_zero_difference_without_llm():
    invoice_id = seed_invoice(amount="12000.00")
    txn_id = seed_transaction(amount="12000.00")
    seed_match(invoice_id, txn_id, status="exact_match", difference="0.00")
    llm = ScriptedLLM([report_json()])
    override(llm=llm)
    inv_id = create_investigation(invoice_id)

    resp = client.post(f"{INV_URL}/{inv_id}/run")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "completed"
    assert llm.calls == 0
    assert body["report"]["recommended_action"] == "No action needed"


# --- run: insufficient / missing evidence -----------------------------------


def test_run_routes_to_review_when_no_evidence():
    invoice_id = seed_invoice()
    txn_id = seed_transaction()
    seed_match(invoice_id, txn_id)
    llm = ScriptedLLM([report_json()])
    override(llm=llm)
    inv_id = create_investigation(invoice_id)

    resp = client.post(f"{INV_URL}/{inv_id}/run")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "needs_review"
    assert llm.calls == 0, "no LLM call without usable evidence"
    report = body["report"]
    assert any("difference" in item for item in report["missing_evidence"])
    assert report["requires_human_review"] is True


# --- run: conflicting / uncertain engine result ------------------------------


def test_run_routes_to_review_when_engine_uncertain():
    invoice_id = seed_invoice()
    txn_id = seed_transaction()
    seed_match(invoice_id, txn_id, status="needs_review", difference="300.00")
    override(llm=ScriptedLLM([report_json(citations=(2, 4))]))
    seed_and_index_document(
        "agreement.pdf",
        [(1, "Vendor agreement references payment terms for this vendor.")],
    )
    inv_id = create_investigation(invoice_id)

    resp = client.post(f"{INV_URL}/{inv_id}/run")
    body = resp.json()
    assert body["status"] == "needs_review"
    assert body["report"]["requires_human_review"] is True


# --- run: LLM failures -------------------------------------------------------


def test_run_degrades_gracefully_when_llm_unavailable():
    invoice_id = seed_invoice()
    txn_id = seed_transaction()
    seed_match(invoice_id, txn_id)
    llm = UnavailableLLM()
    override(llm=llm)
    seed_and_index_document(
        "policy.pdf",
        [(1, "Payment terms and discount policy for vendor agreements.")],
    )
    inv_id = create_investigation(invoice_id)

    resp = client.post(f"{INV_URL}/{inv_id}/run")
    body = resp.json()
    assert body["status"] == "needs_review"
    assert body["model_name"] == "deterministic"
    assert llm.calls == 1
    report = body["report"]
    # No fabricated narrative: only deterministic fact findings.
    assert all(f["kind"] == "fact" for f in report["findings"])
    assert "unavailable" in report["summary"].lower()


# --- run: report validation / retry -----------------------------------------


def test_invalid_citations_retry_then_succeed():
    invoice_id = seed_invoice()
    txn_id = seed_transaction()
    seed_match(invoice_id, txn_id)
    seed_and_index_document(
        "policy.pdf",
        [(1, "Payment terms: early payment discount of 300.00.")],
    )
    llm = ScriptedLLM(
        [
            report_json(citations=(99,)),  # invalid index -> retry
            report_json(citations=(2, 4)),  # valid
        ]
    )
    override(llm=llm)
    inv_id = create_investigation(invoice_id)

    resp = client.post(f"{INV_URL}/{inv_id}/run")
    body = resp.json()
    assert llm.calls == 2
    assert body["status"] == "completed"
    assert body["report"]["findings"]


def test_persistently_invalid_report_routes_to_review():
    invoice_id = seed_invoice()
    txn_id = seed_transaction()
    seed_match(invoice_id, txn_id)
    seed_and_index_document(
        "policy.pdf",
        [(1, "Payment terms: early payment discount of 300.00.")],
    )
    llm = ScriptedLLM([report_json(citations=(99,))])
    override(llm=llm)
    inv_id = create_investigation(invoice_id)

    resp = client.post(f"{INV_URL}/{inv_id}/run")
    body = resp.json()
    assert llm.calls == 2
    assert body["status"] == "needs_review"


def test_disallowed_action_is_coerced_and_reviewed():
    invoice_id = seed_invoice()
    txn_id = seed_transaction()
    seed_match(invoice_id, txn_id)
    seed_and_index_document(
        "policy.pdf",
        [(1, "Payment terms: early payment discount of 300.00.")],
    )
    override(llm=ScriptedLLM([report_json(citations=(2, 4), action="Transfer funds immediately")]))
    inv_id = create_investigation(invoice_id)

    resp = client.post(f"{INV_URL}/{inv_id}/run")
    body = resp.json()
    assert body["status"] == "needs_review"
    assert body["report"]["recommended_action"] == "Mark for human review"


# --- boundary: no side effects on reconciliation -----------------------------


def test_run_does_not_change_reconciliation_results():
    invoice_id = seed_invoice()
    txn_id = seed_transaction()
    seed_match(invoice_id, txn_id)
    override(llm=ScriptedLLM([report_json(citations=(2,))]))

    db = SessionLocal()
    try:
        before = sorted(
            (m.id, m.match_status, str(m.difference_amount), m.transaction_id)
            for m in db.query(ReconciliationMatch).all()
        )
    finally:
        db.close()

    inv_id = create_investigation(invoice_id)
    client.post(f"{INV_URL}/{inv_id}/run")

    db = SessionLocal()
    try:
        after = sorted(
            (m.id, m.match_status, str(m.difference_amount), m.transaction_id)
            for m in db.query(ReconciliationMatch).all()
        )
    finally:
        db.close()

    assert before == after
