import uuid
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.db.init_db import init_db
from app.db.session import SessionLocal
from app.models.audit_event import AuditEvent
from app.models.document import Document
from app.models.document_chunk import DocumentChunk
from app.models.document_page import DocumentPage
from app.models.investigation import Investigation
from app.models.investigation_review import InvestigationReview
from app.models.invoice import Invoice
from app.models.reconciliation_match import ReconciliationMatch
from app.models.transaction import BankTransaction
from app.services import investigation_service, reconciliation_service

client = TestClient(app)

ORG = "org_1"
OTHER_ORG = "org_2"

REVIEW_DECISIONS = ("approved", "rejected", "needs_more_information")


@pytest.fixture(autouse=True)
def _clean():
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


def _seed_invoice(org=ORG):
    db = SessionLocal()
    try:
        invoice = Invoice(
            id=str(uuid.uuid4()),
            organization_id=org,
            invoice_number=f"INV-{uuid.uuid4().hex[:8]}",
            currency="INR",
            total_amount=Decimal("100.00"),
        )
        db.add(invoice)
        db.commit()
        return invoice.id
    finally:
        db.close()


def _seed_transaction(org=ORG):
    db = SessionLocal()
    try:
        txn = BankTransaction(
            id=str(uuid.uuid4()),
            organization_id=org,
            transaction_reference=f"TXN-{uuid.uuid4().hex[:8]}",
            description="seed",
            amount=Decimal("100.00"),
            currency="INR",
        )
        db.add(txn)
        db.commit()
        return txn.id
    finally:
        db.close()


def _seed_document(org=ORG, processing_status="completed", page_count=1):
    db = SessionLocal()
    try:
        doc = Document(
            id=str(uuid.uuid4()),
            organization_id=org,
            original_filename="seed.pdf",
            processing_status=processing_status,
            page_count=page_count,
        )
        db.add(doc)
        db.commit()
        return doc.id
    finally:
        db.close()


def _seed_chunk(document_id, org=ORG, index=0):
    db = SessionLocal()
    try:
        chunk = DocumentChunk(
            id=str(uuid.uuid4()),
            organization_id=org,
            document_id=document_id,
            chunk_index=index,
            page_number=1,
            content="seed chunk content",
            embedding=None,
        )
        db.add(chunk)
        db.commit()
        return chunk.id
    finally:
        db.close()


def _seed_match(org=ORG, status=reconciliation_service.STATUS_UNMATCHED):
    db = SessionLocal()
    try:
        match = ReconciliationMatch(
            id=str(uuid.uuid4()),
            organization_id=org,
            invoice_id=None,
            transaction_id=None,
            match_status=status,
            matching_method=reconciliation_service.METHOD_REFERENCE_EXACT,
        )
        db.add(match)
        db.commit()
        return match.id
    finally:
        db.close()


def _seed_investigation(org=ORG, status=investigation_service.STATUS_PENDING):
    db = SessionLocal()
    try:
        inv = Investigation(
            id=str(uuid.uuid4()),
            organization_id=org,
            status=status,
        )
        db.add(inv)
        db.commit()
        return inv.id
    finally:
        db.close()


def _seed_review(investigation_id, org=ORG, decision="approved"):
    db = SessionLocal()
    try:
        review = InvestigationReview(
            id=str(uuid.uuid4()),
            investigation_id=investigation_id,
            organization_id=org,
            reviewer_id="demo-user",
            decision=decision,
            rationale="seed rationale",
            previous_status="completed",
            resulting_status=decision,
            report_version=0,
        )
        db.add(review)
        db.commit()
        return review.id
    finally:
        db.close()


# --------------------------------------------------------------------------- #
# Dashboard summary
# --------------------------------------------------------------------------- #


def test_dashboard_summary_empty_organization():
    resp = client.get("/api/v1/dashboard/summary")
    assert resp.status_code == 200, resp.text
    body = resp.json()

    assert body["organization_id"] == ORG
    assert "generated_at" in body

    assert body["invoices_imported"] == 0
    assert body["transactions_imported"] == 0
    assert body["documents_total"] == 0
    assert body["documents_indexed"] == 0
    assert body["documents_pending_indexing"] == 0
    assert body["investigations_awaiting_review"] == 0

    assert body["reconciliation"]["total"] == 0
    assert set(body["reconciliation"]["counts"]) == set(
        reconciliation_service.ALL_STATUSES
    )
    assert all(v == 0 for v in body["reconciliation"]["counts"].values())

    assert body["investigations"]["total"] == 0
    assert set(body["investigations"]["counts"]) == set(
        investigation_service.ALL_STATUSES
    )
    assert all(v == 0 for v in body["investigations"]["counts"].values())

    assert body["reviews"]["total"] == 0
    assert set(body["reviews"]["counts"]) == set(REVIEW_DECISIONS)
    assert all(v == 0 for v in body["reviews"]["counts"].values())


