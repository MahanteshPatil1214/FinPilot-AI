import uuid
from datetime import date
from decimal import Decimal
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.db.init_db import init_db
from app.db.session import SessionLocal
from app.models.invoice import Invoice
from app.models.reconciliation_match import ReconciliationMatch
from app.models.transaction import BankTransaction
from app.services import reconciliation_service as service
from app.services.reconciliation_service import build_matches

client = TestClient(app)

ORG = "org_1"
RUN_URL = "/api/v1/reconciliation/run"
RESULTS_URL = "/api/v1/reconciliation/results"


@pytest.fixture(autouse=True)
def _clean_tables():
    init_db()
    db = SessionLocal()
    try:
        db.query(ReconciliationMatch).delete()
        db.query(Invoice).delete()
        db.query(BankTransaction).delete()
        db.commit()
    finally:
        db.close()
    yield


def make_invoice(number=None, amount=None, currency="INR", invoice_date=None,
                 due_date=None, org=ORG):
    return dict(
        id=str(uuid.uuid4()),
        organization_id=org,
        invoice_number=number,
        total_amount=Decimal(amount) if amount is not None else None,
        currency=currency,
        invoice_date=invoice_date,
        due_date=due_date,
        extraction_status="completed",
    )


def make_txn(reference=None, amount=None, currency="INR", date_=None,
             description="", counterparty=None, org=ORG):
    return dict(
        id=str(uuid.uuid4()),
        organization_id=org,
        transaction_reference=reference,
        amount=Decimal(amount) if amount is not None else None,
        currency=currency,
        transaction_date=date_,
        description=description,
        counterparty=counterparty,
    )


def seed(invoices=(), transactions=()):
    db = SessionLocal()
    try:
        for row in invoices:
            db.add(Invoice(**row))
        for row in transactions:
            db.add(BankTransaction(**row))
        db.commit()
    finally:
        db.close()


def run(window=None):
    body = {} if window is None else {"date_window_days": window}
    return client.post(RUN_URL, json=body)


def get_results(status=None, skip=0, limit=100):
    params = {"skip": skip, "limit": limit}
    if status is not None:
        params["status"] = status
    return client.get(RESULTS_URL, params=params)


def ns(**kw):
    base = dict(
        id=str(uuid.uuid4()),
        invoice_number=None,
        total_amount=None,
        currency="INR",
        invoice_date=None,
        due_date=None,
        transaction_reference=None,
        amount=None,
        transaction_date=None,
        description="",
    )
    base.update(kw)
    return SimpleNamespace(**base)


# --------------------------------------------------------------- unit tests


def test_unit_exact_reference_match():
    inv = ns(invoice_number="INV-1", total_amount=Decimal("100.00"))
    txn = ns(transaction_reference="INV-1", amount=Decimal("100.00"))
    results = build_matches([inv], [txn], 30)
    assert len(results) == 1
    row = results[0]
    assert row["match_status"] == service.STATUS_EXACT_MATCH
    assert row["matching_method"] == service.METHOD_REFERENCE_EXACT
    assert row["difference_amount"] == Decimal("0.00")
    assert row["invoice_id"] == inv.id and row["transaction_id"] == txn.id


def test_unit_partial_match_difference_is_decimal():
    inv = ns(invoice_number="INV-104", total_amount=Decimal("12000.00"))
    txn = ns(transaction_reference="INV-104", amount=Decimal("11700.00"))
    row = build_matches([inv], [txn], 30)[0]
    assert row["match_status"] == service.STATUS_PARTIAL_MATCH
    assert row["difference_amount"] == Decimal("300.00")
    assert isinstance(row["difference_amount"], Decimal)


def test_unit_token_in_description():
    inv = ns(invoice_number="INV-104", total_amount=Decimal("50.00"))
    txn = ns(
        transaction_reference="TXN-9",
        description="NEFT PAYMENT FOR INV-104 THANK YOU",
        amount=Decimal("50.00"),
    )
    row = build_matches([inv], [txn], 30)[0]
    assert row["matching_method"] == service.METHOD_REFERENCE_IN_DESCRIPTION
    assert row["match_status"] == service.STATUS_EXACT_MATCH


