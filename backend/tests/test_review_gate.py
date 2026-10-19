"""Regression tests: the human-review gate must fail closed.

Covers two bugs:
* unmatched / possible_match investigations auto-closed as "completed" with no
  human review (and "No action needed");
* the "difference explained by evidence" check was a substring test, so 50.00
  was "explained" by 1,500.00 and review was skipped.
"""

import uuid
from datetime import date
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from app.agents.nodes import _evidence_mentions_amount
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
from test_investigations import FakeEmbedder, ScriptedLLM, report_json

ORG = "org_1"
D = Decimal


# ---- unit: exact numeric comparison -------------------------------------

@pytest.mark.parametrize(
    "diff,text",
    [
        ("50.00", "Total invoice value INR 1,500.00 payable within 30 days."),
        ("500.00", "Annual contract value is INR 25,000.00 billed quarterly."),
        ("5.00", "Vendor policy v5. All invoices are payable in INR."),
        ("10.00", "Late fee applies after 10 days overdue."),
        ("5.00", "Early payment discount of 5% applies."),
        ("100.00", "Invoice INR 2,100.00 dated 2026-01-05"),
    ],
)
def test_unrelated_numbers_do_not_explain_difference(diff, text):
    assert _evidence_mentions_amount([{"content": text}], D(diff)) is False


@pytest.mark.parametrize(
    "diff,text",
    [
        ("500.00", "A short-payment fee of INR 500.00 applies to wire transfers."),
        ("500.00", "Bank charge: Rs. 500 deducted."),
        ("1500.00", "Handling fee INR 1,500.00 per remittance."),
        ("-500.00", "A fee of 500.00 applies."),
    ],
)
def test_exact_amount_explains_difference(diff, text):
    assert _evidence_mentions_amount([{"content": text}], D(diff)) is True


# ---- integration: fail-closed review gate --------------------------------

@pytest.fixture(autouse=True)
def _setup():
    init_db()
    db = SessionLocal()
    for m in (AuditEvent, InvestigationReview, Investigation, DocumentChunk,
              DocumentPage, Document, ReconciliationMatch, BankTransaction, Invoice):
        db.query(m).delete()
    db.commit()
    db.close()
    emb = FakeEmbedder()
    # LLM claims no review is needed: the deterministic gate must still win.
    llm = ScriptedLLM([report_json(requires_review=False, citations=(1,),
                                   action="No action needed")])
    app.dependency_overrides[get_embedding_provider] = lambda: emb
    app.dependency_overrides[get_llm_client] = lambda: llm
    yield emb
    app.dependency_overrides.pop(get_embedding_provider, None)
    app.dependency_overrides.pop(get_llm_client, None)


client = TestClient(app)


def _invoice(db, number, total="10000.00"):
    inv = Invoice(id=str(uuid.uuid4()), organization_id=ORG, invoice_number=number,
                  currency="INR", total_amount=D(total), invoice_date=date(2026, 1, 1),
                  due_date=date(2026, 1, 31), extraction_status="completed")
    db.add(inv); db.commit()
    return inv


def _txn(db, ref, amount, when=date(2026, 1, 15), desc=""):
    db.add(BankTransaction(id=str(uuid.uuid4()), organization_id=ORG,
                           transaction_reference=ref, transaction_date=when,
                           amount=D(amount), currency="INR", description=desc))
    db.commit()


def _policy(db, emb, text):
    doc = Document(id=str(uuid.uuid4()), organization_id=ORG,
                   original_filename="vendor_policy.pdf", document_type="policy",
                   processing_status="completed")
    db.add(doc); db.commit()
    db.add(DocumentChunk(id=str(uuid.uuid4()), organization_id=ORG, document_id=doc.id,
                         chunk_index=0, page_number=1, content=text,
                         embedding=emb.embed_documents([text])[0]))
    db.commit()


def _investigate(invoice):
    assert client.post("/api/v1/reconciliation/run").status_code == 200
    r = client.post("/api/v1/investigations", json={"invoice_id": invoice.id})
    assert r.status_code == 201
    r = client.post(f"/api/v1/investigations/{r.json()['id']}/run")
    assert r.status_code == 200
    return r.json()


def _assert_needs_human(result):
    assert result["status"] == "needs_review"
    assert result["report"]["requires_human_review"] is True
    assert result["report"]["recommended_action"] != "No action needed"


def test_unmatched_invoice_requires_review():
    db = SessionLocal()
    _assert_needs_human(_investigate(_invoice(db, "INV-9001")))


def test_possible_match_requires_review():
    db = SessionLocal()
    inv = _invoice(db, "INV-9004")
    _txn(db, "UTR778899", "10000.00", when=date(2026, 7, 20), desc="NEFT credit")
    _assert_needs_human(_investigate(inv))


def test_unrelated_policy_figure_does_not_skip_review(_setup):
    db = SessionLocal()
    inv = _invoice(db, "INV-9002")
    _txn(db, "INV-9002", "9950.00")  # short-paid by 50.00
    _policy(db, _setup, "Vendor agreement payment terms and discount policy: "
                        "minimum order value INR 1,500.00, net 30 days.")
    _assert_needs_human(_investigate(inv))


def test_clean_exact_match_may_complete(_setup):
    db = SessionLocal()
    inv = _invoice(db, "INV-9005")
    _txn(db, "INV-9005", "10000.00")
    _policy(db, _setup, "Vendor agreement payment terms and discount policy: net 30 days.")
    result = _investigate(inv)
    assert result["status"] == "completed"
    assert result["report"]["requires_human_review"] is False