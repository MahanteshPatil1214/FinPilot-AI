"""Real API integration tests against the running backend (PostgreSQL + pgvector + Groq).

These are NOT mocked: they issue real HTTP calls to a live FastAPI instance and
exercise the real database, the local embedding model and (when configured) Groq.

Gate and configure with:
    FINPILOT_LIVE=1
    FINPILOT_LIVE_BASE_URL=http://localhost:8000            (default)
    FINPILOT_LIVE_DATABASE_URL=postgresql://...              (org-scoping check)

A module fixture reseeds the canonical demo dataset through the public API
(``scripts/seed_live.py --reset --index``) so results are reproducible.
"""

import os
import subprocess
import sys
import uuid
from pathlib import Path

import httpx
import psycopg2
import pytest

BACKEND_DIR = Path(__file__).resolve().parents[2]
API = "/api/v1"

BASE_URL = os.environ.get("FINPILOT_LIVE_BASE_URL", "http://localhost:8000")
LIVE = os.environ.get("FINPILOT_LIVE", "").lower() in ("1", "true", "yes")
DB_URL = os.environ.get(
    "FINPILOT_LIVE_DATABASE_URL",
    "postgresql://postgres:postgres@localhost:5433/finpilot",
)

pytestmark = pytest.mark.skipif(
    not LIVE, reason="set FINPILOT_LIVE=1 to run live integration tests"
)


@pytest.fixture(scope="module", autouse=True)
def _seed_live_dataset():
    """Reset and seed the canonical demo dataset through the public API."""
    result = subprocess.run(
        [sys.executable, "scripts/seed_live.py", "--reset", "--index"],
        cwd=str(BACKEND_DIR),
        capture_output=True,
        text=True,
        timeout=300,
    )
    if result.returncode != 0:
        pytest.fail(
            f"seed_live.py failed ({result.returncode}):\n"
            f"{result.stdout}\n{result.stderr}"
        )
    yield


def _new_conversation(client: httpx.Client) -> str:
    response = client.post(f"{API}/chat/conversations", json={})
    assert response.status_code == 201, response.text
    return response.json()["id"]


def _ask(
    client: httpx.Client,
    conversation_id: str,
    content: str,
    attachments=None,
) -> dict:
    payload = {"content": content}
    if attachments:
        payload["attachment_document_ids"] = attachments
    response = client.post(
        f"{API}/chat/conversations/{conversation_id}/messages",
        json=payload,
        timeout=90,
    )
    assert response.status_code == 200, response.text
    return response.json()["assistant_message"]


def test_conversation_lifecycle():
    with httpx.Client(base_url=BASE_URL, timeout=90) as client:
        cid = _new_conversation(client)

        listing = client.get(f"{API}/chat/conversations").json()
        assert listing["total"] >= 1
        assert any(item["id"] == cid for item in listing["items"])

        assert client.get(f"{API}/chat/conversations/{cid}").json()["messages"] == []

        assistant = _ask(client, cid, "Hello there")
        assert assistant["role"] == "assistant"
        assert assistant["outcome"] in {
            "answered",
            "unavailable",
            "insufficient_evidence",
        }

        detail = client.get(f"{API}/chat/conversations/{cid}").json()
        assert len(detail["messages"]) == 2
        assert detail["title"]

        assert client.delete(f"{API}/chat/conversations/{cid}").status_code == 204
        assert client.get(f"{API}/chat/conversations/{cid}").status_code == 404


def test_document_qa_answers_from_indexed_policy_with_citation():
    """Journey B: real retrieval + real answer over the indexed vendor policy."""
    with httpx.Client(base_url=BASE_URL, timeout=90) as client:
        cid = _new_conversation(client)
        assistant = _ask(
            client,
            cid,
            "What does the vendor payment policy say about the early payment "
            "discount?",
        )
        assert assistant["outcome"] in {"answered", "unavailable"}, assistant
        assert assistant["citations"], assistant
        cited_files = {c["filename"] for c in assistant["citations"]}
        assert "vendor_policy_acme.pdf" in cited_files, cited_files
        assert any(
            tc["name"] in ("search_documents", "answer_documents")
            for tc in assistant["tool_calls"]
        )
        if assistant["outcome"] == "answered":
            content = assistant["content"]
            assert "300" in content or "discount" in content.lower()


def test_document_qa_out_of_domain_is_honest():
    with httpx.Client(base_url=BASE_URL, timeout=90) as client:
        cid = _new_conversation(client)
        assistant = _ask(
            client,
            cid,
            "According to our documents, what is the calorie content of the "
            "cafeteria menu?",
        )
        if assistant["outcome"] == "answered":
            assert assistant["citations"]
        else:
            assert assistant["outcome"] == "insufficient_evidence", assistant


def test_financial_query_returns_deterministic_records_and_refs():
    with httpx.Client(base_url=BASE_URL, timeout=90) as client:
        cid = _new_conversation(client)

        assistant = _ask(client, cid, "Which transactions are unmatched?")
        assert assistant["outcome"] == "success"
        assert "unmatched" in assistant["content"].lower()
        assert any(
            call["name"] == "find_reconciliation" and call["status"] == "ok"
            for call in assistant["tool_calls"]
        )
        ref_kinds = {ref["kind"] for ref in assistant["result_refs"]}
        assert {"reconciliation", "transaction"} & ref_kinds

        assistant = _ask(client, cid, "Show me all invoices")
        assert assistant["outcome"] == "success"
        assert "INV-2026-0001" in assistant["content"]
        assert any(ref["kind"] == "invoice" for ref in assistant["result_refs"])


