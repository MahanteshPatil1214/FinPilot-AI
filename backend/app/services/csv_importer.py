from decimal import Decimal, InvalidOperation
from datetime import datetime, date
from io import StringIO
from typing import Any, Dict, List, Optional

# Field -> accepted header aliases (lower-cased). The first alias found wins.
COLUMN_ALIASES: Dict[str, List[str]] = {
    "transaction_reference": ["transaction_reference", "reference"],
    "transaction_date": ["transaction_date", "date"],
    "description": ["description", "narration"],
    "amount": ["amount"],
    "currency": ["currency"],
    "counterparty": ["counterparty"],
}

# Columns that must be present in the CSV header for an import to be attempted.
REQUIRED_COLUMNS: List[str] = [
    "transaction_reference",
    "transaction_date",
    "description",
    "amount",
]

MAX_FIELD_LENGTHS: Dict[str, int] = {
    "transaction_reference": 100,
    "description": 255,
    "currency": 10,
    "counterparty": 255,
}

_DATE_FORMATS = (
    "%Y-%m-%d",
    "%d/%m/%Y",
    "%d-%m-%Y",
    "%m/%d/%Y",
    "%d-%b-%Y",
    "%d %b %Y",
    "%Y/%m/%d",
)


class CSVValidationError(Exception):
    """Raised when a CSV file or one of its rows fails validation."""

    def __init__(self, message: str, errors: Optional[List[Dict[str, Any]]] = None):
        super().__init__(message)
        self.message = message
        self.errors = errors or []


def normalize_date(value: Any) -> Optional[date]:
    if value is None:
        return None
    s = str(value).strip()
    if not s:
        return None
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


def parse_amount(value: Any) -> Decimal:
    """Parse a monetary value into a 2-decimal Decimal.

    Rejects missing, non-numeric, non-finite, or over-precise values instead of
    silently rounding or coercing them.
    """
    if value is None:
        raise ValueError("amount is required")
    s = str(value).strip().replace(",", "")
    if s == "":
        raise ValueError("amount is required")
    try:
        amount = Decimal(s)
    except (InvalidOperation, ValueError):
        raise ValueError("amount is not a valid number")
    if not amount.is_finite():
        raise ValueError("amount must be a finite number")
    # Compare the numeric value, not the literal: "1.230" has no more than two
    # fractional places and must be accepted, while "1.234" must be rejected.
    normalized = amount.normalize()
    if normalized.as_tuple().exponent < -2:
        raise ValueError("amount must have at most 2 decimal places")
    return amount.quantize(Decimal("0.01"))


def _clean(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _resolve_columns(columns: List[str]) -> Dict[str, str]:
    normalized = {str(c).strip().lower(): c for c in columns}
    resolved: Dict[str, str] = {}
    for field, aliases in COLUMN_ALIASES.items():
        for alias in aliases:
            if alias in normalized:
                resolved[field] = normalized[alias]
                break
    return resolved


def parse_transactions_csv(content: bytes) -> Dict[str, Any]:
    """Validate a bank transaction CSV and return the valid rows.

    Raises CSVValidationError for empty files, malformed CSV, missing required
    columns, or any invalid row. On invalid rows the whole file is rejected.
    """
    if content is None or len(content.strip()) == 0:
        raise CSVValidationError("CSV file is empty")

    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        try:
            text = content.decode("latin-1")
        except UnicodeDecodeError:
            raise CSVValidationError("CSV file encoding is not supported")

    import pandas as pd

    try:
        df = pd.read_csv(
            StringIO(text), dtype=str, keep_default_na=False, index_col=False
        )
    except pd.errors.EmptyDataError:
        raise CSVValidationError("CSV file is empty")
    except pd.errors.ParserError as e:
        raise CSVValidationError(f"Malformed CSV: {e}")
    except Exception:
        raise CSVValidationError("Malformed CSV: unable to parse file")

    resolved = _resolve_columns(list(df.columns))
    missing = [c for c in REQUIRED_COLUMNS if c not in resolved]
    if missing:
        raise CSVValidationError(f"Missing required column(s): {', '.join(missing)}")

    if len(df.index) == 0:
        raise CSVValidationError("CSV file contains no data rows")

    rows: List[Dict[str, Any]] = []
    errors: List[Dict[str, Any]] = []

    for idx, raw in df.iterrows():
        row_number = idx + 2  # +1 for 0-index, +1 for header row

        def value_of(field: str) -> str:
            col = resolved.get(field)
            if col is None:
                return ""
            return _clean(raw[col])

        row_errors: List[str] = []

        reference = value_of("transaction_reference")
        if not reference:
            row_errors.append("transaction_reference is required")
        elif len(reference) > MAX_FIELD_LENGTHS["transaction_reference"]:
            row_errors.append(
                f"transaction_reference exceeds {MAX_FIELD_LENGTHS['transaction_reference']} characters"
            )

        date_raw = value_of("transaction_date")
        parsed_date = normalize_date(date_raw)
        if not date_raw:
            row_errors.append("transaction_date is required")
        elif parsed_date is None:
            row_errors.append("transaction_date is not a valid date")

        description = value_of("description")
        if not description:
            row_errors.append("description is required")
        elif len(description) > MAX_FIELD_LENGTHS["description"]:
            row_errors.append(
                f"description exceeds {MAX_FIELD_LENGTHS['description']} characters"
            )

        amount: Optional[Decimal] = None
        try:
            amount = parse_amount(value_of("amount"))
        except ValueError as e:
            row_errors.append(str(e))

        currency = value_of("currency").upper() or "INR"
        if len(currency) > MAX_FIELD_LENGTHS["currency"]:
            row_errors.append(
                f"currency exceeds {MAX_FIELD_LENGTHS['currency']} characters"
            )

        counterparty = value_of("counterparty") or None
        if counterparty and len(counterparty) > MAX_FIELD_LENGTHS["counterparty"]:
            row_errors.append(
                f"counterparty exceeds {MAX_FIELD_LENGTHS['counterparty']} characters"
            )

        if row_errors:
            errors.append({"row": row_number, "errors": row_errors})
            continue

        rows.append(
            {
                "transaction_reference": reference,
                "transaction_date": parsed_date,
                "description": description,
                "amount": amount,
                "currency": currency,
                "counterparty": counterparty,
            }
        )

    if errors:
        raise CSVValidationError("CSV contains invalid rows", errors=errors)

    return {"rows": rows, "total_rows": len(df.index)}
