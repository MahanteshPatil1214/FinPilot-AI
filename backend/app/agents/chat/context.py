"""Deterministic intent classification and slot extraction for the assistant.

Routing is intentionally rule-based and reviewable rather than model-driven:
the same message always selects the same toolset, tests can assert selection,
and an unconfigured model can never route a request into an unsafe action. The
LLM is used only to *phrase* an answer from evidence or capabilities, never to
choose which financial operation runs.
"""

import re
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
from typing import Dict, List, Optional

# --- Intent identifiers -----------------------------------------------------
UNSUPPORTED = "unsupported"
INVESTIGATION_RUN = "investigation_run"
REVIEW_QUEUE = "review_queue"
REVIEW_DECISION = "review_decision"
RECONCILIATION_RUN = "reconciliation_run"
REPORT = "report"
DISCREPANCY = "discrepancy"
INVESTIGATION_LIST = "investigation_list"
FINANCIAL_QUERY = "financial_query"
DOCUMENT_QA = "document_qa"
GENERAL = "general"

# Reconciliation statuses a user might name, in priority order.
_STATUS_KEYWORDS = (
    ("unmatched", "unmatched"),
    ("not matched", "unmatched"),
    ("no match", "unmatched"),
    ("duplicate", "duplicate_candidate"),
    ("partial", "partial_match"),
    ("underpaid", "partial_match"),
    ("overpaid", "partial_match"),
    ("short paid", "partial_match"),
    ("exact", "exact_match"),
    ("fully matched", "exact_match"),
    ("possible", "possible_match"),
    ("needs review", "needs_review"),
    ("to review", "needs_review"),
)

_INVOICE_NUMBER_RE = re.compile(
    r"\b(INV[-\s]?\d{2,}(?:[-\s]?\d+)?)\b", re.IGNORECASE
)
_UUID_RE = re.compile(
    r"\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-"
    r"[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b"
)
_MIN_AMOUNT_RE = re.compile(
    r"(?:above|over|greater than|more than|exceeding|at least|>=|>)\s*"
    r"(?:₹|rs\.?|inr|usd|\$)?\s*([\d,]+(?:\.\d+)?)",
    re.IGNORECASE,
)
_CURRENCY_AMOUNT_RE = re.compile(
    r"(?:₹|rs\.?|inr|usd|\$)\s*([\d,]+(?:\.\d+)?)", re.IGNORECASE
)
_AMOUNT_RE = re.compile(r"\b(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+\.\d{2})\b")

_UNSUPPORTED_PATTERNS = (
    re.compile(
        r"\b(make\s+(a\s+)?payment|pay\s+(the\s+|this\s+|an\s+)?"
        r"(invoice|vendor|bill|supplier)|send\s+money|transfer\s+(funds|money)|"
        r"wire\s+(funds|money)|remit)\b",
        re.IGNORECASE,
    ),
    re.compile(
        r"\b(change|update|edit|modify)\b.*\bbank\b", re.IGNORECASE
    ),
    re.compile(
        r"\b(delete|remove)\b.*\b(invoice|transaction|document|"
        r"investigation|conversation|record)\b",
        re.IGNORECASE,
    ),
)

_REVIEW_DECISION_RE = re.compile(
    r"\b(approve|reject|deny)\b.*\b(investigation|report|case|finding)\b",
    re.IGNORECASE,
)
_INVESTIGATE_VERB_RE = re.compile(r"\binvestigat(?:e|ing)\b", re.IGNORECASE)
_RECONCILE_RUN_RE = re.compile(
    r"\b(run|re-?run|start|perform|do)\b.*\breconcil|\breconcile\b",
    re.IGNORECASE,
)
_REPORT_RE = re.compile(r"\breport\b", re.IGNORECASE)
_DISCREPANCY_RE = re.compile(
    r"\b(underpaid|overpaid|discrepanc|short[\s-]?paid|difference|"
    r"why\s+was|why\s+is|compare|mismatch|variance)\b",
    re.IGNORECASE,
)
_REVIEW_QUEUE_RE = re.compile(
    r"\b(awaiting|waiting|pending|queue|needs?)\b.*\breview\b|\bmy\s+review\b|"
    r"\breview\b.*\b(waiting|awaiting|pending|queue|summar)\b",
    re.IGNORECASE,
)
_INVESTIGATION_LIST_RE = re.compile(
    r"\binvestigation", re.IGNORECASE
)
_LIST_WORDS_RE = re.compile(
    r"\b(list|show|summar|summary|all|open|which|what|how many)\b",
    re.IGNORECASE,
)
_FINANCIAL_RE = re.compile(
    r"\b(unmatched|match(?:es|ed|ing)?|reconcil\w*|invoices?|transactions?|"
    r"payments?|amounts?|totals?|balances?|how much|counts?|paid|outstanding|"
    r"records?)\b",
    re.IGNORECASE,
)
_DOCUMENT_RE = re.compile(
    r"\b(polic(?:y|ies)|terms?|clauses?|agreements?|contracts?|documents?|"
    r"pdfs?|pages?|according to|say about|explain|what does|state[sd]?|wording)\b",
    re.IGNORECASE,
)