def test_dashboard_summary_aggregates_and_is_organization_scoped():
    _seed_invoice(ORG)
    _seed_invoice(ORG)
    _seed_invoice(OTHER_ORG)

    _seed_transaction(ORG)
    _seed_transaction(ORG)
    _seed_transaction(ORG)
    _seed_transaction(OTHER_ORG)

    indexed_doc = _seed_document(ORG)
    _seed_chunk(indexed_doc)
    _seed_document(ORG)  # not indexed
    other_doc = _seed_document(OTHER_ORG)
    _seed_chunk(other_doc, org=OTHER_ORG)

    _seed_match(ORG, reconciliation_service.STATUS_EXACT_MATCH)
    _seed_match(ORG, reconciliation_service.STATUS_EXACT_MATCH)
    _seed_match(ORG, reconciliation_service.STATUS_UNMATCHED)
    _seed_match(OTHER_ORG, reconciliation_service.STATUS_EXACT_MATCH)

    _seed_investigation(ORG, investigation_service.STATUS_COMPLETED)
    _seed_investigation(ORG, investigation_service.STATUS_NEEDS_REVIEW)
    inv_approved = _seed_investigation(ORG, investigation_service.STATUS_APPROVED)
    _seed_investigation(OTHER_ORG, investigation_service.STATUS_REJECTED)

    _seed_review(inv_approved, ORG, "approved")
    _seed_review(inv_approved, ORG, "rejected")
    _seed_review(_seed_investigation(OTHER_ORG), OTHER_ORG, "approved")

    resp = client.get("/api/v1/dashboard/summary")
    assert resp.status_code == 200, resp.text
    body = resp.json()

    assert body["invoices_imported"] == 2
    assert body["transactions_imported"] == 3
    assert body["documents_total"] == 2
    assert body["documents_indexed"] == 1
    assert body["documents_pending_indexing"] == 1

    assert body["reconciliation"]["total"] == 3
    assert body["reconciliation"]["counts"][reconciliation_service.STATUS_EXACT_MATCH] == 2
    assert body["reconciliation"]["counts"][reconciliation_service.STATUS_UNMATCHED] == 1
    assert body["reconciliation"]["counts"][reconciliation_service.STATUS_PARTIAL_MATCH] == 0

    assert body["investigations"]["total"] == 3
    assert body["investigations"]["counts"][investigation_service.STATUS_APPROVED] == 1
    assert body["investigations"]["counts"][investigation_service.STATUS_COMPLETED] == 1
    assert body["investigations"]["counts"][investigation_service.STATUS_NEEDS_REVIEW] == 1
    assert body["investigations"]["counts"][investigation_service.STATUS_REJECTED] == 0
    assert body["investigations_awaiting_review"] == 2

    assert body["reviews"]["total"] == 2
    assert body["reviews"]["counts"]["approved"] == 1
    assert body["reviews"]["counts"]["rejected"] == 1
    assert body["reviews"]["counts"]["needs_more_information"] == 0


# --------------------------------------------------------------------------- #
# Documents list + status
# --------------------------------------------------------------------------- #


def test_list_documents_paginates_and_is_organization_scoped():
    ids = [_seed_document(ORG) for _ in range(3)]
    _seed_document(OTHER_ORG)

    resp = client.get("/api/v1/documents")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total"] == 3
    assert body["skip"] == 0
    assert body["limit"] == 100
    assert len(body["items"]) == 3
    returned_ids = {item["id"] for item in body["items"]}
    assert returned_ids == set(ids)

    page = client.get("/api/v1/documents", params={"skip": 1, "limit": 1})
    assert page.status_code == 200, page.text
    page_body = page.json()
    assert page_body["total"] == 3
    assert page_body["skip"] == 1
    assert page_body["limit"] == 1
    assert len(page_body["items"]) == 1


def test_list_documents_rejects_invalid_pagination():
    assert client.get("/api/v1/documents", params={"skip": -1}).status_code == 422
    assert client.get("/api/v1/documents", params={"limit": 0}).status_code == 422
    assert client.get("/api/v1/documents", params={"limit": 501}).status_code == 422


def test_document_status_reflects_indexing():
    doc_id = _seed_document(ORG, processing_status="completed", page_count=2)

    resp = client.get(f"/api/v1/documents/{doc_id}/status")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["document_id"] == doc_id
    assert body["processing_status"] == "completed"
    assert body["indexed"] is False
    assert body["indexing_status"] == "not_indexed"
    assert body["chunk_count"] == 0
    assert body["page_count"] == 2

    _seed_chunk(doc_id)

    resp = client.get(f"/api/v1/documents/{doc_id}/status")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["indexed"] is True
    assert body["indexing_status"] == "indexed"
    assert body["chunk_count"] == 1


def test_document_status_404_for_missing_or_cross_org():
    other_doc = _seed_document(OTHER_ORG)
    assert client.get(f"/api/v1/documents/{other_doc}/status").status_code == 404
    assert client.get("/api/v1/documents/does-not-exist/status").status_code == 404


# --------------------------------------------------------------------------- #
# Transaction + invoice detail
# --------------------------------------------------------------------------- #


def test_get_transaction_detail():
    txn_id = _seed_transaction(ORG)
    resp = client.get(f"/api/v1/transactions/{txn_id}")
    assert resp.status_code == 200, resp.text
    assert resp.json()["id"] == txn_id


def test_get_transaction_404_for_missing_or_cross_org():
    other = _seed_transaction(OTHER_ORG)
    assert client.get(f"/api/v1/transactions/{other}").status_code == 404
    assert client.get("/api/v1/transactions/nope").status_code == 404


def test_get_invoice_detail():
    invoice_id = _seed_invoice(ORG)
    resp = client.get(f"/api/v1/invoices/{invoice_id}")
    assert resp.status_code == 200, resp.text
    assert resp.json()["id"] == invoice_id


def test_get_invoice_404_for_missing_or_cross_org():
    other = _seed_invoice(OTHER_ORG)
    assert client.get(f"/api/v1/invoices/{other}").status_code == 404
    assert client.get("/api/v1/invoices/nope").status_code == 404
