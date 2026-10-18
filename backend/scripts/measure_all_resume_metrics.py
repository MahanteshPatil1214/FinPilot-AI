"""Resume-metrics benchmark for FinPilot AI (corrected, instrumented).

Unlike the earlier draft, this script:
  * instruments every LangGraph node so agent steps/retries are COUNTED, not assumed;
  * computes link precision/recall for reconciliation against seeded ground truth;
  * runs 20 realistic RAG questions (18 answerable + 2 unanswerable) through the
    REAL Groq model configured in backend/.env, with warm-up excluded from timings;
  * includes a pure-engine reconciliation throughput test at 1,000+ invoices.

Run from the backend directory (picks up backend/.env for GROQ_API_KEY):

    cd backend
    .venv/Scripts/python scripts/measure_all_resume_metrics.py

Output: scripts/benchmark_results.json
"""

import json
import os
import re
import sys
import threading
import time
import uuid
from collections import defaultdict
from datetime import date
from decimal import Decimal
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_DIR.parent
DATA_DIR = REPO_ROOT / "data" / "synthetic"
FRONTEND_DIR = REPO_ROOT / "frontend"

os.environ["DATABASE_URL"] = os.environ.get(
    "BENCH_DATABASE_URL", "sqlite:///:memory:"
)
sys.path.insert(0, str(BACKEND_DIR))

import numpy as np  # noqa: E402

import logging  # noqa: E402

logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("groq").setLevel(logging.WARNING)
logging.getLogger("sentence_transformers").setLevel(logging.WARNING)

from app.core.config import settings  # noqa: E402
from app.db.base import Base  # noqa: E402
from app.db.init_db import init_db  # noqa: E402
from app.db.session import SessionLocal  # noqa: E402
import app.models  # noqa: E402, F401
from app.main import app as fastapi_app  # noqa: E402

from app.models.document import Document  # noqa: E402
from app.models.document_chunk import DocumentChunk  # noqa: E402
from app.models.document_page import DocumentPage  # noqa: E402
from app.models.invoice import Invoice  # noqa: E402
from app.models.transaction import BankTransaction  # noqa: E402
from app.models.reconciliation_match import ReconciliationMatch  # noqa: E402

from app.services import (  # noqa: E402
    csv_importer,
    document_parser,
    indexing_service,
    investigation_service,
    rag_service,
    reconciliation_service,
    retrieval_service,
)
from app.services.embedding_service import SentenceTransformerEmbeddingProvider  # noqa: E402
from app.services.llm_client import GroqLLMClient, LLMError  # noqa: E402
from app.agents.nodes import MAX_RETRIES  # noqa: E402
import app.agents.graph as graph_module  # noqa: E402

ORG = "org_bench"
results: dict = {}


def pct(values, q):
    return float(np.percentile(values, q)) if values else None


# ------------------------------------------------------------- 1. CODE SCALE
print("--> [1/5] codebase scale")

ext_map = {
    ".py": "Python",
    ".ts": "TypeScript",
    ".tsx": "TypeScript (React)",
    ".css": "CSS",
    ".html": "HTML",
    ".yml": "YAML",
    ".yaml": "YAML",
    ".md": "Markdown",
    ".sql": "SQL",
}
ignore_dirs = {
    ".venv", "node_modules", ".git", ".pytest_cache", "__pycache__",
    "dist", "test-results", "test-results-live", "storage", ".coverage",
}
ignore_files = {"package-lock.json"}

loc = defaultdict(lambda: {"files": 0, "total_lines": 0, "code_lines": 0})
for root, dirs, files in os.walk(REPO_ROOT):
    dirs[:] = [d for d in dirs if d not in ignore_dirs]
    for fname in files:
        ext = os.path.splitext(fname)[1].lower()
        if ext not in ext_map or fname in ignore_files:
            continue
        path = Path(root) / fname
        try:
            lines = path.read_text(encoding="utf-8", errors="ignore").splitlines()
        except OSError:
            continue
        lang = ext_map[ext]
        loc[lang]["files"] += 1
        loc[lang]["total_lines"] += len(lines)
        for line in lines:
            s = line.strip()
            if not s or s.startswith("#") or s.startswith("//") or s.startswith("*"):
                continue
            loc[lang]["code_lines"] += 1
