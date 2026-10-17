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
from app.models.chat_conversation import ChatConversation
from app.models.chat_message import ChatMessage
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
CONV_URL = "/api/v1/chat/conversations"
DIM = 384


class FakeEmbedder:
    dim = DIM

    _BUCKETS = {
        "invoice": 0,
        "total": 0,
        "amount": 0,
        "bank": 1,
        "transaction": 1,
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


class FakeLLM:
    def __init__(self, reply="The payment terms are net 30 [1]."):
        self.reply = reply
        self.calls = 0

    def answer(self, system_prompt, user_prompt):
        self.calls += 1
        return self.reply


class UnavailableLLM:
    def __init__(self):
        self.calls = 0

    def answer(self, system_prompt, user_prompt):
        self.calls += 1
        raise LLMUnavailable("no key")


def report_json(requires_review=True):
    return json.dumps(
        {
            "summary": "Deterministic facts with retrieved evidence.",
            "findings": [
                {
                    "statement": "Reconciliation difference is documented.",
                    "kind": "fact",
                    "citations": [1],
                }
            ],
            "missing_evidence": [],
            "recommended_action": "Review supporting documents",
            "confidence": "high",
            "requires_human_review": requires_review,
        }
    )


class ScriptedLLM:
    def __init__(self, replies):
        self.replies = list(replies)
        self.calls = 0

    def answer(self, system_prompt, user_prompt):
        reply = self.replies[min(self.calls, len(self.replies) - 1)]
        self.calls += 1
        return reply


@pytest.fixture(autouse=True)
def _clean_tables():
    _purge()
    yield
    _purge()
    app.dependency_overrides.clear()


def _purge():
    init_db()
    db = SessionLocal()
    try:
        for model in (
            ChatMessage,
            ChatConversation,
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


def override(embedder=None, llm=None):
    app.dependency_overrides[get_embedding_provider] = (
        lambda: embedder or FakeEmbedder()
    )
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
            difference_amount=(
                Decimal(difference) if difference is not None else None
            ),
            explanation="Reference matched but amounts differ.",
        )
        db.add(match)
        db.commit()
        return match.id
    finally:
        db.close()


def seed_investigation(status="needs_review", report=None, org=ORG):
    db = SessionLocal()
    try:
        investigation = Investigation(
            id=str(uuid.uuid4()),
            organization_id=org,
            created_by="demo-user",
            status=status,
            workflow_state="generate_report",
            report_json=report if report is not None else report_json(),
            report_version=1,
        )
        db.add(investigation)
        db.commit()
        return investigation.id
    finally:
        db.close()


def seed_and_index_document(filename, pages, document_type="policy"):
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


def new_conversation():
    resp = client.post(CONV_URL, json={})
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def ask(conversation_id, content, attachments=None):
    resp = client.post(
        f"{CONV_URL}/{conversation_id}/messages",
        json={
            "content": content,
            "attachment_document_ids": attachments or [],
        },
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


# --- conversation lifecycle --------------------------------------------------


def test_conversation_create_list_delete_lifecycle():
    conversation_id = new_conversation()
    listing = client.get(CONV_URL).json()
    assert listing["total"] >= 1
    assert any(item["id"] == conversation_id for item in listing["items"])

    detail = client.get(f"{CONV_URL}/{conversation_id}")
    assert detail.status_code == 200
    assert detail.json()["messages"] == []

    assert client.delete(f"{CONV_URL}/{conversation_id}").status_code == 204
    assert client.get(f"{CONV_URL}/{conversation_id}").status_code == 404
    assert client.delete(f"{CONV_URL}/{conversation_id}").status_code == 404


def test_missing_conversation_returns_404():
    override(llm=FakeLLM())
    resp = client.post(
        f"{CONV_URL}/does-not-exist/messages", json={"content": "hello"}
    )
    assert resp.status_code == 404


def test_message_validation_rejects_blank_and_unknown_fields():
    conversation_id = new_conversation()
    blank = client.post(
        f"{CONV_URL}/{conversation_id}/messages", json={"content": "   "}
    )
    assert blank.status_code == 422
    extra = client.post(
        f"{CONV_URL}/{conversation_id}/messages",
        json={"content": "hi", "organization_id": "org_2"},
    )
    assert extra.status_code == 422


# --- general / capability routing -------------------------------------------


def test_general_turn_is_answered_by_configured_model():
    override(llm=FakeLLM(reply="I can help with reconciliation."))
    conversation_id = new_conversation()
    body = ask(conversation_id, "Hello there")
    assert body["assistant_message"]["outcome"] == "answered"
    assert "reconciliation" in body["assistant_message"]["content"]


def test_general_turn_degrades_to_capabilities_without_model():
    override(llm=UnavailableLLM())
    conversation_id = new_conversation()
    body = ask(conversation_id, "Hello there")
    assistant = body["assistant_message"]
    assert assistant["outcome"] == "unavailable"
    assert "documents" in assistant["content"].lower()


def test_payment_action_is_refused_as_unsupported():
    override(llm=FakeLLM())
    conversation_id = new_conversation()
    body = ask(conversation_id, "Pay the invoice INV-104 right now")
    assistant = body["assistant_message"]
    assert assistant["outcome"] == "unsupported"
    assert "never moves money" in assistant["content"].lower()


def test_review_decision_from_chat_is_refused():
    override(llm=FakeLLM())
    conversation_id = new_conversation()
    body = ask(conversation_id, "Approve the investigation")
    assistant = body["assistant_message"]
    assert assistant["outcome"] == "unsupported"
    assert "review workspace" in assistant["content"].lower()


# --- document question answering ---------------------------------------------


def test_document_question_answers_with_citations():
    seed_and_index_document(
        "policy.pdf",
        [(1, "Vendor payment terms: net 30 with a 2.5% early payment discount.")],
    )
    override(llm=FakeLLM(reply="Terms are net 30 with a 2.5% discount [1]."))
    conversation_id = new_conversation()
    body = ask(
        conversation_id,
        "What does the vendor agreement say about payment terms?",
    )
    assistant = body["assistant_message"]
    assert assistant["outcome"] == "answered"
    assert assistant["citations"]
    assert assistant["citations"][0]["filename"] == "policy.pdf"
    assert any(ref["kind"] == "document" for ref in assistant["result_refs"])


def test_document_question_reports_insufficient_evidence():
    override(llm=FakeLLM())
    conversation_id = new_conversation()
    body = ask(conversation_id, "Explain the clause about tax exemptions")
    assistant = body["assistant_message"]
    assert assistant["outcome"] == "insufficient_evidence"
    assert assistant["citations"] == []


def test_attached_document_narrows_retrieval():
    doc_id = seed_and_index_document(
        "vendor_policy.pdf",
        [(1, "Vendor payment terms require net 45 settlement.")],
    )
    override(llm=FakeLLM(reply="Net 45 [1]."))
    conversation_id = new_conversation()
    body = ask(
        conversation_id,
        "According to this document, what are the payment terms?",
        attachments=[doc_id],
    )
    assistant = body["assistant_message"]
    assert assistant["outcome"] == "answered"
    assert assistant["citations"][0]["document_id"] == doc_id


# --- financial query ---------------------------------------------------------


def test_unmatched_financial_query_returns_rows_and_refs():
    invoice_id = seed_invoice()
    seed_match(invoice_id, None, status="unmatched", difference=None)
    override(llm=FakeLLM())
    conversation_id = new_conversation()
    body = ask(conversation_id, "Show me all unmatched payments")
    assistant = body["assistant_message"]
    assert assistant["outcome"] == "success"
    assert "unmatched" in assistant["content"]
    assert any(ref["kind"] == "reconciliation" for ref in assistant["result_refs"])


def test_financial_query_without_rows_reports_insufficient():
    override(llm=FakeLLM())
    conversation_id = new_conversation()
    body = ask(conversation_id, "Show me all unmatched payments")
    assistant = body["assistant_message"]
    assert assistant["outcome"] == "insufficient_evidence"


# --- discrepancy explanation -------------------------------------------------


def test_discrepancy_explains_using_deterministic_difference():
    invoice_id = seed_invoice()
    txn_id = seed_transaction()
    seed_match(invoice_id, txn_id, status="partial_match", difference="300.00")
    seed_and_index_document(
        "policy.pdf",
        [(1, "Vendor payment terms include a 3% early payment discount policy.")],
    )
    override(llm=FakeLLM())
    conversation_id = new_conversation()
    body = ask(conversation_id, "Why was invoice INV-104 underpaid?")
    assistant = body["assistant_message"]
    assert assistant["outcome"] == "success"
    assert "300.00" in assistant["content"]
    assert "partial_match" in assistant["content"]
    kinds = {ref["kind"] for ref in assistant["result_refs"]}
    assert {"invoice", "reconciliation"} <= kinds


def test_discrepancy_follow_up_uses_carried_invoice_reference():
    invoice_id = seed_invoice()
    txn_id = seed_transaction()
    seed_match(invoice_id, txn_id, status="partial_match", difference="300.00")
    override(llm=FakeLLM())
    conversation_id = new_conversation()
    ask(conversation_id, "Why was invoice INV-104 underpaid?")
    follow_up = ask(conversation_id, "Why was it underpaid again?")
    assistant = follow_up["assistant_message"]
    assert assistant["outcome"] == "success"
    assert "300.00" in assistant["content"]


def test_discrepancy_for_unknown_invoice_asks_for_clarification():
    override(llm=FakeLLM())
    conversation_id = new_conversation()
    body = ask(conversation_id, "Compare invoice INV-9999 with its bank transaction")
    assistant = body["assistant_message"]
    assert assistant["outcome"] == "needs_clarification"


# --- reconciliation run ------------------------------------------------------


def test_run_reconciliation_writes_rows_and_summarizes():
    invoice_id = seed_invoice(amount="12000.00")
    txn_id = seed_transaction(amount="12000.00")
    override(llm=FakeLLM())
    conversation_id = new_conversation()
    body = ask(conversation_id, "Run reconciliation please")
    assistant = body["assistant_message"]
    assert assistant["outcome"] == "success"
    assert "row" in assistant["content"].lower()
    db = SessionLocal()
    try:
        stored = (
            db.query(ReconciliationMatch)
            .filter_by(organization_id=ORG)
            .count()
        )
    finally:
        db.close()
    assert stored >= 1


# --- report ------------------------------------------------------------------


def test_report_summarizes_counts_without_llm():
    seed_invoice()
    override(llm=UnavailableLLM())
    conversation_id = new_conversation()
    body = ask(conversation_id, "Generate a report of this month's results")
    assistant = body["assistant_message"]
    assert assistant["outcome"] == "success"
    assert "Reconciliation report" in assistant["content"]
    assert any(ref["href"] == "/reconciliation" for ref in assistant["result_refs"])


# --- review queue ------------------------------------------------------------


def test_review_queue_lists_pending_investigations():
    investigation_id = seed_investigation(status="needs_review")
    override(llm=FakeLLM())
    conversation_id = new_conversation()
    body = ask(conversation_id, "Summarize investigations waiting for my review")
    assistant = body["assistant_message"]
    assert assistant["outcome"] == "success"
    assert any(ref["kind"] == "review" for ref in assistant["result_refs"])
    assert investigation_id[:8] in assistant["content"]


def test_review_queue_empty_is_honest():
    override(llm=FakeLLM())
    conversation_id = new_conversation()
    body = ask(conversation_id, "Summarize investigations waiting for my review")
    assistant = body["assistant_message"]
    assert assistant["outcome"] == "success"
    assert "nothing" in assistant["content"].lower()


# --- investigation list ------------------------------------------------------


def test_investigation_list_reports_statuses():
    seed_investigation(status="needs_review")
    override(llm=FakeLLM())
    conversation_id = new_conversation()
    body = ask(conversation_id, "List all investigations")
    assistant = body["assistant_message"]
    assert assistant["outcome"] == "success"
    assert "needs_review" in assistant["content"]


# --- investigation run -------------------------------------------------------


def test_investigate_invoice_runs_workflow_and_returns_report():
    invoice_id = seed_invoice()
    txn_id = seed_transaction()
    seed_match(invoice_id, txn_id, status="needs_review", difference="300.00")
    override(llm=ScriptedLLM([report_json()]))
    conversation_id = new_conversation()
    body = ask(conversation_id, "Investigate invoice INV-104")
    assistant = body["assistant_message"]
    assert assistant["outcome"] == "success"
    assert "Investigation" in assistant["content"]
    assert any(ref["kind"] == "investigation" for ref in assistant["result_refs"])
    db = SessionLocal()
    try:
        count = (
            db.query(Investigation)
            .filter_by(organization_id=ORG, invoice_id=invoice_id)
            .count()
        )
    finally:
        db.close()
    assert count == 1


def test_investigate_without_target_asks_for_clarification():
    override(llm=FakeLLM())
    conversation_id = new_conversation()
    body = ask(conversation_id, "Please investigate this")
    assistant = body["assistant_message"]
    assert assistant["outcome"] == "needs_clarification"


# --- persistence of provenance ----------------------------------------------


def test_assistant_message_persists_structured_payload():
    invoice_id = seed_invoice()
    txn_id = seed_transaction()
    seed_match(invoice_id, txn_id, status="partial_match", difference="300.00")
    override(llm=FakeLLM())
    conversation_id = new_conversation()
    ask(conversation_id, "Why was invoice INV-104 underpaid?")

    detail = client.get(f"{CONV_URL}/{conversation_id}").json()
    assert len(detail["messages"]) == 2
    assert detail["messages"][0]["role"] == "user"
    assistant = detail["messages"][1]
    assert assistant["role"] == "assistant"
    assert assistant["outcome"] == "success"
    assert assistant["tool_calls"], "tool-call provenance should be recorded"
    assert detail["title"], "title should be derived from the first message"
