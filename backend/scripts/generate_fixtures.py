
"""Generate a deterministic synthetic financial corpus for RAG evaluation."""

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = REPO_ROOT / "data" / "synthetic"

DOCUMENTS = {
    "invoice_acme_2026_0001.pdf": [
        [
            "ACME SUPPLIES PRIVATE LIMITED",
            "Tax Invoice",
            "Invoice No: INV-2026-0001",
            "Invoice Date: 05/01/2026",
            "Due Date: 05/02/2026",
            "Vendor: Acme Supplies",
            "Buyer: Northwind Traders",
            "Consulting services 10 units 12,000.00",
            "Total: 12,000.00",
            "Currency: INR",
            "Payment terms: Net 30",
        ],
        [
            "ACME SUPPLIES - SERVICE DETAILS",
            "Invoice reference: INV-2026-0001",
            "Service category: Business consulting",
            "Quantity supplied: 10 units",
            "Unit price: 1,200.00 INR",
            "Service period: January 2026",
            "Service status: Completed",
            "Billing frequency: One-time",
            "All amounts are stated in Indian Rupees.",
        ],
        [
            "ACME SUPPLIES - BILLING NOTES",
            "Invoice reference: INV-2026-0001",
            "Customer account: Northwind Traders",
            "Billing department: Professional Services",
            "Payment method: Bank transfer",
            "Invoice status at issue: Unpaid",
            "Remittance reference should include invoice number.",
            "This page contains synthetic demonstration information.",
        ],
    ],
    "vendor_policy_acme.pdf": [
        [
            "ACME SUPPLIES PRIVATE LIMITED",
            "Vendor Payment Policy",
            "Applies to invoice INV-2026-0001.",
            "A 300.00 early payment discount applies when the buyer",
            "settles in full within the agreed early-settlement window.",
            "The discounted payment may close the invoice.",
        ],
        [
            "ACME SUPPLIES - PAYMENT PROCEDURE",
            "Payments must reference the applicable invoice number.",
            "Accepted payment method: Bank transfer.",
            "Payment confirmation is recorded against the vendor account.",
            "Partial payments do not qualify for the early settlement discount.",
            "The buyer should retain the payment confirmation.",
        ],
        [
            "ACME SUPPLIES - POLICY ADMINISTRATION",
            "Policy category: Vendor settlement",
            "Policy reference: ACME-PAY-2026",
            "Policy review date: 01/01/2026",
            "Currency: INR",
            "The finance team records approved discounts separately.",
            "This synthetic policy is for retrieval evaluation only.",
        ],
    ],
    "invoice_northwind_0002.pdf": [
        [
            "NORTHWIND OFFICE SOLUTIONS",
            "Tax Invoice",
            "Invoice No: INV-2026-0002",
            "Invoice Date: 10/01/2026",
            "Vendor: Northwind Office Solutions",
            "Buyer: Acme Supplies",
            "Office chairs 5 units 25,000.00",
            "Total: 25,000.00",
            "Currency: INR",
            "Payment terms: Net 15",
        ],
        [
            "NORTHWIND OFFICE SOLUTIONS - ORDER DETAILS",
            "Invoice reference: INV-2026-0002",
            "Product: Ergonomic office chair",
            "Quantity: 5 units",
            "Unit price: 5,000.00 INR",
            "Delivery status: Completed",
            "Order category: Office furniture",
            "Billing month: January 2026",
        ],
        [
            "NORTHWIND OFFICE SOLUTIONS - BILLING NOTES",
            "Customer: Acme Supplies",
            "Invoice reference: INV-2026-0002",
            "Payment terms: Net 15",
            "Payment channel: Bank transfer",
            "Invoice currency: INR",
            "Purchase category: Office equipment",
            "This is synthetic demonstration data.",
        ],
    ],
    "vendor_policy_prime.pdf": [
        [
            "PRIME PROPERTIES",
            "Vendor Payment Policy",
            "Rent invoices are payable within 7 calendar days.",
            "Late rent payments may incur a 2 percent fee.",
        ],
        [
            "PRIME PROPERTIES - RENTAL PROCEDURE",
            "Vendor category: Commercial property",
            "Payment frequency: Monthly",
            "Accepted payment method: Bank transfer",
            "Rent payment reference should identify the rental month.",
            "The finance team records each monthly settlement.",
        ],
        [
            "PRIME PROPERTIES - POLICY DETAILS",
            "Policy reference: PRIME-RENT-2026",
            "Policy review date: 01/01/2026",
            "Late payment fee: 2 percent",
            "Payment deadline: 7 calendar days",
            "Currency used for rent records: INR",
            "This policy contains synthetic demonstration information.",
        ],
    ],
    "bank_statement_january.pdf": [
        [
            "SYNTHETIC BANK STATEMENT",
            "Account: Northwind Traders",
            "Transaction TXN-2026-0001",
            "Date: 2026-01-06",
            "Description: Payment for INV-2026-0001",
            "Amount: 11,700.00 INR",
            "Transaction TXN-2026-0002",
            "Date: 2026-01-15",
            "Description: Office rent January",
            "Amount: 25,000.00 INR",
        ],
        [
            "NORTHWIND TRADERS - STATEMENT SUMMARY",
            "Statement month: January 2026",
            "Account type: Business current account",
            "Currency: INR",
            "Transaction count on this page: 2",
            "Reference TXN-2026-0001 relates to invoice settlement.",
            "Reference TXN-2026-0002 relates to office rent.",
        ],
        [
            "NORTHWIND TRADERS - TRANSACTION NOTES",
            "Statement period: January 2026",
            "Transaction channel: Electronic transfer",
            "Reconciliation status: Demonstration dataset",
            "The invoice settlement is linked to INV-2026-0001.",
            "The rent transaction is linked to Prime Properties.",
            "No December 2025 electricity transaction is listed.",
        ],
    ],
    "expense_report_q1.pdf": [
        [
            "NORTHWIND TRADERS",
            "Quarterly Expense Report",
            "Travel expenses: 8,400.00 INR",
            "Office supplies: 3,200.00 INR",
            "Software subscriptions: 6,500.00 INR",
        ],
        [
            "NORTHWIND TRADERS - EXPENSE BREAKDOWN",
            "Reporting period: Q1 2026",
            "Expense category: Travel",
            "Travel expenses: 8,400.00 INR",
            "Expense category: Office supplies",
            "Office supplies: 3,200.00 INR",
            "Expense category: Software",
            "Software subscriptions: 6,500.00 INR",
        ],
        [
            "NORTHWIND TRADERS - EXPENSE NOTES",
            "Report reference: EXP-Q1-2026",
            "Reporting currency: INR",
            "Travel expenses relate to business trips.",
            "Office supplies relate to administrative purchases.",
            "Software subscriptions relate to business applications.",
            "This is synthetic quarterly expense data.",
        ],
    ],
    "loan_agreement_demo.pdf": [
        [
            "SYNTHETIC LOAN AGREEMENT",
            "Loan reference: LN-2026-0042",
            "Principal: 500,000.00 INR",
            "Annual interest rate: 9.5 percent",
            "Repayment term: 24 months",
        ],
        [
            "LOAN AGREEMENT - REPAYMENT DETAILS",
            "Loan reference: LN-2026-0042",
            "Principal amount: 500,000.00 INR",
            "Annual interest rate: 9.5 percent",
            "Repayment duration: 24 months",
            "Currency: INR",
            "Repayment frequency: Monthly",
        ],
        [
            "LOAN AGREEMENT - ACCOUNT NOTES",
            "Loan reference: LN-2026-0042",
            "Account category: Demonstration business loan",
            "Agreement status: Synthetic sample",
            "The agreement records principal and interest terms.",
            "No prepayment penalty amount is specified in this sample.",
        ],
    ],
    "payroll_summary_demo.pdf": [
        [
            "SYNTHETIC PAYROLL SUMMARY",
            "January 2026",
            "Employees: 12",
            "Gross payroll: 480,000.00 INR",
            "Payroll date: 2026-01-31",
        ],
        [
            "PAYROLL SUMMARY - COMPENSATION",
            "Payroll month: January 2026",
            "Employee count: 12",
            "Gross payroll: 480,000.00 INR",
            "Currency: INR",
            "Payroll category: Monthly compensation",
        ],
        [
            "PAYROLL SUMMARY - PROCESSING NOTES",
            "Payroll reference: PAY-JAN-2026",
            "Processing date: 2026-01-31",
            "Payroll status: Synthetic demonstration record",
            "The gross payroll value is recorded before deductions.",
            "This sample contains no individual employee records.",
        ],
    ],
}


def write_pdf(path: Path, pages: list[list[str]]) -> None:
    import fitz

    doc = fitz.open()

    for lines in pages:
        page = doc.new_page(width=595, height=842)
        page.insert_textbox(
            fitz.Rect(56, 56, 539, 786),
            "\n".join(lines),
            fontsize=11,
            fontname="helv",
        )

    doc.save(str(path))
    doc.close()


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    for name, pages in DOCUMENTS.items():
        write_pdf(OUT_DIR / name, pages)
        print(f"Wrote {name} ({len(pages)} pages)")

    csv_path = OUT_DIR / "bank_statement_2026_01.csv"
    csv_path.write_text(
        "transaction_reference,transaction_date,description,amount,currency,counterparty\n"
        "INV-2026-0001,2026-01-06,Payment for INV-2026-0001 early settlement,11700.00,INR,Acme Supplies\n"
        "TXN-2026-0002,2026-01-15,Office rent January,25000.00,INR,Prime Properties\n"
        "TXN-2026-0003,2026-01-20,Card settlement,4820.50,INR,Card Network\n",
        encoding="utf-8",
    )
    print(f"Wrote {csv_path.name}")


if __name__ == "__main__":
    main()