def test_unit_token_requires_word_boundary():
    inv = ns(invoice_number="INV-104", total_amount=Decimal("50.00"))
    txn = ns(
        transaction_reference="TXN-9",
        description="PAYMENT REFERENCE XINV-1049 NOT A MATCH",
        amount=Decimal("50.00"),
    )
    row = build_matches([inv], [txn], 30)[0]
    # Not reference-linked; amounts are equal but currency-dated unknown -> possible.
    assert row["matching_method"] != service.METHOD_REFERENCE_IN_DESCRIPTION


def test_unit_no_amount_match_across_currencies():
    inv = ns(invoice_number=None, total_amount=Decimal("1000.00"), currency="INR")
    txn = ns(transaction_reference=None, amount=Decimal("1000.00"), currency="USD")
    results = build_matches([inv], [txn], 30)
    assert {r["match_status"] for r in results} == {service.STATUS_UNMATCHED}
    assert all(r["invoice_id"] is None or r["transaction_id"] is None for r in results)


def test_unit_ambiguous_transaction_never_linked():
    inv = ns(invoice_number=None, total_amount=Decimal("500.00"), currency="INR")
    t1 = ns(transaction_reference="T-1", amount=Decimal("500.00"), currency="INR")
    t2 = ns(transaction_reference="T-2", amount=Decimal("500.00"), currency="INR")
    results = build_matches([inv], [t1, t2], 30)
    assert all(r["match_status"] == service.STATUS_NEEDS_REVIEW for r in results)
    assert all(not (r["invoice_id"] and r["transaction_id"]) for r in results)
    assert len(results) == 3


def test_unit_missing_amount_is_unmatched():
    inv = ns(invoice_number="INV-9", total_amount=None)
    results = build_matches([inv], [], 30)
    assert results[0]["match_status"] == service.STATUS_UNMATCHED
    assert "total_amount" in results[0]["explanation"]


def test_unit_large_decimal_difference_exact():
    inv = ns(invoice_number="INV-BIG", total_amount=Decimal("12345678901234567.89"))
    txn = ns(
        transaction_reference="INV-BIG",
        amount=Decimal("12345678901234567.00"),
    )
    row = build_matches([inv], [txn], 30)[0]
    assert row["difference_amount"] == Decimal("0.89")


def test_unit_summarize_includes_all_statuses():
    counts = service.summarize([])
    assert set(counts) == set(service.ALL_STATUSES)
    assert all(value == 0 for value in counts.values())


# ---------------------------------------------------------------- API tests


def test_run_exact_amount_match_within_window():
    seed(
        invoices=[make_invoice("INV-1", "1000.00", invoice_date=date(2026, 10, 1))],
        transactions=[make_txn("TXN-1", "1000.00", date_=date(2026, 10, 10),
                               description="PAYMENT")],
    )
    resp = run()
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total_matches"] == 1
    assert body["counts"]["exact_match"] == 1
    assert body["date_window_days"] == 30

    data = get_results().json()
    assert data["total"] == 1
    item = data["items"][0]
    assert item["invoice_id"] and item["transaction_id"]
    assert item["matching_method"] == service.METHOD_AMOUNT_WINDOW
    assert Decimal(str(item["difference_amount"])) == Decimal("0.00")


def test_run_amount_outside_window_is_possible_match():
    seed(
        invoices=[make_invoice("INV-2", "250.00", invoice_date=date(2026, 1, 1))],
        transactions=[make_txn("TXN-2", "250.00", date_=date(2026, 10, 10))],
    )
    body = run().json()
    assert body["counts"]["possible_match"] == 1
    item = get_results(status="possible_match").json()["items"][0]
    assert item["matching_method"] == service.METHOD_AMOUNT_OUTSIDE_WINDOW


