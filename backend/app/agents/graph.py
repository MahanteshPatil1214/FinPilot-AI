"""Compiled LangGraph for the investigation workflow.

A fixed, bounded graph - not an autonomous agent:

    validate_request
      -> load_financial_records
      -> gather_evidence
      -> assess_evidence_sufficiency
      -> generate_report
      -> validate_report_and_citations
      -> (retry once) | human_review | finalize

Every tool call is deterministic and performed by Python. The only LLM call is
inside ``generate_report`` and its output is validated before use.
"""

from langgraph.graph import END, StateGraph
from sqlalchemy.orm import Session

from app.agents.nodes import MAX_RETRIES, make_nodes
from app.agents.state import InvestigationState
from app.services.embedding_service import EmbeddingProvider
from app.services.llm_client import LLMClient


def _route_after_validation(state: InvestigationState) -> str:
    valid = bool(state.get("report_valid"))
    retry_count = int(state.get("retry_count") or 0)
    if not valid:
        if retry_count <= MAX_RETRIES:
            return "retry"
        return "review"
    if state.get("requires_human_review"):
        return "review"
    return "finalize"


def build_investigation_graph(
    db: Session, embedder: EmbeddingProvider, llm: LLMClient
):
    nodes = make_nodes(db, embedder, llm)

    graph = StateGraph(InvestigationState)
    graph.add_node("validate_request", nodes["validate_request"])
    graph.add_node("load_financial_records", nodes["load_financial_records"])
    graph.add_node("gather_evidence", nodes["gather_evidence"])
    graph.add_node(
        "assess_evidence_sufficiency", nodes["assess_evidence_sufficiency"]
    )
    graph.add_node("generate_report", nodes["generate_report"])
    graph.add_node(
        "validate_report_and_citations", nodes["validate_report_and_citations"]
    )
    graph.add_node("human_review", nodes["human_review"])
    graph.add_node("finalize", nodes["finalize"])

    graph.set_entry_point("validate_request")
    graph.add_edge("validate_request", "load_financial_records")
    graph.add_edge("load_financial_records", "gather_evidence")
    graph.add_edge("gather_evidence", "assess_evidence_sufficiency")
    graph.add_edge("assess_evidence_sufficiency", "generate_report")
    graph.add_edge("generate_report", "validate_report_and_citations")
    graph.add_conditional_edges(
        "validate_report_and_citations",
        _route_after_validation,
        {
            "retry": "generate_report",
            "review": "human_review",
            "finalize": "finalize",
        },
    )
    graph.add_edge("human_review", END)
    graph.add_edge("finalize", END)

    return graph.compile()
