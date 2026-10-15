"""Validation of LLM-generated investigation reports.

The LLM only writes prose; it must not invent sources, financial facts or
actions. This module parses the model's JSON, enforces the allowed schema, maps
every citation back to a real retrieved evidence item, and constrains the
recommended action to a safe allowlist (no payment actions). Anything that
cannot be validated is dropped and reported so the workflow can retry once or
route the case to human review.
"""

import json
import re
from typing import Any, Dict, List, Optional, Tuple

CONFIDENCE_VALUES = ("high", "medium", "low")

FINDING_KINDS = ("fact", "hypothesis")

# Bounded set of next actions. Nothing here moves money or changes bank
# details; those operations do not exist in the system.
ALLOWED_ACTIONS = (
    "No action needed",
    "Review supporting documents",
    "Request clarification from vendor",
    "Mark for human review",
    "Re-run reconciliation",
)

DEFAULT_ACTION = "Mark for human review"


def extract_json(raw: Optional[str]) -> Optional[Dict[str, Any]]:
    """Best-effort extraction of a JSON object from model output."""
    if not raw:
        return None
    text = raw.strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z0-9]*\s*", "", text)
        text = re.sub(r"\s*```$", "", text).strip()
    try:
        parsed = json.loads(text)
        return parsed if isinstance(parsed, dict) else None
    except (ValueError, TypeError):
        pass
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end > start:
        try:
            parsed = json.loads(text[start : end + 1])
            return parsed if isinstance(parsed, dict) else None
        except (ValueError, TypeError):
            return None
    return None


def _as_str_list(value: Any) -> List[str]:
    if value is None:
        return []
    if isinstance(value, str):
        return [value.strip()] if value.strip() else []
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    return []


def _citation_indexes(value: Any, max_index: int) -> Tuple[List[int], List[int]]:
    """Return (valid_indexes, invalid_indexes) for a findings' citations."""
    valid: List[int] = []
    invalid: List[int] = []
    if value is None:
        return valid, invalid
    raw_items = value if isinstance(value, list) else [value]
    for item in raw_items:
        try:
            index = int(item)
        except (TypeError, ValueError):
            invalid.append(-1)
            continue
        if 1 <= index <= max_index:
            if index not in valid:
                valid.append(index)
        else:
            invalid.append(index)
    return valid, invalid


def build_citations(
    evidence: List[Dict[str, Any]], indexes: List[int]
) -> List[Dict[str, Any]]:
    citations = []
    for index in sorted(indexes):
        item = evidence[index - 1]
        citation: Dict[str, Any] = {
            "index": index,
            "kind": item.get("kind", "document_chunk"),
        }
        for key in (
            "document_id",
            "filename",
            "document_type",
            "page_number",
            "chunk_id",
            "score",
            "record_type",
            "record_id",
        ):
            if item.get(key) is not None:
                citation[key] = item[key]
        citations.append(citation)
    return citations


def validate_report(
    raw: Dict[str, Any],
    evidence: List[Dict[str, Any]],
) -> Tuple[Optional[Dict[str, Any]], List[str], bool]:
    """Validate and normalise a parsed report.

    Returns ``(report, errors, valid)``. ``valid`` is False when the report
    cannot be trusted structurally (e.g. no usable findings or broken
    citations) and the workflow should retry or send it to human review.
    """
    if raw is None:
        return None, ["report is not valid JSON"], False

    errors: List[str] = []
    max_index = len(evidence)

    summary = str(raw.get("summary") or "").strip()
    if not summary:
        errors.append("summary is empty")

    findings: List[Dict[str, Any]] = []
    used_indexes: List[int] = []
    for item in raw.get("findings") or []:
        if not isinstance(item, dict):
            errors.append("finding is not an object")
            continue
        statement = str(item.get("statement") or "").strip()
        if not statement:
            errors.append("finding has no statement")
            continue
        kind = str(item.get("kind") or "hypothesis").strip().lower()
        if kind not in FINDING_KINDS:
            kind = "hypothesis"
        valid_indexes, invalid_indexes = _citation_indexes(
            item.get("citations"), max_index
        )
        if invalid_indexes:
            errors.append("finding referenced invalid citation indexes")
        if kind == "fact" and not valid_indexes:
            # Facts must be traceable to evidence; otherwise drop them.
            errors.append("dropped uncited fact")
            continue
        findings.append(
            {"statement": statement, "kind": kind, "citations": valid_indexes}
        )
        used_indexes.extend(valid_indexes)

    missing_evidence = _as_str_list(raw.get("missing_evidence"))

    action = str(raw.get("recommended_action") or "").strip()
    if action not in ALLOWED_ACTIONS:
        errors.append("recommended_action not in allowlist; defaulted")
        action = DEFAULT_ACTION
        # An out-of-policy action means a human must look at this case.
        raw_requires_review = True
    else:
        raw_requires_review = bool(raw.get("requires_human_review", False))

    confidence = str(raw.get("confidence") or "low").strip().lower()
    if confidence not in CONFIDENCE_VALUES:
        confidence = "low"

    requires_review = raw_requires_review
    # A report with no findings at all is not trustworthy.
    if not findings:
        errors.append("no valid findings")
        requires_review = True

    report = {
        "summary": summary,
        "findings": findings,
        "missing_evidence": missing_evidence,
        "recommended_action": action,
        "confidence": confidence,
        "requires_human_review": requires_review,
        "citations": build_citations(evidence, sorted(set(used_indexes))),
    }
    valid = bool(findings) and "report is not valid JSON" not in errors
    # Structural invalidators: no findings, or broken citations.
    fatal = (not findings) or any(
        "invalid citation" in error or "not valid JSON" in error for error in errors
    )
    return report, errors, (valid and not fatal)