def test_run_reference_partial_match_difference():
    seed(
        invoices=[make_invoice("INV-104", "12000.00")],
        transactions=[make_txn("INV-104", "11700.00", description="PART PAYMENT")],
    )
    body = run().json()
    assert body["counts"]["partial_match"] == 1
    item = get_results(status="partial_match").json()["items"][0]
    assert item["matching_method"] == service.METHOD_REFERENCE_EXACT
    assert Decimal(str(item["difference_amount"])) == Decimal("300.00")


def test_run_unmatched_invoice_and_transaction():
    seed(
        invoices=[make_invoice("INV-3", "111.00")],
        transactions=[make_txn("TXN-3", "222.00")],
    )
    body = run().json()
    assert body["counts"]["unmatched"] == 2
    assert get_results(status="unmatched").json()["total"] == 2


def test_run_ambiguous_one_invoice_two_transactions():
    seed(
        invoices=[make_invoice("INV-4", "500.00")],
        transactions=[make_txn("TXN-4A", "500.00"), make_txn("TXN-4B", "500.00")],
    )
    body = run().json()
    assert body["counts"]["needs_review"] == 3
    data = get_results().json()
    assert all(not (i["invoice_id"] and i["transaction_id"]) for i in data["items"])


def test_run_one_transaction_two_invoices_no_double_link():
    seed(
        invoices=[make_invoice("INV-5A", "500.00"), make_invoice("INV-5B", "500.00")],
        transactions=[make_txn("TXN-5", "500.00")],
    )
    body = run().json()
    assert body["counts"]["needs_review"] == 3
    # The single transaction must not be linked to either invoice.
    linked = [
        i for i in get_results().json()["items"]
        if i["invoice_id"] and i["transaction_id"]
    ]
    assert linked == []


def test_run_duplicate_transaction_reference_is_duplicate_candidate():
    seed(
        invoices=[make_invoice("REF-100", "75.00")],
        transactions=[
            make_txn("REF-100", "75.00", description="A"),
            make_txn("REF-100", "75.00", description="B"),
        ],
    )
    body = run().json()
    assert body["counts"]["duplicate_candidate"] == 3
    assert get_results(status="duplicate_candidate").json()["total"] == 3


def test_run_duplicate_invoice_number_is_duplicate_candidate():
    seed(
        invoices=[make_invoice("DUP-9", "80.00"), make_invoice("DUP-9", "80.00")],
        transactions=[make_txn("DUP-9", "80.00")],
    )
    body = run().json()
    assert body["counts"]["duplicate_candidate"] == 3


def test_run_missing_currency_not_amount_matched():
    seed(
        invoices=[make_invoice("INV-6", "999.00", currency=None)],
        transactions=[make_txn("TXN-6", "999.00", currency="INR")],
    )
    body = run().json()
    assert body["counts"]["unmatched"] == 2
    invoice_rows = [
        i for i in get_results(status="unmatched").json()["items"] if i["invoice_id"]
    ]
    assert "currency" in invoice_rows[0]["explanation"]


def test_run_missing_transaction_amount_is_unmatched():
    seed(
        invoices=[make_invoice("INV-7", "100.00")],
        transactions=[make_txn("TXN-7", None)],
    )
    body = run().json()
    assert body["counts"]["unmatched"] == 2


def test_run_empty_dataset():
    resp = run()
    assert resp.status_code == 200
    body = resp.json()
    assert body["total_matches"] == 0
    assert all(value == 0 for value in body["counts"].values())
    data = get_results().json()
    assert data["total"] == 0
    assert set(data["counts"]) == set(service.ALL_STATUSES)


def test_results_filter_pagination_and_validation():
    seed(transactions=[make_txn("TXN-P1", "10.00"), make_txn("TXN-P2", "20.00")])
    run()
    page = get_results(status="unmatched", skip=0, limit=1).json()
    assert page["total"] == 2
    assert len(page["items"]) == 1
    assert get_results(status="unmatched", skip=1, limit=1).json()["items"][0]
    assert get_results(status="not_a_status").status_code == 422
    assert client.get(RESULTS_URL, params={"limit": 0}).status_code == 422