results["loc"] = dict(loc)

endpoint_rows = set()
for route in fastapi_app.routes:
    methods = getattr(route, "methods", None)
    if not methods:
        continue
    for method in methods:
        if method in ("HEAD", "OPTIONS"):
            continue
        endpoint_rows.add((method, route.path))
results["api_endpoints"] = {
    "total": len(endpoint_rows),
    "v1": len([r for r in endpoint_rows if r[1].startswith("/api/v1")]),
}

results["db_tables"] = {
    "count": len(Base.metadata.tables),
    "names": sorted(Base.metadata.tables.keys()),
}

graph_src = (BACKEND_DIR / "app" / "agents" / "graph.py").read_text(encoding="utf-8")
langgraph_nodes = re.findall(r'graph\.add_node\(\s*"(\w+)"', graph_src)
tools_src = (BACKEND_DIR / "app" / "agents" / "tools.py").read_text(encoding="utf-8")
tool_funcs = re.findall(r"^def (\w+)\(", tools_src, re.M)
orchestrator_src = (BACKEND_DIR / "app" / "agents" / "chat" / "orchestrator.py").read_text(encoding="utf-8")
chat_intents = re.findall(r"router\.(\w+): _handle_", orchestrator_src)
results["agents"] = {
    "langgraph_nodes": langgraph_nodes,
    "langgraph_node_count": len(langgraph_nodes),
    "investigation_tools": tool_funcs,
    "investigation_tool_count": len(tool_funcs),
    "chat_intent_handlers": sorted(set(chat_intents)),
    "chat_intent_handler_count": len(set(chat_intents)),
    "max_retries_enforced": MAX_RETRIES,
}

react_components = []
react_tsx_files = 0
for path in (FRONTEND_DIR / "src").rglob("*.tsx"):
    react_tsx_files += 1
    text = path.read_text(encoding="utf-8", errors="ignore")
    for match in re.finditer(
        r"export\s+(?:default\s+)?(?:function|const)\s+([A-Z][A-Za-z0-9_]*)", text
    ):
        react_components.append(match.group(1))
results["frontend"] = {
    "tsx_files": react_tsx_files,
    "exported_components": len(set(react_components)),
}

# --------------------------------------------------------- 2. BOOT + INGEST
print("--> [2/5] ingest sample corpus")
init_db()
db = SessionLocal()
embedder = SentenceTransformerEmbeddingProvider()


class RateLimitedLLM:
    """Wraps GroqLLMClient so calls are spaced ``min_interval_s`` apart.

    The Groq free tier returns 429 when requests fire back-to-back; spacing
    every call (including the SDK's own retries) keeps the run steady.
    """

    def __init__(self, inner, min_interval_s: float = 2.5):
        self._inner = inner
        self._min_interval = min_interval_s
        self._lock = threading.Lock()
        self._next_allowed = 0.0

    def answer(self, system_prompt: str, user_prompt: str) -> str:
        with self._lock:
            now = time.monotonic()
            wait = self._next_allowed - now
            self._next_allowed = max(now, self._next_allowed) + self._min_interval
        if wait > 0:
            time.sleep(wait)
        return self._inner.answer(system_prompt, user_prompt)


llm = RateLimitedLLM(GroqLLMClient(), min_interval_s=2.5)


def ingest_pdf(name, doc_type):
    raw = (DATA_DIR / name).read_bytes()
    _text, pages = document_parser.extract_pdf_text(raw)
    doc = Document(
        id=str(uuid.uuid4()),
        organization_id=ORG,
        original_filename=name,
        document_type=doc_type,
        processing_status="completed",
        page_count=len(pages),
        file_size=len(raw),
        file_hash=document_parser.compute_file_hash(raw),
    )
    db.add(doc)
    for page in pages:
        db.add(DocumentPage(
            id=str(uuid.uuid4()),
            organization_id=ORG,
            document_id=doc.id,
            page_number=page["page"],
            content=page["text"],
            char_count=len(page["text"]),
        ))
    db.commit()
    return doc, pages


