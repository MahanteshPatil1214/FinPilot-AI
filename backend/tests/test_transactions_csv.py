import io
import logging
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.db.init_db import init_db
from app.db.session import SessionLocal
from app.models.transaction import BankTransaction

client = TestClient(app)

HEADER = "transaction_reference,transaction_date,description,amount,currency,counterparty\n"


@pytest.fixture(autouse=True)
def _clean_transactions():
    init_db()
    db = SessionLocal()
    try:
        db.query(BankTransaction).delete()
        db.commit()
    finally:
        db.close()
    yield


def _post_csv(content: bytes, filename: str = "bank_transactions.csv"):
    files = {"file": (filename, io.BytesIO(content), "text/csv")}
    return client.post("/api/v1/transactions/import", files=files)


def test_valid_csv_import():
    content = (
        HEADER
        + "TXN-001,2026-10-01,NORTHSTAR OFFICE SUPPLIES,11700.00,INR,Northstar\n"
        + "TXN-002,2026-10-02,CLIENT PAYMENT,-5000.50,INR,Acme\n"
    ).encode()
    resp = _post_csv(content)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_rows"] == 2
    assert data["imported"] == 2
    assert data["duplicates"] == 0
    assert "batch_id" in data


def test_valid_import_is_persisted():
    content = (
        HEADER + "TXN-100,2026-10-05,CLOUD SUBSCRIPTION,999.99,INR,Vendor\n"
    ).encode()
    resp = _post_csv(content)
    assert resp.status_code == 200

    listed = client.get("/api/v1/transactions").json()
    refs = {row["transaction_reference"]: row for row in listed}
    assert "TXN-100" in refs
    assert refs["TXN-100"]["description"] == "CLOUD SUBSCRIPTION"
    assert float(refs["TXN-100"]["amount"]) == 999.99


def test_invalid_amount_rejected():
    content = (
        HEADER + "TXN-200,2026-10-05,OFFICE CHAIRS,NOT_A_NUMBER,INR,Vendor\n"
    ).encode()
    resp = _post_csv(content)
    assert resp.status_code == 422
    detail = resp.json()["detail"]
    assert detail["message"] == "CSV contains invalid rows"
    assert any(2 == e["row"] for e in detail["errors"])
    assert any("amount" in " ".join(e["errors"]) for e in detail["errors"])
    assert client.get("/api/v1/transactions").json() == []


def test_over_precise_amount_rejected():
    content = (
        HEADER + "TXN-201,2026-10-05,COFFEE,10.999,INR,Cafe\n"
    ).encode()
    resp = _post_csv(content)
    assert resp.status_code == 422
    assert client.get("/api/v1/transactions").json() == []


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("1.230", "1.23"),
        ("1.200", "1.20"),
        ("100.00", "100.00"),
        ("5.0", "5.00"),
        ("0.10", "0.10"),
        ("1000000", "1000000.00"),
    ],
)
def test_trailing_zero_amounts_accepted(raw, expected):
    content = (
        HEADER + f"TXN-TZ-{raw.replace('.', '_')},2026-10-05,TRAILING ZEROS,{raw},INR,Vendor\n"
    ).encode()
    resp = _post_csv(content)
    assert resp.status_code == 200, resp.json()
    assert resp.json()["imported"] == 1

    listed = client.get("/api/v1/transactions").json()
    row = next(r for r in listed if r["transaction_reference"].startswith("TXN-TZ-"))
    assert Decimal(str(row["amount"])) == Decimal(expected)


def test_parse_amount_accepts_trailing_zeros_rejects_true_over_precision():
    from app.services.csv_importer import parse_amount

    assert parse_amount("1.230") == Decimal("1.23")
    assert parse_amount("1.2000") == Decimal("1.20")
    assert parse_amount("10.00") == Decimal("10.00")

    with pytest.raises(ValueError):
        parse_amount("1.234")
    with pytest.raises(ValueError):
        parse_amount("10.999")
    with pytest.raises(ValueError):
        parse_amount("0.001")


def test_invalid_date_rejected():
    content = (
        HEADER + "TXN-202,31-13-2026,BAD DATE,100.00,INR,Vendor\n"
    ).encode()
    resp = _post_csv(content)
    assert resp.status_code == 422
    detail = resp.json()["detail"]
    assert any("transaction_date" in " ".join(e["errors"]) for e in detail["errors"])


def test_missing_required_column():
    content = "transaction_reference,description,amount\nTXN-1,FOO,100\n".encode()
    resp = _post_csv(content)
    assert resp.status_code == 422
    assert "Missing required column" in resp.json()["detail"]["message"]


def test_empty_file():
    resp = _post_csv(b"")
    assert resp.status_code == 422


def test_header_only_file():
    resp = _post_csv(HEADER.encode())
    assert resp.status_code == 422


def test_duplicate_within_file_is_skipped():
    content = (
        HEADER
        + "TXN-300,2026-10-01,DUP PAYMENT,100.00,INR,Vendor\n"
        + "TXN-300,2026-10-01,DUP PAYMENT,100.00,INR,Vendor\n"
    ).encode()
    resp = _post_csv(content)
    assert resp.status_code == 200
    data = resp.json()
    assert data["imported"] == 1
    assert data["duplicates"] == 1
    assert len(client.get("/api/v1/transactions").json()) == 1


def test_duplicate_against_existing_records():
    content = (
        HEADER + "TXN-400,2026-10-01,RECURRING,250.00,INR,Vendor\n"
    ).encode()
    assert _post_csv(content).status_code == 200

    resp = _post_csv(content)
    assert resp.status_code == 200
    data = resp.json()
    assert data["imported"] == 0
    assert data["duplicates"] == 1
    assert len(client.get("/api/v1/transactions").json()) == 1


def test_non_csv_extension_rejected():
    resp = _post_csv(b"whatever", filename="data.txt")
    assert resp.status_code == 400


def test_db_failure_does_not_log_row_contents(monkeypatch, caplog):
    import app.api.routes.transactions as routes

    secret = "SUPERSECRETTRANSACTIONDATA123"

    def boom(*args, **kwargs):
        raise RuntimeError(secret)

    monkeypatch.setattr(routes, "create_transactions", boom)
    content = (HEADER + f"TXN-LOG,2026-10-01,{secret},123.45,INR,CP\n").encode()

    with caplog.at_level(logging.DEBUG):
        resp = _post_csv(content)

    assert resp.status_code == 500
    assert secret not in caplog.text


def test_malformed_csv_rejected():
    content = b'transaction_reference,transaction_date,description,amount\n"TXN-1,2026-10-01,unterminated,100\n'
    resp = _post_csv(content)
    assert resp.status_code == 422
