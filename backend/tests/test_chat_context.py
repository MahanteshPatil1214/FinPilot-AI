"""Deterministic intent classification for the assistant.

Routing is rule-based, so each case below pins the selected intent. These guard
the behaviour the live assistant depends on: a policy/term question must reach
document retrieval, while any explicit financial filter must not.
"""

from app.agents.chat import context
from app.agents.chat.context import (
    DISCREPANCY,
    DOCUMENT_QA,
    FINANCIAL_QUERY,
    REPORT,
    REVIEW_DECISION,
    UNSUPPORTED,
)


def test_singular_term_policy_question_routes_to_document_qa():
    # The exact journey-B question: no explicit "document"/"policy" cue and no
    # financial filter. "term" (singular) must count as a document cue.
    ctx = context.classify(
        "What is the standard payment term for Northstar Office Supplies Ltd.?"
    )
    assert ctx.intent == DOCUMENT_QA


def test_plural_terms_policy_question_still_routes_to_document_qa():
    ctx = context.classify("What do the payment terms say about early settlement?")
    assert ctx.intent == DOCUMENT_QA


def test_term_question_with_status_filter_stays_financial():
    ctx = context.classify("What are the payment terms for unmatched invoices?")
    assert ctx.intent == FINANCIAL_QUERY


def test_term_question_with_invoice_number_stays_financial():
    ctx = context.classify("What is the payment term for invoice INV-104?")
    assert ctx.intent == FINANCIAL_QUERY


def test_attached_document_forces_document_qa():
    ctx = context.classify(
        "What is the payment term here?", attachment_document_ids=["doc-1"]
    )
    assert ctx.intent == DOCUMENT_QA


def test_plural_invoices_routes_to_financial_query():
    ctx = context.classify("Show me all invoices")
    assert ctx.intent == FINANCIAL_QUERY


def test_plural_transactions_routes_to_financial_query():
    ctx = context.classify("List all transactions")
    assert ctx.intent == FINANCIAL_QUERY


def test_plural_documents_routes_to_document_qa():
    ctx = context.classify("What do the contracts say about early settlement discounts?")
    assert ctx.intent == DOCUMENT_QA


def test_unsupported_payment_action_is_refused():
    ctx = context.classify("Pay the invoice INV-104 right now")
    assert ctx.intent == UNSUPPORTED


def test_review_decision_is_refused():
    ctx = context.classify("Approve the investigation")
    assert ctx.intent == REVIEW_DECISION


def test_report_request_routes_to_report():
    ctx = context.classify("Generate a report of this month's results")
    assert ctx.intent == REPORT


def test_underpaid_question_routes_to_discrepancy():
    ctx = context.classify("Why was invoice INV-104 underpaid?")
    assert ctx.intent == DISCREPANCY