inv_doc, inv_pages = ingest_pdf("invoice_acme_2026_0001.pdf", "invoice")
pol_doc, pol_pages = ingest_pdf("vendor_policy_acme.pdf", "vendor_policy")

csv_stats = {}
all_csv_rows = []
for csv_name in ("bank_statement_2026_01.csv", "bank_transactions.csv"):
    parsed = csv_importer.parse_transactions_csv((DATA_DIR / csv_name).read_bytes())
    from app.repositories.transaction_repository import create_transactions
    created = create_transactions(db, parsed["rows"], ORG, str(uuid.uuid4()))
    csv_stats[csv_name] = len(created)
    all_csv_rows.extend(created)

t0 = time.perf_counter()
chunks_inv = indexing_service.index_document(db, inv_doc, embedder)
chunks_pol = indexing_service.index_document(db, pol_doc, embedder)
index_ms = (time.perf_counter() - t0) * 1000

# A cold run pays the one-time embedding-model load inside index time; measure
# a warm re-index of both documents so the reported figure is steady-state.
t0 = time.perf_counter()
indexing_service.index_document(db, inv_doc, embedder)
indexing_service.index_document(db, pol_doc, embedder)
index_warm_ms = (time.perf_counter() - t0) * 1000

all_chunks = db.query(DocumentChunk).filter(
    DocumentChunk.organization_id == ORG
).all()
chunk_sizes = [len(c.content) for c in all_chunks]

# create the invoice record the PDF describes (extractor output, not hardcoded)
inv_text, _ = document_parser.extract_pdf_text((DATA_DIR / "invoice_acme_2026_0001.pdf").read_bytes())
fields = document_parser.extract_invoice_fields(inv_text)
invoice = Invoice(
    id=str(uuid.uuid4()),
    organization_id=ORG,
    invoice_number=fields["invoice_number"],
    vendor_id="acme_supplies",
    invoice_date=fields["invoice_date"],
    due_date=fields["due_date"],
    currency=fields["currency"],
    total_amount=Decimal(fields["total_amount"]),
    extraction_status="completed",
    source_document_id=inv_doc.id,
)
db.add(invoice)
db.commit()

results["corpus"] = {
    "pdf_documents_ingested": 2,
    "pdf_pages": len(inv_pages) + len(pol_pages),
    "csv_files": 2,
    "csv_rows_imported": sum(csv_stats.values()),
    "csv_rows_by_file": csv_stats,
    "chunks_indexed": chunks_inv + chunks_pol,
    "chunk_size_chars_mean": float(np.mean(chunk_sizes)),
    "chunk_size_chars_min": int(min(chunk_sizes)),
    "chunk_size_chars_max": int(max(chunk_sizes)),
    "embedding_model": settings.EMBEDDING_MODEL_NAME,
    "embedding_dim": settings.EMBEDDING_DIM,
    "chunk_size_setting": settings.RAG_CHUNK_SIZE,
    "chunk_overlap_setting": settings.RAG_CHUNK_OVERLAP,
    "index_time_cold_ms": index_ms,
    "index_time_warm_ms": index_warm_ms,
    "extracted_invoice": {
        "invoice_number": fields["invoice_number"],
        "total_amount": fields["total_amount"],
        "invoice_date": str(fields["invoice_date"]),
        "due_date": str(fields["due_date"]),
    },
}

# ------------------------------------------------------------- 3. RAG BENCH
print("--> [3/5] RAG benchmark (live Groq)")

