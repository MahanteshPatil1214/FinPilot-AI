from fastapi.testclient import TestClient
from app.main import app
from app.db.init_db import init_db
import io

client = TestClient(app)


def test_transactions_import():
    init_db()
    content = b"transaction_reference,transaction_date,description,amount,currency,counterparty\nTXN-778,2026-10-15,NORTHSTAR OFFICE SUPPLIES,11700.00,INR,Northstar"
    files = {"file": ("bank_transactions.csv", io.BytesIO(content), "text/csv")}
    resp = client.post("/api/v1/transactions/import", files=files)
    assert resp.status_code == 200
    data = resp.json()
    assert data["imported"] >= 1
    assert "batch_id" in data
