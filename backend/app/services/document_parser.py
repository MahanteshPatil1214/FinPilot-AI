from typing import Tuple, List, Dict, Optional
import hashlib
import uuid
from datetime import datetime, date
from decimal import Decimal, InvalidOperation


def compute_file_hash(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def to_decimal_amount(value: object) -> Optional[Decimal]:
    """Coerce an extracted amount into a Decimal for DB storage.

    Monetary values must reach the database as Decimal (psycopg2 binds Decimal
    exactly). Returns None for missing or non-numeric input so the invoice can
    still be stored as a best-effort partial record.
    """
    if value is None:
        return None
    s = str(value).strip().replace(",", "")
    if not s:
        return None
    try:
        amount = Decimal(s)
    except (InvalidOperation, ValueError):
        return None
    if not amount.is_finite():
        return None
    return amount


def generate_id() -> str:
    return str(uuid.uuid4())


def extract_pdf_text(file_content: bytes) -> Tuple[str, List[Dict]]:
    try:
        import pymupdf as fitz  # type: ignore

        pages_text = []
        text_full = ""
        with fitz.open(stream=file_content, filetype="pdf") as doc:
            for i, page in enumerate(doc):
                try:
                    t = page.get_text("text")
                except Exception:
                    t = ""
                if t:
                    pages_text.append({"page": i + 1, "text": t})
                text_full += t + "\n"
        return text_full.strip(), pages_text
    except Exception as e:
        raise ValueError(f"Failed to extract PDF text: {e}")


def _extract_invoice_number(text: str) -> Optional[str]:
    """Extract an invoice identifier from free text.

    Labelled forms ("Invoice No: INV-2026-0001", "Bill #55") are preferred, then
    a standalone identifier-like token ("ACME SUPPLIES INV-104"). The previous
    implementation grabbed a fixed-width window and split on the last colon,
    which returned the invoice *date* whenever the number and a date label shared
    a line (e.g. "Invoice No: INV-2026-0001\\nInvoice Date: 05/01/2026").
    """
    import re

    patterns = (
        r"(?:invoice|inv|bill)\s*(?:no|number|num|#)\.?\s*[:#]?\s*([A-Za-z0-9][A-Za-z0-9._/-]*)",
        r"\b(INV[-/_][A-Za-z0-9][A-Za-z0-9._/-]*)",
    )
    for pattern in patterns:
        match = re.search(pattern, text, re.I)
        if match:
            value = match.group(1).strip().strip("-_.")
            if value:
                return value
    return None


def extract_invoice_fields(text: str) -> Dict:
    data: Dict = {
        "invoice_number": None,
        "invoice_date": None,
        "due_date": None,
        "currency": "INR",
        "total_amount": None,
        "vendor": None,
        "payment_terms": None,
    }
    import re

    data["invoice_number"] = _extract_invoice_number(text)

    amt = re.search(r"(?:total|amount due|grand total|total due)[^\d]*([0-9][0-9,]*(?:\.[0-9]{1,2})?)", text, re.I)
    if amt:
        data["total_amount"] = amt.group(1).replace(",", "")
    if not amt:
        amt2 = re.search(r"([0-9][0-9,]+\.[0-9]{1,2})", text)
        if amt2:
            data["total_amount"] = amt2.group(1).replace(",", "")
    date_patterns = [r"(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})", r"(\d{4}[-/]\d{1,2}[-/]\d{1,2})"]
    for p in date_patterns:
        m = re.findall(p, text)
        if len(m) >= 1 and not data["invoice_date"]:
            data["invoice_date"] = normalize_date(m[0])
        if len(m) >= 2:
            if not data["due_date"]:
                data["due_date"] = normalize_date(m[1])
    return data


def normalize_date(s: str) -> Optional[date]:
    if not s:
        return None
    s = s.strip()
    for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%Y-%m-%d", "%d/%m/%y", "%d-%m-%y", "%Y/%m/%d"):
        try:
            dt = datetime.strptime(s, fmt)
            return dt.date()
        except Exception:
            pass
    import re

    m = re.match(r"(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})", s)
    if m:
        d, mo, y = m.groups()
        if len(y) == 2:
            y = "20" + y
        try:
            return date(int(y), int(mo), int(d))
        except Exception:
            pass
    try:
        if len(s) == 10 and s[4] == "-" and s[7] == "-":
            return date.fromisoformat(s)
    except Exception:
        pass
    return None
