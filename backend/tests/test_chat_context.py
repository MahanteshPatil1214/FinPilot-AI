"""Deterministic intent classification for the assistant.

Routing is rule-based, so each case below pins the selected intent. These guard
the behaviour the live assistant depends on: a policy/term question must reach
document retrieval, while any explicit financial filter must not.
"""

from app.agents.chat import context
from app.agents.chat.context import (
    DASHBOARD,
    DISCREPANCY,
    DOCUMENT_QA,
    FINANCIAL_QUERY,
    GROUNDED_CALCULATION,
    INVESTIGATION_LIST,
    INVESTIGATION_RUN,
    RECONCILIATION_RUN,
    REPORT,
    REVIEW_DECISION,
    REVIEW_QUEUE,
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


def test_investigate_with_uncertainty_phrase_runs_not_lists():
    # Regression: the noun "investigation" plus the broad list word "what" used
    # to hijack this into INVESTIGATION_LIST before the verb was checked.
    ctx = context.classify(
        "Investigate invoice INV-2026-0001. Retrieve the invoice and its related "
        "bank transaction, calculate any payment difference, search the relevant "
        "vendor policy, and prepare an investigation report. Separate verified "
        "facts from possible explanations, cite the supporting evidence, and tell "
        "me what remains uncertain. Do not approve anything."
    )
    assert ctx.intent == INVESTIGATION_RUN


def test_explicit_investigation_list_still_lists():
    ctx = context.classify("List all investigations")
    assert ctx.intent == INVESTIGATION_LIST


def test_calculation_with_amount_routes_to_grounded_calculation():
    ctx = context.classify(
        "Calculate the discount on an eligible pre-tax subtotal of ₹10,000. "
        "Explain the calculation and cite the policy."
    )
    assert ctx.intent == GROUNDED_CALCULATION
    assert ctx.amount is not None


def test_calculation_without_amount_stays_document_qa():
    ctx = context.classify("How does the policy calculate the discount?")
    assert ctx.intent == DOCUMENT_QA


def test_discrepancy_calculate_phrase_is_not_a_calculation():
    # No explicit amount and a discrepancy cue: must remain a discrepancy turn.
    ctx = context.classify("Calculate why invoice INV-104 was underpaid")
    assert ctx.intent == DISCREPANCY


def test_dashboard_phrase_routes_to_dashboard():
    assert context.classify("Show the workspace summary.").intent == DASHBOARD
    assert context.classify("Show me the dashboard").intent == DASHBOARD


# Each slash command maps to a canonical phrase that must route to the backend
# capability it advertises. These are the exact strings the composer sends when
# a command is chosen, so the mapping and the classifier cannot drift apart.
SLASH_COMMAND_ROUTING = {
    "Search my documents and summarize the most relevant information.": DOCUMENT_QA,
    "Run reconciliation.": RECONCILIATION_RUN,
    "List the invoices.": FINANCIAL_QUERY,
    "List the recent transactions.": FINANCIAL_QUERY,
    "Investigate the latest discrepancy.": INVESTIGATION_RUN,
    "Summarize investigations waiting for my review.": REVIEW_QUEUE,
    "Show the workspace summary.": DASHBOARD,
}


def test_slash_command_phrases_route_to_their_capability():
    for phrase, expected in SLASH_COMMAND_ROUTING.items():
        assert context.classify(phrase).intent == expected, phrase


def test_resume_phrases_route_to_document_qa():
    ctx1 = context.classify(
        "What is name of person who resume is this?",
        attachment_document_ids=["doc-resume"],
    )
    assert ctx1.intent == DOCUMENT_QA
    assert ctx1.attachment_document_ids == ["doc-resume"]

    ctx2 = context.classify(
        "Summarize the education and technical skills listed in my attached resume.",
        attachment_document_ids=["doc-resume"],
    )
    assert ctx2.intent == DOCUMENT_QA
    assert ctx2.attachment_document_ids == ["doc-resume"]


def test_prior_attachment_carried_forward_on_follow_up():
    ctx = context.classify(
        "Summarize the education and technical skills listed in my attached resume.",
        attachment_document_ids=[],
        prior_attachment_document_ids=["doc-resume"],
    )
    assert ctx.intent == DOCUMENT_QA
    assert ctx.attachment_document_ids == ["doc-resume"]

    ctx_degree = context.classify(
        "What degree did they complete?",
        attachment_document_ids=[],
        prior_attachment_document_ids=["doc-resume"],
    )
    assert ctx_degree.intent == DOCUMENT_QA
    assert ctx_degree.attachment_document_ids == ["doc-resume"]


def test_competing_financial_record_not_hijacked_by_prior_attachment():
    ctx = context.classify(
        "Show invoice INV-104",
        attachment_document_ids=[],
        prior_attachment_document_ids=["doc-resume"],
    )
    assert ctx.intent == FINANCIAL_QUERY

    ctx_rec = context.classify(
        "Run reconciliation.",
        attachment_document_ids=[],
        prior_attachment_document_ids=["doc-resume"],
    )
    assert ctx_rec.intent == RECONCILIATION_RUN


