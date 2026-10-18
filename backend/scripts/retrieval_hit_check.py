"""Retrieval-only hit-rate check (no LLM, no Groq calls).

Builds the same 2-document corpus as the main benchmark and measures whether
the known answer string appears in top-1 and top-5 retrieved chunks for each
answerable question. With only 2 chunks in the corpus, hit@5 is corpus
coverage; hit@1 is the discriminating metric.

    cd backend && .venv/Scripts/python scripts/retrieval_hit_check.py
"""

import json
import os
import sys
import uuid
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_DIR.parent
DATA_DIR = REPO_ROOT / "data" / "synthetic"

os.environ["DATABASE_URL"] = os.environ.get(
    "BENCH_DATABASE_URL", "sqlite:///:memory:"
)
sys.path.insert(0, str(BACKEND_DIR))

import numpy as np  # noqa: E402

from app.db.init_db import init_db  # noqa: E402
from app.db.session import SessionLocal  # noqa: E402
from app.models.document import Document  # noqa: E402
from app.models.document_page import DocumentPage  # noqa: E402
from app.services import document_parser, indexing_service, retrieval_service  # noqa: E402
from app.services.embedding_service import SentenceTransformerEmbeddingProvider  # noqa: E402
from app.core.config import settings  # noqa: E402

ORG = "org_hit"
init_db()
db = SessionLocal()
embedder = SentenceTransformerEmbeddingProvider()

for name, doc_type in (
    ("invoice_acme_2026_0001.pdf", "invoice"),
    ("vendor_policy_acme.pdf", "vendor_policy"),
):
    raw = (DATA_DIR / name).read_bytes()
    _text, pages = document_parser.extract_pdf_text(raw)
    doc = Document(
        id=str(uuid.uuid4()), organization_id=ORG, original_filename=name,
        document_type=doc_type, processing_status="completed",
        page_count=len(pages), file_size=len(raw),
        file_hash=document_parser.compute_file_hash(raw),
    )
    db.add(doc)
    for page in pages:
        db.add(DocumentPage(
            id=str(uuid.uuid4()), organization_id=ORG, document_id=doc.id,
            page_number=page["page"], content=page["text"],
            char_count=len(page["text"]),
        ))
    db.commit()
    indexing_service.index_document(db, doc, embedder)

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
]

embedder.embed_query("warm up")  # exclude model load from nothing; just ensure loaded

hit1 = hit5 = 0
rows = []
for q, key in QUESTIONS:
    t1 = retrieval_service.retrieve(db, q, ORG, embedder, top_k=1)
    t5 = retrieval_service.retrieve(db, q, ORG, embedder, top_k=5)
    in1 = any(key in (p["content"] or "").lower() for p in t1)
    in5 = any(key in (p["content"] or "").lower() for p in t5)
    hit1 += in1
    hit5 += in5
    rows.append({"q": q, "key": key, "hit_at_1": in1, "hit_at_5": in5,
                 "top1_score": t1[0]["score"] if t1 else None})

out = {
    "questions": len(QUESTIONS),
    "corpus_chunks": 2,
    "hit_at_1_pct": 100.0 * hit1 / len(QUESTIONS),
    "hit_at_5_pct": 100.0 * hit5 / len(QUESTIONS),
    "per_question": rows,
}
path = BACKEND_DIR / "scripts" / "retrieval_hit_results.json"
path.write_text(json.dumps(out, indent=2), encoding="utf-8")
print(json.dumps({k: v for k, v in out.items() if k != "per_question"}, indent=2))
print("missed at top-1:", [r["q"] for r in rows if not r["hit_at_1"]])
print(f"-> {path}")
