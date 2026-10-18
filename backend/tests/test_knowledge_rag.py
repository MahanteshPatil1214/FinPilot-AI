import uuid

import pytest
from fastapi.testclient import TestClient

from app.api.deps import get_embedding_provider, get_llm_client
from app.db.init_db import init_db
from app.db.session import SessionLocal
from app.main import app
from app.models.document import Document
from app.models.document_chunk import DocumentChunk
from app.models.document_page import DocumentPage
from app.repositories import document_repository
from app.services import rag_service
from app.services.llm_client import LLMUnavailable
from app.services.text_chunker import chunk_pages, clean_extracted_text, split_text

client = TestClient(app)

ORG = "org_1"
INDEX_URL = "/api/v1/knowledge/index/{doc_id}"
SEARCH_URL = "/api/v1/knowledge/search"
ASK_URL = "/api/v1/knowledge/ask"

DIM = 384


class FakeEmbedder:
    """Deterministic keyword-bucket embedder; no external model needed."""

    dim = DIM

    _BUCKETS = {
        "invoice": 0,
        "total": 0,
        "amount": 0,
        "due": 0,
        "bank": 1,
        "transaction": 1,
        "statement": 1,
        "debit": 1,
        "tax": 2,
        "gst": 2,
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
    def __init__(self, reply="The answer is [1]."):
        self.reply = reply
        self.calls = 0
        self.last_prompt = None

    def answer(self, system_prompt, user_prompt):
        self.calls += 1
        self.last_prompt = user_prompt
        return self.reply


class UnavailableLLM:
    def answer(self, system_prompt, user_prompt):
        raise LLMUnavailable("no key")


@pytest.fixture(autouse=True)
def _clean_tables():
    init_db()
    db = SessionLocal()
    try:
        db.query(DocumentChunk).delete()
        db.query(DocumentPage).delete()
        db.query(Document).delete()
        db.commit()
    finally:
        db.close()
    yield
    app.dependency_overrides.clear()


def seed_document(filename, pages, document_type="invoice", org=ORG):
    db = SessionLocal()
    try:
        doc = document_repository.create_document_with_pages(
            db,
            document={
                "id": str(uuid.uuid4()),
                "organization_id": org,
                "original_filename": filename,
                "document_type": document_type,
                "processing_status": "completed",
            },
            pages=[
                {"page_number": number, "content": content, "char_count": len(content)}
                for number, content in pages
            ],
        )
        return doc.id
    finally:
        db.close()


def override(embedder=None, llm=None):
    if embedder is not None:
        app.dependency_overrides[get_embedding_provider] = lambda: embedder
    if llm is not None:
        app.dependency_overrides[get_llm_client] = lambda: llm


# --- text_chunker unit tests -------------------------------------------------


def test_split_text_respects_size_and_overlaps():
    text = " ".join(f"word{i}" for i in range(400))
    chunks = split_text(text, chunk_size=100, overlap=20)
    assert len(chunks) > 1
    assert all(len(chunk) <= 120 for chunk in chunks)
    # Overlap: the tail of one chunk reappears in the next.
    assert chunks[0][-10:] in chunks[1] or chunks[1][:20] in chunks[0] + chunks[1]


def test_chunk_pages_carries_page_numbers_and_indices():
    pages = [
        {"page_number": 1, "content": "Alpha beta gamma " * 40},
        {"page_number": 2, "content": "   "},
        {"page_number": 3, "content": "Delta epsilon " * 40},
    ]
    chunks = chunk_pages(pages, chunk_size=100, overlap=10)
    assert chunks, "expected chunks"
    assert [c["chunk_index"] for c in chunks] == list(range(len(chunks)))
    # Empty page 2 must not appear.
    assert {c["page_number"] for c in chunks} == {1, 3}


def test_clean_extracted_text_keeps_numbers():
    raw = "Total   due:\n\n\n\n1,234.50\r\n"
    cleaned = clean_extracted_text(raw)
    assert "1,234.50" in cleaned
    assert "\n\n\n" not in cleaned


# --- indexing ----------------------------------------------------------------


def test_index_document_creates_chunks_and_is_idempotent():
    doc_id = seed_document(
        "invoice_a.pdf",
        [
            (1, "Invoice INV-100 total amount due is 500.00"),
            (2, "Payment terms net 30"),
        ],
    )
    override(embedder=FakeEmbedder())

    first = client.post(INDEX_URL.format(doc_id=doc_id))
    assert first.status_code == 200
    assert first.json()["chunks_indexed"] >= 1

    second = client.post(INDEX_URL.format(doc_id=doc_id))
    assert second.status_code == 200
    assert second.json()["chunks_indexed"] == first.json()["chunks_indexed"]

    db = SessionLocal()
    try:
        stored = db.query(DocumentChunk).filter_by(document_id=doc_id).count()
    finally:
        db.close()
    assert stored == first.json()["chunks_indexed"]


def test_index_unknown_document_returns_404():
    override(embedder=FakeEmbedder())
    response = client.post(INDEX_URL.format(doc_id="does-not-exist"))
    assert response.status_code == 404


def test_index_rejects_other_organization_document():
    doc_id = seed_document("secret.pdf", [(1, "Confidential")], org="org_2")
    override(embedder=FakeEmbedder())
    response = client.post(INDEX_URL.format(doc_id=doc_id))
    assert response.status_code == 404


# --- search ------------------------------------------------------------------


def test_search_returns_ranked_evidence_with_source_and_page():
    invoice_id = seed_document(
        "invoice_a.pdf",
        [
            (1, "Invoice INV-100 total amount due is 500.00"),
            (2, "Payment terms net 30"),
        ],
    )
    seed_document(
        "statement_b.pdf",
        [(1, "Bank transaction statement shows a debit of 200.00")],
        document_type="bank_statement",
    )
    override(embedder=FakeEmbedder())
    for doc_id in (invoice_id,):
        client.post(INDEX_URL.format(doc_id=doc_id))
    db = SessionLocal()
    try:
        other = db.query(Document).filter_by(original_filename="statement_b.pdf").one()
    finally:
        db.close()
    client.post(INDEX_URL.format(doc_id=other.id))

    response = client.post(SEARCH_URL, json={"query": "what is the invoice total amount"})
    assert response.status_code == 200
    body = response.json()
    assert body["total"] >= 1
    top = body["results"][0]
    assert top["filename"] == "invoice_a.pdf"
    assert top["page_number"] == 1
    assert top["score"] > 0


def test_search_filters_by_document_id():
    invoice_id = seed_document("invoice_a.pdf", [(1, "Invoice INV-100 total amount due")])
    seed_document("invoice_b.pdf", [(1, "Invoice INV-200 total amount due")])
    override(embedder=FakeEmbedder())
    client.post(INDEX_URL.format(doc_id=invoice_id))
    db = SessionLocal()
    try:
        other = db.query(Document).filter_by(original_filename="invoice_b.pdf").one()
    finally:
        db.close()
    client.post(INDEX_URL.format(doc_id=other.id))

    response = client.post(
        SEARCH_URL,
        json={"query": "invoice total amount", "filters": {"document_id": invoice_id}},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["total"] >= 1
    assert {item["document_id"] for item in body["results"]} == {invoice_id}


def test_search_includes_zero_vector_chunk_without_nan():
    doc_id = seed_document(
        "invoice_a.pdf",
        [
            (1, "Invoice INV-100 total amount due"),
            (2, "Payment terms net 30"),
        ],
    )
    override(embedder=FakeEmbedder())
    client.post(INDEX_URL.format(doc_id=doc_id))

    response = client.post(SEARCH_URL, json={"query": "invoice total amount"})
    assert response.status_code == 200
    scores = {item["page_number"]: item["score"] for item in response.json()["results"]}
    # Page 2 has no signal; its score must be a finite 0.0, never NaN/None.
    assert scores[2] == 0.0


# --- ask ---------------------------------------------------------------------


def test_ask_answers_with_citations():
    doc_id = seed_document(
        "invoice_a.pdf",
        [(1, "Invoice INV-100 total amount due is 500.00")],
    )
    llm = FakeLLM(reply="The total amount due is 500.00 [1].")
    override(embedder=FakeEmbedder(), llm=llm)
    client.post(INDEX_URL.format(doc_id=doc_id))

    response = client.post(ASK_URL, json={"query": "what is the invoice total amount"})
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "answered"
    assert "[1]" in body["answer"]
    assert len(body["citations"]) == 1
    assert body["citations"][0]["filename"] == "invoice_a.pdf"
    assert body["citations"][0]["page_number"] == 1
    assert llm.calls == 1


def test_ask_returns_insufficient_when_no_relevant_evidence():
    doc_id = seed_document("invoice_a.pdf", [(1, "Invoice INV-100 total amount due")])
    llm = FakeLLM()
    override(embedder=FakeEmbedder(), llm=llm)
    client.post(INDEX_URL.format(doc_id=doc_id))

    response = client.post(ASK_URL, json={"query": "what is the gst tax rate"})
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "insufficient_evidence"
    assert body["citations"] == []
    assert llm.calls == 0, "LLM must not be called without usable evidence"


def test_ask_honours_model_insufficient_signal():
    doc_id = seed_document("invoice_a.pdf", [(1, "Invoice INV-100 total amount due")])
    llm = FakeLLM(reply="INSUFFICIENT_EVIDENCE")
    override(embedder=FakeEmbedder(), llm=llm)
    client.post(INDEX_URL.format(doc_id=doc_id))

    response = client.post(ASK_URL, json={"query": "what is the invoice total amount"})
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "insufficient_evidence"
    assert body["citations"] == []
    assert body["evidence"], "retrieved evidence should still be reported"
    assert llm.calls == 1


def test_ask_returns_503_when_llm_unavailable():
    doc_id = seed_document("invoice_a.pdf", [(1, "Invoice INV-100 total amount due")])
    override(embedder=FakeEmbedder(), llm=UnavailableLLM())
    client.post(INDEX_URL.format(doc_id=doc_id))

    response = client.post(ASK_URL, json={"query": "what is the invoice total amount"})
    assert response.status_code == 503


def test_ask_validates_empty_query():
    override(embedder=FakeEmbedder(), llm=FakeLLM())
    response = client.post(ASK_URL, json={"query": ""})
    assert response.status_code == 422


def _payment_evidence():
    return [
        {
            "document_id": "doc-policy",
            "filename": "vendor_policy_acme.pdf",
            "page_number": 1,
            "chunk_id": "chunk-policy",
            "score": 0.49,
            "content": "Vendor Payment Policy. Applies to invoice INV-2026-0001.",
        },
        {
            "document_id": "doc-invoice",
            "filename": "invoice_acme_2026_0001.pdf",
            "page_number": 1,
            "chunk_id": "chunk-invoice",
            "score": 0.42,
            "content": "Tax Invoice Invoice No: INV-2026-0001\nPayment terms: Net 30",
        },
    ]


def test_payment_terms_answered_deterministically_when_model_refuses():
    # The model ignores the retrieved invoice line and refuses; the deterministic
    # grounded fallback answers from the literal, cited passage instead.
    llm = FakeLLM(reply="INSUFFICIENT_EVIDENCE")
    result = rag_service.answer_from_evidence(
        "What is the standard payment term in the vendor payment policy?",
        llm,
        _payment_evidence(),
    )
    assert result["status"] == "answered"
    assert "Net 30" in result["answer"]
    assert result["answer"].endswith("[2].")
    assert result["citations"][0]["filename"] == "vendor_policy_acme.pdf"
    assert llm.calls == 1


def test_payment_terms_fallback_leaves_unrelated_questions_insufficient():
    llm = FakeLLM(reply="INSUFFICIENT_EVIDENCE")
    result = rag_service.answer_from_evidence(
        "What is the invoice total?",
        llm,
        _payment_evidence(),
    )
    assert result["status"] == "insufficient_evidence"
    assert result["citations"] == []
    assert llm.calls == 1


def test_payment_terms_fallback_stays_insufficient_without_a_literal_value():
    llm = FakeLLM(reply="INSUFFICIENT_EVIDENCE")
    result = rag_service.answer_from_evidence(
        "What are the payment terms?",
        llm,
        [_payment_evidence()[0]],
    )
    assert result["status"] == "insufficient_evidence"
    assert result["citations"] == []
    assert llm.calls == 1