QUESTIONS = [
    ("What is the invoice number on the tax invoice?", "inv-2026-0001"),
    ("What is the total amount on invoice INV-2026-0001?", "12,000.00"),
    ("What is the invoice date?", "05/01/2026"),
    ("What is the due date on the invoice?", "05/02/2026"),
    ("Who is the buyer named on the invoice?", "northwind traders"),
    ("Who is the vendor named on the invoice?", "acme supplies"),
    ("What service is billed on the invoice?", "consulting services"),
    ("How many units were invoiced?", "10 units"),
    ("What currency is the invoice denominated in?", "inr"),
    ("What payment terms are stated on the invoice?", "net 30"),
    ("What early payment discount does the vendor grant?", "300.00"),
    ("Under what condition is the discount granted?", "early-settlement"),
    ("Does the policy allow full settlement below the invoiced total?", "closing the invoice"),
    ("What is the name of the vendor payment policy document?", "vendor payment policy"),
    ("Which company issued the vendor payment policy?", "acme supplies private limited"),
    ("Which invoice number does the vendor policy apply to?", "inv-2026-0001"),
    ("What kind of discount is described in the policy?", "early payment discount"),
    ("Within what window must the buyer settle to earn the discount?", "settles in full"),
    # unanswerable controls: correct behaviour is abstention
    ("What is the annual revenue of Northwind Traders?", None),
    ("What bank account number should be used for payment?", None),
]

# warm-up: model load + one live LLM round-trip (excluded from timings)
embedder.embed_query("warm up")
try:
    llm.answer("Reply with OK.", "warm up")
except Exception:
    pass

TOP_K = settings.RAG_TOP_K
MIN_SCORE = settings.RAG_MIN_SCORE

retrieval_ms, e2e_ms = [], []
answered = abstained_correctly = citations_present = 0
hit = 0
answerable = 0
abstain_expected = 0
abstain_correct = 0
failures = []
per_question = []

for question, key in QUESTIONS:
    t0 = time.perf_counter()
    passages = retrieval_service.retrieve(db, question, ORG, embedder, top_k=TOP_K)
    retrieval_ms.append((time.perf_counter() - t0) * 1000)

    t0 = time.perf_counter()
    try:
        result = rag_service.answer_question(
            db=db, query=question, organization_id=ORG,
            embedder=embedder, llm=llm, top_k=TOP_K, min_score=MIN_SCORE,
        )
    except (LLMError, Exception) as exc:  # record provider failures honestly
        failures.append({"question": question, "error": type(exc).__name__})
        continue
    e2e_ms.append((time.perf_counter() - t0) * 1000)

    is_cited = bool(result.get("citations"))
    if is_cited:
        citations_present += 1
    status = result.get("status")
    if key is None:
        abstain_expected += 1
        if status == "insufficient_evidence":
            abstain_correct += 1
    else:
        answerable += 1
        if status == "answered":
            answered += 1
        if any(key in (p["content"] or "").lower() for p in passages):
            hit += 1
    per_question.append({
        "q": question, "status": status, "cited": is_cited,
        "top_scores": [p["score"] for p in passages[:3]],
    })

n_total = len(failures) + len(e2e_ms)
results["rag"] = {
    "questions_total": n_total,
    "answerable_questions": answerable,
    "unanswerable_controls": abstain_expected,
    "top_k": TOP_K,
    "min_score": MIN_SCORE,
    "retrieval_latency_mean_ms": float(np.mean(retrieval_ms)),
    "retrieval_latency_p95_ms": pct(retrieval_ms, 95),
    "e2e_latency_mean_ms": float(np.mean(e2e_ms)),
    "e2e_latency_p95_ms": pct(e2e_ms, 95),
    "answer_generation_model": settings.GROQ_MODEL_NAME,
    "citation_share_pct": 100.0 * citations_present / n_total,
    "retrieval_hit_rate_pct_of_answerable": 100.0 * hit / answerable if answerable else None,
    "abstention_accuracy_pct": 100.0 * abstain_correct / abstain_expected if abstain_expected else None,
    "llm_failures": failures,
    "per_question": per_question,
}

# ----------------------------------------------------- 4. RECONCILIATION
print("--> [4/5] reconciliation engine")

