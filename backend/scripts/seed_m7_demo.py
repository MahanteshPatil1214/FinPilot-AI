import os
import uuid
from datetime import date
from decimal import Decimal

os.environ["DATABASE_URL"] = "sqlite:///./m7_demo.db"

from app.db.init_db import init_db  # noqa: E402
from app.db.session import SessionLocal  # noqa: E402
from app.models.invoice import Invoice  # noqa: E402
from app.models.transaction import BankTransaction  # noqa: E402

init_db()
db = SessionLocal()
try:
    for model in (Invoice, BankTransaction):
        db.query(model).delete()
    db.commit()

    invoices = [
        dict(invoice_number="INV-104", total_amount=Decimal("12000.00"),
             invoice_date=date(2026, 10, 1), due_date=date(2026, 10, 30),
             currency="INR"),
        dict(invoice_number="INV-200", total_amount=Decimal("500.00"),
             invoice_date=date(2026, 10, 4), due_date=date(2026, 11, 3),
             currency="INR"),
        dict(invoice_number="INV-305", total_amount=Decimal("2200.00"),
             invoice_date=date(2026, 10, 8), due_date=date(2026, 11, 7),
             currency="INR"),
    ]
    for row in invoices:
        db.add(Invoice(id=str(uuid.uuid4()), organization_id="org_1",
                       extraction_status="completed", **row))

    transactions = [
        dict(transaction_reference="TXN-778",
             description="ACME SUPPLIES INV-104 PAYMENT",
             amount=Decimal("12000.00"), transaction_date=date(2026, 10, 5),
             counterparty="ACME SUPPLIES", currency="INR"),
        dict(transaction_reference="INV-200",
             description="Office chairs partial settlement",
             amount=Decimal("450.00"), transaction_date=date(2026, 10, 6),
             counterparty="NORTHSTAR OFFICE SUPPLIES", currency="INR"),
        dict(transaction_reference="TXN-999",
             description="Unrelated telecom charge",
             amount=Decimal("999.99"), transaction_date=date(2026, 10, 7),
             counterparty="TELCO", currency="INR"),
    ]
    for row in transactions:
        db.add(BankTransaction(id=str(uuid.uuid4()), organization_id="org_1",
                               **row))
    db.commit()
    print("seeded invoices + transactions")
finally:
    db.close()
