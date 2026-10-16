"""Generate the synthetic demo fixtures.

Writes a text-based invoice PDF, a vendor policy PDF and a matching
bank-statement CSV into ``data/synthetic/``. Everything is synthetic: the
company, the bank, the amounts and the references are invented, so no real
financial data is involved.

Run from the backend directory (needs the pinned venv, which has PyMuPDF)::

    python scripts/generate_fixtures.py

The invoice is crafted so the deterministic extractor finds an invoice number, a
total and two dates. The bank statement pays that invoice short by 300.00, and
the vendor policy explains the shortfall as an early-settlement discount. That
combination drives the full demo journey: upload -> reconcile (partial match) ->
index -> investigate -> review. Re-generating overwrites the fixtures with
identical content.
"""

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = REPO_ROOT / "data" / "synthetic"

INVOICE_NUMBER = "INV-2026-0001"
INVOICE_DATE = "05/01/2026"
DUE_DATE = "05/02/2026"
TOTAL = "12,000.00"
PAID = "11700.00"

INVOICE_LINES = [
    "ACME SUPPLIES PRIVATE LIMITED",
    "Tax Invoice",
    "",
    f"Invoice No: {INVOICE_NUMBER}",
    f"Invoice Date: {INVOICE_DATE}",
    f"Due Date: {DUE_DATE}",
    "Vendor: Acme Supplies",
    "Buyer: Northwind Traders",
    "",
    "Consulting services   10 units   12,000.00",
    "",
    f"Total: {TOTAL}",
    "Currency: INR",
    "",
    "Payment terms: Net 30",
    "This is a synthetic document for demonstration only.",
]

POLICY_LINES = [
    "ACME SUPPLIES PRIVATE LIMITED",
    "Vendor Payment Policy",
    "",
    f"Applies to invoice {INVOICE_NUMBER}.",
    "Where the buyer settles in full within the agreed early-settlement",
    "window, the vendor grants a 300.00 early payment discount.",
    "Under this policy a full settlement may therefore be recorded below",
    "the invoiced total while still closing the invoice.",
    "",
    "This is a synthetic document for demonstration only.",
]

CSV_ROWS = [
    "transaction_reference,transaction_date,description,amount,currency,counterparty",
    f"{INVOICE_NUMBER},2026-01-06,Payment for {INVOICE_NUMBER} early settlement,{PAID},INR,Acme Supplies",
    "TXN-2026-0002,2026-01-15,Office rent January,25000.00,INR,Prime Properties",
    "TXN-2026-0003,2026-01-20,Card settlement,4820.50,INR,Card Network",
]


def _write_pdf(path: Path, lines) -> Path:
    import fitz  # PyMuPDF

    doc = fitz.open()
    page = doc.new_page(width=595, height=842)  # A4
    rect = fitz.Rect(56, 56, 539, 786)
    page.insert_textbox(rect, "\n".join(lines), fontsize=12, fontname="helv")
    doc.save(str(path))
    doc.close()
    return path


def write_invoice_pdf() -> Path:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    return _write_pdf(OUT_DIR / "invoice_acme_2026_0001.pdf", INVOICE_LINES)


def write_policy_pdf() -> Path:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    return _write_pdf(OUT_DIR / "vendor_policy_acme.pdf", POLICY_LINES)


def write_bank_statement_csv() -> Path:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUT_DIR / "bank_statement_2026_01.csv"
    path.write_text("\n".join(CSV_ROWS) + "\n", encoding="utf-8")
    return path


def main() -> None:
    for path in (
        write_invoice_pdf(),
        write_policy_pdf(),
        write_bank_statement_csv(),
    ):
        print(f"wrote {path}")


if __name__ == "__main__":
    main()
