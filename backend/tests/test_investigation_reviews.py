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
from app.repositories import investigation_repository as repo
from app.services import investigation_review_service as review_service

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
    def __init__(self, replies):
        self.replies = list(replies)
        self.calls = 0

    def answer(self, system_prompt, user_prompt):
        reply = self.replies[min(self.calls, len(self.replies) - 1)]
        self.calls += 1
        return reply


def report_json(citations=(2, 4)):
    return json.dumps(
        {
            "summary": "Summary of the deterministic facts and evidence.",
            "findings": [
                {
                    "statement": "The difference is documented.",
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


def prepare_completed():
    """Create an investigation and run it to a completed report (v1)."""
    invoice_id = seed_invoice()
    txn_id = seed_transaction()
    seed_match(invoice_id, txn_id)
    override(llm=ScriptedLLM([report_json()]))
    seed_and_index_document(
        "policy.pdf",
        [(1, "Payment terms: early payment discount of 300.00.")],
    )
    inv_id = create_investigation(invoice_id)
    resp = client.post(f"{INV_URL}/{inv_id}/run")
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "completed"
    return inv_id


def prepare_needs_review():
    """Create an investigation that the engine flags for review (v1)."""
    invoice_id = seed_invoice()
    txn_id = seed_transaction()
    seed_match(invoice_id, txn_id)
    override(llm=ScriptedLLM([report_json()]))
    inv_id = create_investigation(invoice_id)
    resp = client.post(f"{INV_URL}/{inv_id}/run")
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "needs_review"
    return inv_id


def review_body(decision="approved", rationale="Reviewed the evidence.", version=1):
    return {"decision": decision, "rationale": rationale, "report_version": version}


# --- happy paths / state transitions ----------------------------------------


def test_approve_updates_status_and_exposes_review():
    inv_id = prepare_completed()
    resp = client.post(f"{INV_URL}/{inv_id}/review", json=review_body("approved"))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "approved"
    assert body["review_status"] == "approved"
    latest = body["latest_review"]
    assert latest["rationale"] == "Reviewed the evidence."
    assert latest["reviewer_id"] == "demo-user"
    assert latest["previous_status"] == "completed"
    assert latest["resulting_status"] == "approved"


def test_reject_transitions_status():
    inv_id = prepare_completed()
    resp = client.post(f"{INV_URL}/{inv_id}/review", json=review_body("rejected"))
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "rejected"


def test_needs_more_information_transitions_status():
    inv_id = prepare_needs_review()
    resp = client.post(
        f"{INV_URL}/{inv_id}/review", json=review_body("needs_more_information")
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "needs_more_information"


def test_review_status_exposed_in_detail_and_list():
    inv_id = prepare_completed()
    client.post(f"{INV_URL}/{inv_id}/review", json=review_body("approved"))

    detail = client.get(f"{INV_URL}/{inv_id}").json()
    assert detail["review_status"] == "approved"

    listing = client.get(INV_URL).json()
    item = next(i for i in listing["items"] if i["id"] == inv_id)
    assert item["review_status"] == "approved"


# --- history ----------------------------------------------------------------


def test_review_history_lists_decisions():
    inv_id = prepare_completed()
    client.post(f"{INV_URL}/{inv_id}/review", json=review_body("approved"))

    resp = client.get(f"{INV_URL}/{inv_id}/reviews")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["investigation_id"] == inv_id
    assert body["total"] == 1
    assert body["review_status"] == "approved"
    assert body["items"][0]["decision"] == "approved"
    assert body["items"][0]["reviewer_id"] == "demo-user"


def test_review_history_empty_before_any_decision():
    inv_id = prepare_completed()
    resp = client.get(f"{INV_URL}/{inv_id}/reviews")
    assert resp.status_code == 200
    assert resp.json()["total"] == 0
    assert resp.json()["review_status"] is None


def test_audit_event_written_on_review():
    inv_id = prepare_completed()
    client.post(f"{INV_URL}/{inv_id}/review", json=review_body("approved"))

    db = SessionLocal()
    try:
        events = db.query(AuditEvent).filter_by(action="review_decision").all()
        assert len(events) == 1
        event = events[0]
        assert event.entity_type == "investigation"
        assert event.entity_id == inv_id
        assert event.action == "review_decision"
        assert event.actor_id == "demo-user"
        assert "approved" in event.details_json
    finally:
        db.close()


# --- invalid input ----------------------------------------------------------


def test_review_requires_non_empty_rationale():
    inv_id = prepare_completed()
    for bad in ("", "   "):
        resp = client.post(
            f"{INV_URL}/{inv_id}/review",
            json={"decision": "approved", "rationale": bad, "report_version": 1},
        )
        assert resp.status_code == 422, resp.text


def test_review_rejects_unknown_decision():
    inv_id = prepare_completed()
    resp = client.post(
        f"{INV_URL}/{inv_id}/review",
        json={"decision": "maybe", "rationale": "x", "report_version": 1},
    )
    assert resp.status_code == 422


def test_review_rejects_client_supplied_reviewer_id():
    inv_id = prepare_completed()
    resp = client.post(
        f"{INV_URL}/{inv_id}/review",
        json={
            "decision": "approved",
            "rationale": "x",
            "report_version": 1,
            "reviewer_id": "attacker",
        },
    )
    assert resp.status_code == 422


def test_review_requires_report_version():
    inv_id = prepare_completed()
    resp = client.post(
        f"{INV_URL}/{inv_id}/review",
        json={"decision": "approved", "rationale": "x"},
    )
    assert resp.status_code == 422


def test_review_rejects_negative_report_version():
    inv_id = prepare_completed()
    resp = client.post(
        f"{INV_URL}/{inv_id}/review",
        json={"decision": "approved", "rationale": "x", "report_version": -1},
    )
    assert resp.status_code == 422


# --- access control / organization isolation --------------------------------


def test_review_unknown_investigation_returns_404():
    override()
    resp = client.post(f"{INV_URL}/missing/review", json=review_body())
    assert resp.status_code == 404


def test_review_history_unknown_investigation_returns_404():
    override()
    assert client.get(f"{INV_URL}/missing/reviews").status_code == 404


def _insert_other_org_completed_investigation():
    db = SessionLocal()
    try:
        inv = Investigation(
            id=str(uuid.uuid4()),
            organization_id="org_2",
            status="completed",
            report_version=1,
        )
        db.add(inv)
        db.commit()
        return inv.id
    finally:
        db.close()


def test_review_cross_organization_returns_404():
    other_id = _insert_other_org_completed_investigation()
    override()
    resp = client.post(f"{INV_URL}/{other_id}/review", json=review_body())
    assert resp.status_code == 404


def test_review_history_cross_organization_returns_404():
    other_id = _insert_other_org_completed_investigation()
    override()
    assert client.get(f"{INV_URL}/{other_id}/reviews").status_code == 404


# --- eligibility / stale / concurrent ---------------------------------------


def test_review_rejected_when_not_eligible():
    invoice_id = seed_invoice()
    override()
    inv_id = create_investigation(invoice_id)  # status pending
    resp = client.post(f"{INV_URL}/{inv_id}/review", json=review_body(version=0))
    assert resp.status_code == 409, resp.text


def test_second_review_conflicts():
    inv_id = prepare_completed()
    first = client.post(f"{INV_URL}/{inv_id}/review", json=review_body("approved"))
    assert first.status_code == 200
    # A review does not advance report_version, so the same version is submitted
    # again; it is rejected because the investigation is no longer reviewable.
    second = client.post(f"{INV_URL}/{inv_id}/review", json=review_body("rejected", version=1))
    assert second.status_code == 409

    history = client.get(f"{INV_URL}/{inv_id}/reviews").json()
    assert history["total"] == 1


def test_stale_report_version_conflict_leaves_state_unchanged():
    inv_id = prepare_completed()
    resp = client.post(
        f"{INV_URL}/{inv_id}/review", json=review_body("approved", version=0)
    )
    assert resp.status_code == 409, resp.text

    detail = client.get(f"{INV_URL}/{inv_id}").json()
    assert detail["status"] == "completed"
    assert detail["report_version"] == 1
    assert client.get(f"{INV_URL}/{inv_id}/reviews").json()["total"] == 0


def test_rerun_then_old_version_is_stale():
    inv_id = prepare_completed()
    # Re-run generates a new report version; the reviewer's old version is stale.
    rerun = client.post(f"{INV_URL}/{inv_id}/run")
    assert rerun.status_code == 200
    new_version = rerun.json()["report_version"]
    assert new_version == 2

    stale = client.post(
        f"{INV_URL}/{inv_id}/review", json=review_body("approved", version=1)
    )
    assert stale.status_code == 409

    fresh = client.post(
        f"{INV_URL}/{inv_id}/review", json=review_body("approved", version=new_version)
    )
    assert fresh.status_code == 200


def test_report_version_increments_on_run():
    inv_id = prepare_completed()
    assert client.get(f"{INV_URL}/{inv_id}").json()["report_version"] == 1
    client.post(f"{INV_URL}/{inv_id}/run")
    assert client.get(f"{INV_URL}/{inv_id}").json()["report_version"] == 2


# --- rerun vs. review currency (report_version consistency) ------------------


def test_review_does_not_advance_report_version():
    inv_id = prepare_completed()
    resp = client.post(f"{INV_URL}/{inv_id}/review", json=review_body("approved"))
    assert resp.status_code == 200
    assert resp.json()["report_version"] == 1


def test_rerun_after_review_marks_review_superseded():
    inv_id = prepare_completed()
    approved = client.post(f"{INV_URL}/{inv_id}/review", json=review_body("approved"))
    assert approved.status_code == 200
    assert approved.json()["review_status"] == "approved"

    rerun = client.post(f"{INV_URL}/{inv_id}/run")
    assert rerun.status_code == 200
    assert rerun.json()["report_version"] == 2

    detail = client.get(f"{INV_URL}/{inv_id}").json()
    assert detail["report_version"] == 2
    # The old decision must not appear current for the regenerated report.
    assert detail["review_status"] is None
    assert detail["latest_review"]["decision"] == "approved"
    assert detail["latest_review"]["is_current"] is False

    history = client.get(f"{INV_URL}/{inv_id}/reviews").json()
    assert history["total"] == 1
    assert history["review_status"] is None
    assert history["items"][0]["is_current"] is False


def test_rereview_after_rerun_preserves_history_and_marks_current():
    inv_id = prepare_completed()
    client.post(f"{INV_URL}/{inv_id}/review", json=review_body("approved", version=1))
    rerun = client.post(f"{INV_URL}/{inv_id}/run")
    assert rerun.json()["report_version"] == 2

    second = client.post(f"{INV_URL}/{inv_id}/review", json=review_body("rejected", version=2))
    assert second.status_code == 200, second.text
    assert second.json()["status"] == "rejected"
    assert second.json()["review_status"] == "rejected"

    history = client.get(f"{INV_URL}/{inv_id}/reviews").json()
    assert history["total"] == 2
    assert history["review_status"] == "rejected"
    newest, older = history["items"][0], history["items"][1]
    assert newest["decision"] == "rejected" and newest["is_current"] is True
    # The prior review is preserved, unchanged, and marked historical.
    assert older["decision"] == "approved"
    assert older["is_current"] is False
    assert older["report_version"] == 1
    assert older["resulting_status"] == "approved"
    assert older["rationale"] == "Reviewed the evidence."


# --- append-only guarantees -------------------------------------------------


def test_review_and_audit_routes_are_append_only():
    from starlette.routing import Route

    for route in app.routes:
        path = getattr(route, "path", "")
        if "review" not in path and "audit" not in path:
            continue
        methods = set(getattr(route, "methods", set()) or set())
        assert methods <= {"GET", "POST"}, (path, methods)


def test_repository_has_no_review_or_audit_mutation_helpers():
    names = [name.lower() for name in dir(repo)]
    forbidden = [
        name
        for name in names
        if name.startswith(("delete", "update", "remove"))
        and ("review" in name or "audit" in name)
    ]
    assert forbidden == []


def test_audit_events_accumulate_without_mutating_prior_rows():
    inv_id = prepare_completed()
    client.post(f"{INV_URL}/{inv_id}/review", json=review_body("approved", version=1))
    client.post(f"{INV_URL}/{inv_id}/run")
    client.post(f"{INV_URL}/{inv_id}/review", json=review_body("rejected", version=2))

    db = SessionLocal()
    try:
        events = (
            db.query(AuditEvent)
            .filter_by(entity_id=inv_id, action="review_decision")
            .all()
        )
        assert len(events) == 2
        decisions = sorted(json.loads(e.details_json)["decision"] for e in events)
        assert decisions == ["approved", "rejected"]
    finally:
        db.close()


# --- atomicity / no financial side effects ----------------------------------


def test_review_rolls_back_atomically_on_failure(monkeypatch):
    inv_id = prepare_completed()

    db = SessionLocal()
    try:
        investigation = repo.get_investigation(db, ORG, inv_id)

        def boom(**kwargs):
            raise RuntimeError("audit insert failed")

        monkeypatch.setattr(
            "app.repositories.investigation_repository.AuditEvent", boom
        )
        with pytest.raises(RuntimeError):
            review_service.submit_review(
                db,
                organization_id=ORG,
                investigation=investigation,
                decision="approved",
                rationale="ok",
                reviewer_id="demo-user",
                expected_report_version=investigation.report_version,
            )
    finally:
        db.close()

    db = SessionLocal()
    try:
        reloaded = repo.get_investigation(db, ORG, inv_id)
        assert reloaded.status == "completed"
        assert reloaded.report_version == 1
        assert db.query(InvestigationReview).count() == 0
        assert db.query(AuditEvent).filter_by(action="review_decision").count() == 0
    finally:
        db.close()


def _financial_snapshot():
    db = SessionLocal()
    try:
        invoices = sorted(
            (i.id, str(i.total_amount), i.currency) for i in db.query(Invoice).all()
        )
        txns = sorted(
            (t.id, str(t.amount), t.currency)
            for t in db.query(BankTransaction).all()
        )
        matches = sorted(
            (m.id, m.match_status, str(m.difference_amount), m.transaction_id)
            for m in db.query(ReconciliationMatch).all()
        )
    finally:
        db.close()
    return invoices, txns, matches


def test_review_does_not_change_financial_records():
    inv_id = prepare_completed()
    before = _financial_snapshot()

    resp = client.post(f"{INV_URL}/{inv_id}/review", json=review_body("approved"))
    assert resp.status_code == 200

    assert _financial_snapshot() == before