# 4a. repo sample data: 5 CSV rows + 1 extracted invoice
t0 = time.perf_counter()
sample_summary = reconciliation_service.run_reconciliation(db, ORG, date_window_days=30)
sample_ms = (time.perf_counter() - t0) * 1000
sample_counts = sample_summary["counts"]

# 4b. seeded synthetic benchmark with ground truth
BENCH_ORG = "org_synthetic"
TRUE_LINKS = set()          # (invoice_number, txn_ref)
TXN_EXPECTED = {}           # txn_id -> expected class

synthetic_invoices, synthetic_txns = [], []

for i in range(1, 26):      # 25 exact
    num, ref = f"SV-EXACT-{i:04d}", f"SV-EXACT-{i:04d}"
    amt = Decimal(1000 * i)
    synthetic_invoices.append(Invoice(
        id=f"inv_ex_{i}", organization_id=BENCH_ORG, invoice_number=num,
        currency="INR", total_amount=amt,
        invoice_date=date(2026, 1, 1), due_date=date(2026, 1, 31),
        extraction_status="completed",
    ))
    synthetic_txns.append(BankTransaction(
        id=f"txn_ex_{i}", organization_id=BENCH_ORG, transaction_reference=ref,
        description=f"Payment for {num}", amount=amt, currency="INR",
        transaction_date=date(2026, 1, 10), counterparty="Vendor Corp",
    ))
    TRUE_LINKS.add((num, ref))
    TXN_EXPECTED[f"txn_ex_{i}"] = "exact_match"

for i in range(1, 11):      # 10 partial (200 short)
    num, ref = f"SV-PART-{i:04d}", f"SV-PART-{i:04d}"
    amt_inv = Decimal(5000 + 100 * i)
    synthetic_invoices.append(Invoice(
        id=f"inv_pa_{i}", organization_id=BENCH_ORG, invoice_number=num,
        currency="INR", total_amount=amt_inv,
        invoice_date=date(2026, 1, 1), due_date=date(2026, 1, 31),
        extraction_status="completed",
    ))
    synthetic_txns.append(BankTransaction(
        id=f"txn_pa_{i}", organization_id=BENCH_ORG, transaction_reference=ref,
        description=f"Payment for {num} with discount", amount=amt_inv - Decimal(200),
        currency="INR", transaction_date=date(2026, 1, 10), counterparty="Vendor Corp",
    ))
    TRUE_LINKS.add((num, ref))
    TXN_EXPECTED[f"txn_pa_{i}"] = "partial_match"

for i in range(1, 6):       # 5 duplicate-reference pairs -> ambiguous
    num = f"SV-AMB-{i:04d}"
    amt = Decimal(2000 + i)
    synthetic_invoices.append(Invoice(
        id=f"inv_am_{i}", organization_id=BENCH_ORG, invoice_number=num,
        currency="INR", total_amount=amt,
        invoice_date=date(2026, 1, 1), due_date=date(2026, 1, 31),
        extraction_status="completed",
    ))
    for suffix in ("a", "b"):
        synthetic_txns.append(BankTransaction(
            id=f"txn_am_{i}_{suffix}", organization_id=BENCH_ORG,
            transaction_reference=num, description=f"Duplicate {suffix} for {num}",
            amount=amt, currency="INR", transaction_date=date(2026, 1, 10),
            counterparty="Vendor Corp",
        ))
        TXN_EXPECTED[f"txn_am_{i}_{suffix}"] = "ambiguous"

for i in range(1, 11):      # 10 orphan transactions
    synthetic_txns.append(BankTransaction(
        id=f"txn_or_{i}", organization_id=BENCH_ORG,
        transaction_reference=f"SV-ORPHAN-{i:04d}", description=f"Standalone charge {i}",
        amount=Decimal(750 + 10 * i), currency="INR",
        transaction_date=date(2026, 1, 15), counterparty="Bank Services",
    ))
    TXN_EXPECTED[f"txn_or_{i}"] = "unmatched"

for row in synthetic_invoices + synthetic_txns:
    db.add(row)
db.commit()

