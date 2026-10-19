"""Deterministic invoice-to-bank-transaction reconciliation.

No LLM, no embeddings, no randomness. Monetary work is done with ``Decimal``
throughout. Given the same inputs the output is always identical.

Matching is organised as three ordered phases:

1. **Reference phase** - strong identifier signals. A transaction references an
   invoice either because ``transaction_reference`` equals ``invoice_number`` or
   because the invoice number appears as a whole token in the description. A
   pair is linked only when it is unambiguous on *both* sides (the transaction
   references exactly one invoice and that invoice is referenced by exactly one
   transaction). Anything else becomes ``needs_review``/``duplicate_candidate``.

2. **Amount phase** - exact amount matching on the remaining rows. Invoices and
   transactions are bucketed by ``(currency, amount)``. Only compatible
   currencies are ever compared, and amounts are compared as ``Decimal``. A
   1:1 bucket becomes ``exact_match`` (inside the date window) or
   ``possible_match`` (outside the window / date unknown). A larger bucket is
   ambiguous and is flagged without linking anything.

3. **Leftover phase** - any invoice or transaction still unclaimed is
   ``unmatched``, with an explanation for why (missing amount, missing
   currency, or genuinely no candidate).

A *link* is a result row with both ``invoice_id`` and ``transaction_id`` set.
The unique constraints on the table make double-linking impossible.
"""

import re
from collections import Counter, defaultdict
from datetime import timedelta
from decimal import Decimal, InvalidOperation

# An invoice number shorter than this is not used for token-in-description
# matching, because very short strings (e.g. "INV") would match noise.
MIN_REFERENCE_LENGTH = 3

STATUS_EXACT_MATCH = "exact_match"
STATUS_PARTIAL_MATCH = "partial_match"
STATUS_POSSIBLE_MATCH = "possible_match"
STATUS_NEEDS_REVIEW = "needs_review"
STATUS_UNMATCHED = "unmatched"
STATUS_DUPLICATE_CANDIDATE = "duplicate_candidate"

ALL_STATUSES = (
    STATUS_EXACT_MATCH,
    STATUS_PARTIAL_MATCH,
    STATUS_POSSIBLE_MATCH,
    STATUS_NEEDS_REVIEW,
    STATUS_UNMATCHED,
    STATUS_DUPLICATE_CANDIDATE,
)

METHOD_REFERENCE_EXACT = "reference_exact"
METHOD_REFERENCE_IN_DESCRIPTION = "reference_in_description"
METHOD_AMOUNT_WINDOW = "amount_exact_within_window"
METHOD_AMOUNT_OUTSIDE_WINDOW = "amount_exact_outside_window"
METHOD_AMOUNT_DATE_UNKNOWN = "amount_exact_date_unknown"
METHOD_NONE = "none"

_ZERO = Decimal("0.00")
_MAX_EXPLANATION = 1000


def _norm(value):
    """Normalise an identifier/currency for comparison; None/empty -> None."""
    if value is None:
        return None
    text = str(value).strip().upper()
    return text or None


def _dec(value):
    """Coerce a stored value to a finite Decimal, or None if unusable."""
    if value is None:
        return None
    if isinstance(value, Decimal):
        amount = value
    else:
        try:
            amount = Decimal(str(value).strip().replace(",", ""))
        except (InvalidOperation, ValueError):
            return None
    if not amount.is_finite():
        return None
    return amount


def _contains_invoice_number(description, number):
    """Whole-token containment test (case-insensitive)."""
    if not description or not number:
        return False
    pattern = r"(?<![A-Za-z0-9])" + re.escape(number) + r"(?![A-Za-z0-9])"
    return re.search(pattern, str(description), re.IGNORECASE) is not None


def _currencies_compatible(left, right):
    """True only when both currencies are present and equal."""
    a = _norm(left)
    b = _norm(right)
    return a is not None and b is not None and a == b


def _within_date_window(invoice, transaction, window_days):
    """Return True/False when the dates allow a decision, else None."""
    if transaction.transaction_date is None:
        return None
    start_base = invoice.invoice_date or invoice.due_date
    end_base = invoice.due_date or invoice.invoice_date
    if start_base is None and end_base is None:
        return None
    start = (start_base or end_base) - timedelta(days=window_days)
    end = (end_base or start_base) + timedelta(days=window_days)
    return start <= transaction.transaction_date <= end