def test_get_result_detail_and_404():
    seed(transactions=[make_txn("TXN-D", "30.00")])
    run()
    item = get_results().json()["items"][0]
    detail = client.get(f"{RESULTS_URL}/{item['id']}")
    assert detail.status_code == 200
    assert detail.json()["id"] == item["id"]
    assert client.get(f"{RESULTS_URL}/does-not-exist").status_code == 404


def test_run_is_idempotent():
    seed(
        invoices=[make_invoice("INV-8", "1000.00", invoice_date=date(2026, 10, 1))],
        transactions=[make_txn("TXN-8", "1000.00", date_=date(2026, 10, 5))],
    )
    first = run().json()
    first_rows = sorted(
        (r["invoice_id"], r["transaction_id"], r["match_status"], r["matching_method"])
        for r in get_results().json()["items"]
    )
    second = run().json()
    second_rows = sorted(
        (r["invoice_id"], r["transaction_id"], r["match_status"], r["matching_method"])
        for r in get_results().json()["items"]
    )
    assert first["counts"] == second["counts"]
    assert first["total_matches"] == second["total_matches"]
    assert first_rows == second_rows


def test_failed_run_preserves_previous_results():
    from app.repositories import reconciliation_repository as repo

    seed(transactions=[make_txn("TXN-K", "40.00")])
    run()
    before = get_results().json()["total"]
    assert before >= 1

    # Two rows sharing a transaction_id violate the unique constraint and force
    # the atomic replace to fail mid-transaction.
    bad_rows = [
        {"invoice_id": None, "transaction_id": "txn-x", "match_status": "unmatched",
         "matching_method": "none", "difference_amount": None, "explanation": "a"},
        {"invoice_id": None, "transaction_id": "txn-x", "match_status": "unmatched",
         "matching_method": "none", "difference_amount": None, "explanation": "b"},
    ]
    db = SessionLocal()
    try:
        with pytest.raises(Exception):
            repo.replace_matches_for_org(db, ORG, bad_rows)
    finally:
        db.close()

    assert get_results().json()["total"] == before


def test_unique_constraint_prevents_double_link():
    db = SessionLocal()
    try:
        db.add(ReconciliationMatch(id=str(uuid.uuid4()), organization_id=ORG,
                                   invoice_id="i1", transaction_id="t1",
                                   match_status="exact_match", matching_method="none"))
        db.commit()
        db.add(ReconciliationMatch(id=str(uuid.uuid4()), organization_id=ORG,
                                   invoice_id="i2", transaction_id="t1",
                                   match_status="exact_match", matching_method="none"))
        with pytest.raises(Exception):
            db.commit()
    finally:
        db.rollback()
        db.close()


def test_organization_scoping():
    # Data + a persisted match belonging to a different organization.
    seed(
        invoices=[make_invoice("INV-Z", "100.00", org="org_2")],
        transactions=[make_txn("TXN-Z", "100.00", org="org_2")],
    )
    db = SessionLocal()
    try:
        db.add(ReconciliationMatch(id=str(uuid.uuid4()), organization_id="org_2",
                                   invoice_id=None, transaction_id="txn-other",
                                   match_status="unmatched", matching_method="none"))
        db.commit()
    finally:
        db.close()

    body = run().json()
    assert body["total_matches"] == 0  # org_1 has no data
    assert get_results().json()["total"] == 0

    # The org_2 match is untouched and not visible to org_1.
    db = SessionLocal()
    try:
        remaining = db.query(ReconciliationMatch).filter(
            ReconciliationMatch.organization_id == "org_2"
        ).count()
    finally:
        db.close()
    assert remaining == 1


def test_invalid_date_window_rejected():
    assert client.post(RUN_URL, json={"date_window_days": -1}).status_code == 422


def test_custom_date_window_override():
    # 100 days apart: outside default (30) but inside an explicit 200-day window.
    seed(
        invoices=[make_invoice("INV-W", "300.00", invoice_date=date(2026, 1, 1))],
        transactions=[make_txn("TXN-W", "300.00", date_=date(2026, 4, 20))],
    )
    default = run().json()
    assert default["counts"]["possible_match"] == 1
    override = run(window=200).json()
    assert override["date_window_days"] == 200
    assert override["counts"]["exact_match"] == 1