t0 = time.perf_counter()
bench_summary = reconciliation_service.run_reconciliation(db, BENCH_ORG, date_window_days=30)
bench_ms = (time.perf_counter() - t0) * 1000

bench_rows = db.query(ReconciliationMatch).filter(
    ReconciliationMatch.organization_id == BENCH_ORG
).all()

inv_number_by_id = {i.id: i.invoice_number for i in synthetic_invoices}
txn_ref_by_id = {t.id: t.transaction_reference for t in synthetic_txns}

predicted_links, correct_links = set(), 0
txn_status, inv_status = {}, {}
for row in bench_rows:
    if row.transaction_id:
        txn_status[row.transaction_id] = row.match_status
    if row.invoice_id:
        inv_status[row.invoice_id] = row.match_status
    if row.invoice_id and row.transaction_id and row.match_status in (
        "exact_match", "partial_match", "possible_match"
    ):
        pair = (inv_number_by_id[row.invoice_id], txn_ref_by_id[row.transaction_id])
        predicted_links.add(pair)
        if pair in TRUE_LINKS:
            correct_links += 1

AMBIGUOUS_OK = {"needs_review", "duplicate_candidate"}
status_correct = 0
confusion = defaultdict(lambda: defaultdict(int))
for txn_id, expected in TXN_EXPECTED.items():
    predicted = txn_status.get(txn_id, "unmatched_row_missing")
    confusion[expected][predicted] += 1
    if expected == "ambiguous":
        if predicted in AMBIGUOUS_OK:
            status_correct += 1
    elif predicted == expected:
        status_correct += 1

n_txn = len(TXN_EXPECTED)
link_precision = correct_links / len(predicted_links) if predicted_links else None
link_recall = correct_links / len(TRUE_LINKS) if TRUE_LINKS else None

results["reconciliation"] = {
    "sample_repo_data": {
        "transactions": len(all_csv_rows),
        "invoices": 1,
        "counts": sample_counts,
        "runtime_ms": sample_ms,
    },
    "synthetic_benchmark": {
        "transactions": len(synthetic_txns),
        "invoices": len(synthetic_invoices),
        "ground_truth_links": len(TRUE_LINKS),
        "counts": bench_summary["counts"],
        "runtime_ms": bench_ms,
        "link_precision_pct": 100.0 * link_precision if link_precision is not None else None,
        "link_recall_pct": 100.0 * link_recall if link_recall is not None else None,
        "per_transaction_status_accuracy_pct": 100.0 * status_correct / n_txn,
        "confusion": {k: dict(v) for k, v in confusion.items()},
    },
}

# 4c. pure-engine throughput at scale (no LLM, no embeddings).
# The reference phase is O(transactions x invoices) with a regex per pair, so
# both a small-business-sized (100) and a larger (1,000) point are measured.
def _build_scale_rows(n, org):
    invoices, txns = [], []
    for i in range(1, n + 1):
        num = f"SC-{i:05d}"
        amt = Decimal(100 + (i % 997))
        invoices.append(Invoice(
            id=f"sinv_{n}_{i}", organization_id=org, invoice_number=num,
            currency="INR", total_amount=amt,
            invoice_date=date(2026, 1, 1), due_date=date(2026, 1, 31),
            extraction_status="completed",
        ))
        txns.append(BankTransaction(
            id=f"stxn_{n}_{i}", organization_id=org, transaction_reference=num,
            description=f"Pay {num}", amount=amt, currency="INR",
            transaction_date=date(2026, 1, 10), counterparty="Vendor",
        ))
    return invoices, txns


scale_points = {}
for n in (100, 1000):
    s_inv, s_txn = _build_scale_rows(n, f"org_scale_{n}")
    t0 = time.perf_counter()
    scale_results = reconciliation_service.build_matches(s_inv, s_txn, 30)
    scale_ms = (time.perf_counter() - t0) * 1000
    scale_points[f"{n}_pairs"] = {
        "invoices": n, "transactions": n, "result_rows": len(scale_results),
        "counts": reconciliation_service.summarize(scale_results),
        "runtime_ms": scale_ms,
        "transactions_per_second": n / (scale_ms / 1000) if scale_ms > 0 else None,
    }