@dataclass
class TurnContext:
    """Slots extracted from one user message plus carried-over references."""

    intent: str
    invoice_number: Optional[str] = None
    invoice_id: Optional[str] = None
    match_id: Optional[str] = None
    status: Optional[str] = None
    min_amount: Optional[Decimal] = None
    wants_reconcile: bool = False
    attachment_document_ids: List[str] = field(default_factory=list)
    period_label: Optional[str] = None


def _to_decimal(raw: str) -> Optional[Decimal]:
    try:
        return Decimal(raw.replace(",", "")).quantize(Decimal("0.01"))
    except (InvalidOperation, ValueError):
        return None


def _first_invoice_number(text: str) -> Optional[str]:
    match = _INVOICE_NUMBER_RE.search(text)
    if not match:
        return None
    # Normalise to uppercase and collapse internal whitespace to a hyphen.
    return re.sub(r"\s+", "-", match.group(1)).upper()


def _detect_status(text: str) -> Optional[str]:
    lowered = text.lower()
    for keyword, status in _STATUS_KEYWORDS:
        if keyword in lowered:
            return status
    return None


def _detect_period(text: str) -> Optional[str]:
    lowered = text.lower()
    if "this month" in lowered or "current month" in lowered:
        return "this month"
    if "last month" in lowered:
        return "last month"
    if "this year" in lowered:
        return "this year"
    if "today" in lowered:
        return "today"
    return None


def classify(
    content: str,
    attachment_document_ids: Optional[List[str]] = None,
    prior_invoice_id: Optional[str] = None,
    prior_match_id: Optional[str] = None,
) -> TurnContext:
    """Classify a message and extract allowlisted slots (deterministic)."""
    text = content or ""
    lowered = text.lower()
    attachments = list(attachment_document_ids or [])

    invoice_number = _first_invoice_number(text)
    uuids = _UUID_RE.findall(text)
    min_amount = None
    amount_match = _MIN_AMOUNT_RE.search(text)
    if amount_match:
        min_amount = _to_decimal(amount_match.group(1))

    ctx = TurnContext(
        intent=GENERAL,
        invoice_number=invoice_number,
        match_id=uuids[0] if uuids else None,
        status=_detect_status(text),
        min_amount=min_amount,
        attachment_document_ids=attachments,
        period_label=_detect_period(text),
    )

    # A reference the user did not repeat is resolved from conversation context.
    if ctx.match_id is None:
        ctx.match_id = prior_match_id
    if not invoice_number and prior_invoice_id:
        ctx.invoice_id = prior_invoice_id

    # 1. Explicitly prohibited financial actions are always refused first.
    for pattern in _UNSUPPORTED_PATTERNS:
        if pattern.search(text):
            ctx.intent = UNSUPPORTED
            return ctx

    # 2. Review decisions are consequential and must happen in the workspace.
    if _REVIEW_DECISION_RE.search(text):
        ctx.intent = REVIEW_DECISION
        return ctx

    # 3. "Summarize investigations waiting for my review." Checked before the
    #    generic investigate verb so the noun "investigations" does not hijack it.
    if _REVIEW_QUEUE_RE.search(text):
        ctx.intent = REVIEW_QUEUE
        return ctx

    # 4. Listing investigations ("list investigations", "how many ...").
    if _INVESTIGATION_LIST_RE.search(text) and _LIST_WORDS_RE.search(text):
        ctx.intent = INVESTIGATION_LIST
        return ctx

    # 5. An explicit investigation request (verb form only).
    if _INVESTIGATE_VERB_RE.search(text):
        ctx.intent = INVESTIGATION_RUN
        return ctx

    # 6. "Run reconciliation."
    if _RECONCILE_RUN_RE.search(text):
        ctx.intent = RECONCILIATION_RUN
        return ctx

    # 7. "Generate a report of this month's reconciliation results."
    if _REPORT_RE.search(text):
        ctx.intent = REPORT
        return ctx

    # 8. A discrepancy explanation: an explicit discrepancy cue together with a
    #    financial subject (or an invoice reference). The handler asks for the
    #    specific record when none is resolvable.
    if _DISCREPANCY_RE.search(text) and (
        _FINANCIAL_RE.search(text) or invoice_number or ctx.invoice_id
    ):
        ctx.intent = DISCREPANCY
        return ctx

    # 9. A document question: strong document cues, unless an explicit
    #    financial filter (status / threshold / invoice reference / raw id) is
    #    present in the message itself.
    has_financial_filter = bool(
        ctx.status or ctx.min_amount or invoice_number or uuids
    )
    if _DOCUMENT_RE.search(text) and not has_financial_filter:
        ctx.intent = DOCUMENT_QA
        return ctx

    # 10. Any financial keyword with a filter, or an attached document.
    if _FINANCIAL_RE.search(text):
        ctx.intent = FINANCIAL_QUERY
        return ctx

    # 11. Attachments with no clearer signal become a document question.
    if attachments:
        ctx.intent = DOCUMENT_QA
        return ctx

    return ctx


def extract_amount_from(text: str) -> Optional[Decimal]:
    """Best-effort amount parse for standalone reporting requests."""
    for regex in (_CURRENCY_AMOUNT_RE, _AMOUNT_RE):
        match = regex.search(text or "")
        if match:
            value = _to_decimal(match.group(1))
            if value is not None:
                return value
    return None