def test_discrepancy_uses_deterministic_difference():
    with httpx.Client(base_url=BASE_URL, timeout=90) as client:
        cid = _new_conversation(client)
        assistant = _ask(client, cid, "Why was invoice INV-2026-0001 underpaid?")
        assert assistant["outcome"] == "success"
        # 12000.00 invoiced vs 11700.00 paid -> 300.00 deterministic difference.
        assert "300.00" in assistant["content"]
        ref_kinds = {ref["kind"] for ref in assistant["result_refs"]}
        assert "invoice" in ref_kinds and "reconciliation" in ref_kinds


def test_failure_and_safety_cases():
    with httpx.Client(base_url=BASE_URL, timeout=90) as client:
        assert (
            client.post(
                f"{API}/chat/conversations/missing/messages",
                json={"content": "hi"},
            ).status_code
            == 404
        )

        cid = _new_conversation(client)
        assert (
            client.post(
                f"{API}/chat/conversations/{cid}/messages",
                json={"content": "   "},
            ).status_code
            == 422
        )
        assert (
            client.post(
                f"{API}/chat/conversations/{cid}/messages",
                json={"content": "hi", "organization_id": "org_2"},
            ).status_code
            == 422
        )
        assert client.get(f"{API}/chat/conversations/missing").status_code == 404
        assert client.delete(f"{API}/chat/conversations/missing").status_code == 404

        for content in (
            "Pay the invoice INV-104 right now",
            "Approve the investigation",
        ):
            assistant = _ask(client, cid, content)
            assert assistant["outcome"] == "unsupported", (content, assistant)

        assert client.delete(f"{API}/chat/conversations/{cid}").status_code == 204


def test_org_scoping_isolates_conversations_in_real_db():
    with psycopg2.connect(DB_URL) as conn:
        with conn.cursor() as cur:
            cid = str(uuid.uuid4())
            cur.execute(
                "INSERT INTO chat_conversations (id, organization_id, title, "
                "created_at, updated_at) VALUES (%s, %s, %s, NOW(), NOW())",
                (cid, "org_2", "other tenant"),
            )
            conn.commit()

    try:
        with httpx.Client(base_url=BASE_URL, timeout=90) as client:
            assert client.get(f"{API}/chat/conversations/{cid}").status_code == 404
            assert (
                client.post(
                    f"{API}/chat/conversations/{cid}/messages",
                    json={"content": "hi"},
                ).status_code
                == 404
            )
            assert client.delete(f"{API}/chat/conversations/{cid}").status_code == 404
    finally:
        with psycopg2.connect(DB_URL) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT 1 FROM chat_conversations WHERE id=%s", (cid,)
                )
                assert cur.fetchone() is not None, "org_2 row must persist"
                cur.execute("DELETE FROM chat_conversations WHERE id=%s", (cid,))
                conn.commit()


def test_attached_resume_live_flow():
    import pymupdf as fitz

    doc = fitz.open()
    page1 = doc.new_page()
    page1.insert_text(
        (50, 72),
        "Alex Rivera\nSoftware Engineer\nEmail: alex@example.com\n"
        "Education: Bachelor of Science in Computer Science, State University, 2021.\n"
        "Technical Skills: Python, TypeScript, React, PostgreSQL, Docker, Git.\n"
        "Experience: Software Developer at Tech Corp, building financial APIs.",
    )
    pdf_bytes = doc.tobytes()
    doc.close()

    with httpx.Client(base_url=BASE_URL, timeout=120) as client:
        # Upload resume PDF
        files = {
            "file": ("Alex_Rivera_Resume.pdf", pdf_bytes, "application/pdf")
        }
        data = {"document_type": "other"}
        upload_resp = client.post(f"{API}/documents/upload", files=files, data=data)
        assert upload_resp.status_code == 200, upload_resp.text
        doc_id = upload_resp.json()["document_id"]

        # Index resume
        index_resp = client.post(f"{API}/knowledge/index/{doc_id}")
        assert index_resp.status_code == 200, index_resp.text

        cid = _new_conversation(client)

        # Turn 1: Ask name of person
        ans1 = _ask(
            client,
            cid,
            "What is name of person who resume is this?",
            attachments=[doc_id],
        )
        assert ans1["outcome"] in ("answered", "unavailable")
        assert len(ans1["citations"]) >= 1
        assert ans1["citations"][0]["filename"] == "Alex_Rivera_Resume.pdf"
        assert ans1["citations"][0]["page_number"] == 1

        # Turn 2: Follow-up asking for summary without re-attaching
        ans2 = _ask(
            client,
            cid,
            "Summarize the education and technical skills listed in my attached resume.",
            attachments=None,
        )
        assert ans2["outcome"] in ("answered", "unavailable")
        assert len(ans2["citations"]) >= 1
        assert any(c["filename"] == "Alex_Rivera_Resume.pdf" for c in ans2["citations"])

        # Turn 3: Ask for missing evidence
        ans3 = _ask(
            client,
            cid,
            "What is the patent number listed in the attached resume?",
            attachments=None,
        )
        assert ans3["outcome"] == "insufficient_evidence"

        # Cleanup
        client.delete(f"{API}/chat/conversations/{cid}")