results["reconciliation"]["scale_tests"] = scale_points
results["reconciliation"].pop("scale_1000_pairs", None)

# ------------------------------------------------------- 5. AGENT WORKFLOW
print("--> [5/5] instrumented LangGraph investigation runs")

step_log: list = []
current_steps: list = []
_original_make_nodes = graph_module.make_nodes


def _instrumented_make_nodes(db_, embedder_, llm_):
    nodes = _original_make_nodes(db_, embedder_, llm_)
    wrapped = {}
    for name, fn in nodes.items():
        def make_wrapper(node_name, node_fn):
            def wrapper(state):
                current_steps.append(node_name)
                return node_fn(state)
            return wrapper
        wrapped[name] = make_wrapper(name, fn)
    return wrapped


graph_module.make_nodes = _instrumented_make_nodes

# run reconciliation for the scale org is not needed; cases below use existing orgs
cases = []
# case 1: the demo partial match (difference explained by policy evidence)
cases.append(("demo_partial_explained", ORG, invoice.id))
# case 2: exact-match synthetic invoice
cases.append(("exact_match", BENCH_ORG, "inv_ex_1"))
# case 3: ambiguous duplicate-reference invoice
cases.append(("ambiguous_duplicate", BENCH_ORG, "inv_am_1"))
# case 4: partial synthetic invoice with NO indexed policy evidence
cases.append(("partial_no_policy_evidence", BENCH_ORG, "inv_pa_1"))
# case 5: invoice with no reconciliation record at all
orphan = Invoice(
    id=str(uuid.uuid4()), organization_id=BENCH_ORG, invoice_number="SV-ORPHAN-INV",
    currency="INR", total_amount=Decimal("9999.00"), extraction_status="completed",
)
db.add(orphan)
db.commit()
cases.append(("no_reconciliation_record", BENCH_ORG, orphan.id))

case_runs = []
all_steps, retry_runs, escalated = [], 0, 0

for label, org, inv_id in cases:
    investigation = investigation_service.create_investigation(
        db, org, created_by="benchmark", invoice_id=inv_id
    )
    current_steps = []
    t0 = time.perf_counter()
    investigation = investigation_service.run_investigation(db, investigation, embedder, llm)
    runtime_ms = (time.perf_counter() - t0) * 1000
    steps = list(current_steps)
    generate_report_calls = steps.count("generate_report")
    retries = max(0, generate_report_calls - 1)
    escalated_here = "human_review" in steps
    all_steps.append(len(steps))
    if retries:
        retry_runs += 1
    if escalated_here:
        escalated += 1
    case_runs.append({
        "case": label,
        "status": investigation.status,
        "llm_used": investigation.model_name,
        "steps": steps,
        "step_count": len(steps),
        "validation_retries": retries,
        "escalated_to_human_review": escalated_here,
        "runtime_ms": runtime_ms,
    })

graph_module.make_nodes = _original_make_nodes

results["agent_workflow"] = {
    "cases_run": len(case_runs),
    "node_invocations_counted": True,
    "max_retries_enforced": MAX_RETRIES,
    "avg_steps_per_run": float(np.mean(all_steps)),
    "min_steps": int(min(all_steps)),
    "max_steps": int(max(all_steps)),
    "runs_with_validation_retry": retry_runs,
    "evidence_sufficiency_retry_note": (
        "assess_evidence_sufficiency has a fixed edge to generate_report; "
        "it escalates to human review rather than retrying. Retries are "
        "triggered only by report-validation failures."
    ),
    "escalated_to_human_review": escalated,
    "escalation_rate_pct": 100.0 * escalated / len(case_runs),
    "cases": case_runs,
}

out_path = BACKEND_DIR / "scripts" / "benchmark_results.json"
out_path.write_text(json.dumps(results, indent=2, default=str), encoding="utf-8")
print(f"done -> {out_path}")