def summarize(results):
    """Count results per status, always including all statuses (zeros)."""
    counts = {status: 0 for status in ALL_STATUSES}
    for row in results:
        counts[row["match_status"]] = counts.get(row["match_status"], 0) + 1
    return counts


def build_matches(invoices, transactions, date_window_days=30):
    """Compute reconciliation results. Pure function; touches no database."""
    results = []
    used_invoices = set()
    used_transactions = set()
    linked_invoices = set()
    linked_transactions = set()

    def add(invoice_id, transaction_id, status, method, difference, explanation):
        results.append(
            {
                "invoice_id": invoice_id,
                "transaction_id": transaction_id,
                "match_status": status,
                "matching_method": method,
                "difference_amount": difference,
                "explanation": (explanation or "")[:_MAX_EXPLANATION],
            }
        )
        if invoice_id:
            used_invoices.add(invoice_id)
        if transaction_id:
            used_transactions.add(transaction_id)
        if invoice_id and transaction_id:
            linked_invoices.add(invoice_id)
            linked_transactions.add(transaction_id)

    invoice_by_id = {i.id: i for i in invoices}
    transaction_by_id = {t.id: t for t in transactions}

    invoice_number_counts = Counter(
        n for n in (_norm(i.invoice_number) for i in invoices) if n
    )
    transaction_reference_counts = Counter(
        r for r in (_norm(t.transaction_reference) for t in transactions) if r
    )

    def is_duplicate_invoice(invoice):
        number = _norm(invoice.invoice_number)
        return number is not None and invoice_number_counts[number] > 1

    def is_duplicate_transaction(transaction):
        reference = _norm(transaction.transaction_reference)
        return reference is not None and transaction_reference_counts[reference] > 1

    # ---------------------------------------------------------------- Phase 1
    # For every transaction, gather the invoices it references.
    #
    # Performance: the boundary regex for each invoice number is compiled ONCE
    # here. Calling re.search(pattern_string, ...) per (transaction, invoice)
    # pair relies on the stdlib's 512-entry compile cache, which thrashes once
    # there are more than 512 distinct invoice numbers (every pair then
    # recompiles: ~80x slowdown). A cheap case-insensitive substring test also
    # rejects almost every pair before the regex runs, so results are unchanged.
    invoice_probes = []
    for invoice in invoices:
        number = _norm(invoice.invoice_number)
        if not number or len(number) < MIN_REFERENCE_LENGTH:
            continue
        pattern = re.compile(
            r"(?<![A-Za-z0-9])" + re.escape(number) + r"(?![A-Za-z0-9])",
            re.IGNORECASE,
        )
        invoice_probes.append((invoice, number, number.lower(), pattern))

    transaction_candidates = {}
    for transaction in transactions:
        per_invoice = {}
        txn_reference = _norm(transaction.transaction_reference)
        description = str(transaction.description) if transaction.description else ""
        description_lower = description.lower()
        for invoice, number, number_lower, pattern in invoice_probes:
            if txn_reference is not None and txn_reference == number:
                per_invoice[invoice.id] = (invoice, METHOD_REFERENCE_EXACT)
            elif (
                description
                and number_lower in description_lower
                and pattern.search(description) is not None
            ):
                per_invoice[invoice.id] = (invoice, METHOD_REFERENCE_IN_DESCRIPTION)
        transaction_candidates[transaction.id] = list(per_invoice.values())

    # Inverse index: how many transactions reference each invoice.
    invoice_candidate_transactions = defaultdict(list)
    for transaction in transactions:
        for invoice, _method in transaction_candidates[transaction.id]:
            invoice_candidate_transactions[invoice.id].append(transaction)

    def link_by_reference(invoice, transaction, method):
        invoice_amount = _dec(invoice.total_amount)
        transaction_amount = _dec(transaction.amount)
        compatible = _currencies_compatible(invoice.currency, transaction.currency)
        if compatible and invoice_amount is not None and transaction_amount is not None:
            if invoice_amount == transaction_amount:
                add(
                    invoice.id,
                    transaction.id,
                    STATUS_EXACT_MATCH,
                    method,
                    _ZERO,
                    f"Reference matched and amounts are equal ({invoice_amount}).",
                )
            else:
                difference = (invoice_amount - transaction_amount).quantize(Decimal("0.01"))
                add(
                    invoice.id,
                    transaction.id,
                    STATUS_PARTIAL_MATCH,
                    method,
                    difference,
                    f"Reference matched but amounts differ: invoice {invoice_amount} "
                    f"vs transaction {transaction_amount}.",
                )
        else:
            reasons = []
            if not compatible:
                reasons.append("currency missing or mismatched")
            if invoice_amount is None or transaction_amount is None:
                reasons.append("amount missing")
            add(
                invoice.id,
                transaction.id,
                STATUS_NEEDS_REVIEW,
                method,
                None,
                "Reference matched but " + " and ".join(reasons) + ".",
            )

    # Accept only unambiguous 1:1 reference pairs.
    for transaction in sorted(transactions, key=lambda t: t.id):
        candidates = transaction_candidates[transaction.id]
        if len(candidates) != 1:
            continue
        invoice, method = candidates[0]
        if len(invoice_candidate_transactions[invoice.id]) == 1:
            link_by_reference(invoice, transaction, method)

    # Remaining reference relations are conflicting/duplicated.
    conflict_invoice_ids = set()
    conflict_transaction_ids = set()
    for transaction in transactions:
        if transaction.id in linked_transactions:
            continue
        candidates = transaction_candidates[transaction.id]
        if not candidates:
            continue
        conflict_transaction_ids.add(transaction.id)
        for invoice, _method in candidates:
            if invoice.id not in linked_invoices:
                conflict_invoice_ids.add(invoice.id)
            for other in invoice_candidate_transactions.get(invoice.id, []):
                if other.id not in linked_transactions:
                    conflict_transaction_ids.add(other.id)

    has_duplicate = any(
        is_duplicate_invoice(invoice_by_id[i]) for i in conflict_invoice_ids
    ) or any(
        is_duplicate_transaction(transaction_by_id[t]) for t in conflict_transaction_ids
    )
    conflict_status = (
        STATUS_DUPLICATE_CANDIDATE if has_duplicate else STATUS_NEEDS_REVIEW
    )

    for invoice_id in sorted(conflict_invoice_ids):
        if invoice_id in used_invoices:
            continue
        candidates = ", ".join(
            sorted(
                (t.transaction_reference or t.id)
                for t in invoice_candidate_transactions.get(invoice_id, [])
            )
        )
        add(
            invoice_id,
            None,
            conflict_status,
            METHOD_NONE,
            None,
            f"Conflicting or duplicate reference(s); candidate transactions: {candidates}",
        )
    for transaction_id in sorted(conflict_transaction_ids):
        if transaction_id in used_transactions:
            continue
        candidates = ", ".join(
            sorted(
                (i.invoice_number or i.id)
                for i, _method in transaction_candidates[transaction_id]
            )
        )
        add(
            None,
            transaction_id,
            conflict_status,
            METHOD_NONE,
            None,
            f"Conflicting or duplicate reference(s); candidate invoices: {candidates}",
        )

    # ---------------------------------------------------------------- Phase 2
    invoice_buckets = defaultdict(list)
    for invoice in invoices:
        if invoice.id in used_invoices:
            continue
        amount = _dec(invoice.total_amount)
        currency = _norm(invoice.currency)
        if amount is None or currency is None:
            continue
        invoice_buckets[(currency, amount)].append(invoice)

    transaction_buckets = defaultdict(list)
    for transaction in transactions:
        if transaction.id in used_transactions:
            continue
        amount = _dec(transaction.amount)
        currency = _norm(transaction.currency)
        if amount is None or currency is None:
            continue
        transaction_buckets[(currency, amount)].append(transaction)

    for key in sorted(invoice_buckets.keys() & transaction_buckets.keys()):
        currency, amount = key
        invoices_in_bucket = invoice_buckets[key]
        transactions_in_bucket = transaction_buckets[key]

        if len(invoices_in_bucket) == 1 and len(transactions_in_bucket) == 1:
            invoice = invoices_in_bucket[0]
            transaction = transactions_in_bucket[0]
            within = _within_date_window(invoice, transaction, date_window_days)
            if within is True:
                add(
                    invoice.id,
                    transaction.id,
                    STATUS_EXACT_MATCH,
                    METHOD_AMOUNT_WINDOW,
                    _ZERO,
                    f"Exact amount {amount} {currency} within the date window.",
                )
            elif within is False:
                add(
                    invoice.id,
                    transaction.id,
                    STATUS_POSSIBLE_MATCH,
                    METHOD_AMOUNT_OUTSIDE_WINDOW,
                    _ZERO,
                    f"Exact amount {amount} {currency} but outside the date window.",
                )
            else:
                add(
                    invoice.id,
                    transaction.id,
                    STATUS_POSSIBLE_MATCH,
                    METHOD_AMOUNT_DATE_UNKNOWN,
                    _ZERO,
                    f"Exact amount {amount} {currency}; dates unavailable to confirm window.",
                )
            continue

        duplicate = any(
            is_duplicate_invoice(i) for i in invoices_in_bucket
        ) or any(is_duplicate_transaction(t) for t in transactions_in_bucket)
        status = STATUS_DUPLICATE_CANDIDATE if duplicate else STATUS_NEEDS_REVIEW
        txn_candidates = ", ".join(
            sorted((t.transaction_reference or t.id) for t in transactions_in_bucket)
        )
        for invoice in invoices_in_bucket:
            if invoice.id in used_invoices:
                continue
            add(
                invoice.id,
                None,
                status,
                METHOD_NONE,
                None,
                f"Ambiguous amount group {amount} {currency}; "
                f"{len(transactions_in_bucket)} candidate transaction(s): {txn_candidates}",
            )
        inv_candidates = ", ".join(
            sorted((i.invoice_number or i.id) for i in invoices_in_bucket)
        )
        for transaction in transactions_in_bucket:
            if transaction.id in used_transactions:
                continue
            add(
                None,
                transaction.id,
                status,
                METHOD_NONE,
                None,
                f"Ambiguous amount group {amount} {currency}; "
                f"{len(invoices_in_bucket)} candidate invoice(s): {inv_candidates}",
            )

    # ---------------------------------------------------------------- Phase 3
    for invoice in invoices:
        if invoice.id in used_invoices:
            continue
        amount = _dec(invoice.total_amount)
        currency = _norm(invoice.currency)
        if amount is None:
            reason = "Invoice has no total_amount; cannot match by amount."
        elif currency is None:
            reason = "Invoice has no currency; amount matching needs compatible currencies."
        else:
            reason = "No matching bank transaction found."
        add(invoice.id, None, STATUS_UNMATCHED, METHOD_NONE, None, reason)

    for transaction in transactions:
        if transaction.id in used_transactions:
            continue
        amount = _dec(transaction.amount)
        currency = _norm(transaction.currency)
        if amount is None:
            reason = "Transaction has no amount; cannot match by amount."
        elif currency is None:
            reason = "Transaction has no currency; amount matching needs compatible currencies."
        else:
            reason = "No matching invoice found."
        add(None, transaction.id, STATUS_UNMATCHED, METHOD_NONE, None, reason)

    return results


def run_reconciliation(db, organization_id: str, date_window_days=None) -> dict:
    """Run the deterministic engine and persist results for one organization.

    This is the single orchestration entry point shared by the HTTP route and
    the assistant, so the two can never diverge. It loads the organization's
    invoices and transactions, computes matches with the pure engine, and
    atomically replaces the stored results. Returns a small summary dict.
    """
    # Imported here to keep the module's pure matching logic free of I/O imports.
    from app.core.config import settings
    from app.repositories import reconciliation_repository as repo

    window = (
        settings.RECONCILIATION_DATE_WINDOW_DAYS
        if date_window_days is None
        else date_window_days
    )
    invoices = repo.list_invoices_for_org(db, organization_id)
    transactions = repo.list_transactions_for_org(db, organization_id)
    results = build_matches(invoices, transactions, window)
    repo.replace_matches_for_org(db, organization_id, results)
    return {
        "date_window_days": window,
        "total_matches": len(results),
        "counts": summarize(results),
    }