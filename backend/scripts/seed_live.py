"""Seed a running FinPilot instance with the synthetic demo dataset.

This is the bridge between the generated fixtures (``generate_fixtures.py``) and
a live backend + database. It drives the *public HTTP API only* for all
mutations, so it exercises exactly the same code paths as a real client. It is
used two ways:

* as the one-shot demo seeder::

      python scripts/seed_live.py --reset

* from the non-mocked Playwright integration spec, which lives under
  ``frontend/tests/integration/`` and is gated by ``RUN_INTEGRATION=1``. The
  spec runs against a live backend started from the repo.

The script is idempotent: documents are skipped when a file with the same name
already exists, transaction import de-duplicates by reference, and a
reconciliation run replaces the previous results. ``--reset`` first truncates
every table and clears the stored files for a clean slate.

Standalone (fixtures only, no backend)::

    python scripts/generate_fixtures.py
"""

from __future__ import annotations

import argparse
import json
import mimetypes
import os
import sys
import uuid
from pathlib import Path

# Resolve the repo layout before importing app modules so the DB/config resolve
# the same way they do for the running backend.
BACKEND_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_DIR.parent
DATA_DIR = REPO_ROOT / "data" / "synthetic"
sys.path.insert(0, str(BACKEND_DIR))

os.environ.setdefault(
    "DATABASE_URL", "postgresql://postgres:postgres@localhost:5433/finpilot"
)
os.environ.setdefault("GROQ_API_KEY", "")

INVOICE_PDF = DATA_DIR / "invoice_acme_2026_0001.pdf"
POLICY_PDF = DATA_DIR / "vendor_policy_acme.pdf"
BANK_CSV = DATA_DIR / "bank_statement_2026_01.csv"


# --------------------------------------------------------------------------- #
# HTTP helpers (stdlib only, so the script has no extra dependencies)
# --------------------------------------------------------------------------- #
def _request(method: str, url: str, *, data=None, headers=None, timeout=120):
    import urllib.error
    import urllib.request

    req = urllib.request.Request(url, data=data, headers=headers or {}, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read()
            return resp.status, _decode(body)
    except urllib.error.HTTPError as exc:
        return exc.code, _decode(exc.read())


def _decode(body: bytes):
    text = body.decode("utf-8", errors="replace")
    try:
        return json.loads(text)
    except ValueError:
        return text


def _post_json(base_url: str, path: str, payload):
    data = json.dumps(payload).encode()
    return _request(
        "POST",
        base_url + path,
        data=data,
        headers={"Content-Type": "application/json"},
    )


def _post_file(base_url: str, path: str, filename: str, content: bytes, field="file"):
    boundary = "----finpilot" + uuid.uuid4().hex
    content_type = mimetypes.guess_type(filename)[0] or "application/octet-stream"
    body = bytearray()
    body += f"--{boundary}\r\n".encode()
    body += (
        f'Content-Disposition: form-data; name="{field}"; filename="{filename}"\r\n'
    ).encode()
    body += f"Content-Type: {content_type}\r\n\r\n".encode()
    body += content + b"\r\n"
    body += f"--{boundary}--\r\n".encode()
    headers = {
        "Content-Type": f"multipart/form-data; boundary={boundary}",
        "Content-Length": str(len(body)),
    }
    return _request("POST", base_url + path, data=bytes(body), headers=headers)


def _post_multipart(base_url: str, path: str, fields: dict, files: dict):
    """Multipart with simple text fields plus one or more file parts."""
    boundary = "----finpilot" + uuid.uuid4().hex
    body = bytearray()
    for name, value in fields.items():
        body += f"--{boundary}\r\n".encode()
        body += f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode()
        body += f"{value}\r\n".encode()
    for name, (filename, content, content_type) in files.items():
        body += f"--{boundary}\r\n".encode()
        body += (
            f'Content-Disposition: form-data; name="{name}"; '
            f'filename="{filename}"\r\n'
        ).encode()
        body += f"Content-Type: {content_type}\r\n\r\n".encode()
        body += content + b"\r\n"
    body += f"--{boundary}--\r\n".encode()
    headers = {
        "Content-Type": f"multipart/form-data; boundary={boundary}",
        "Content-Length": str(len(body)),
    }
    return _request("POST", base_url + path, data=bytes(body), headers=headers)


# --------------------------------------------------------------------------- #
# Database reset (direct, so it works without extra endpoints)
# --------------------------------------------------------------------------- #
def reset_database() -> None:
    import app.models  # noqa: F401  (registers all models on Base.metadata)
    from app.db.base import Base
    from app.db.init_db import init_db
    from app.db.session import engine

    init_db()
    with engine.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            conn.execute(table.delete())

    from app.core.config import settings

    documents_dir = Path(settings.STORAGE_DIR) / "documents"
    if documents_dir.is_dir():
        for child in documents_dir.iterdir():
            if child.is_file():
                child.unlink()


# --------------------------------------------------------------------------- #
# Seed steps
# --------------------------------------------------------------------------- #
def _existing_filenames(base_url: str) -> set:
    status, body = _request("GET", base_url + "/api/v1/documents", timeout=30)
    if status != 200 or not isinstance(body, dict):
        return set()
    return {item.get("original_filename") for item in body.get("items", [])}


def _upload_pdf(base_url: str, path: Path, document_type: str, existing: set):
    if path.name in existing:
        print(f"  skip upload (exists): {path.name}")
        return None
    status, body = _post_multipart(
        base_url,
        "/api/v1/documents/upload",
        {"document_type": document_type},
        {"file": (path.name, path.read_bytes(), "application/pdf")},
    )
    if status != 200:
        raise SystemExit(f"upload failed for {path.name}: {status} {body}")
    print(f"  uploaded {path.name} -> document {body['document_id']} (type={document_type})")
    return body


def seed(
    base_url: str,
    *,
    index: bool,
    create_investigation: bool,
) -> dict:
    if not INVOICE_PDF.exists() or not POLICY_PDF.exists() or not BANK_CSV.exists():
        raise SystemExit(
            "fixtures missing; run `python scripts/generate_fixtures.py` first"
        )

    print("Seeding documents...")
    existing = _existing_filenames(base_url)
    invoice_upload = _upload_pdf(base_url, INVOICE_PDF, "invoice", existing)
    policy_upload = _upload_pdf(base_url, POLICY_PDF, "policy", existing)

    print("Importing bank statement...")
    status, body = _post_file(
        base_url, "/api/v1/transactions/import", BANK_CSV.name, BANK_CSV.read_bytes()
    )
    if status != 200:
        raise SystemExit(f"transaction import failed: {status} {body}")
    print(
        f"  imported={body['imported']} duplicates={body['duplicates']} "
        f"total_rows={body['total_rows']}"
    )

    print("Running reconciliation...")
    status, body = _post_json(base_url, "/api/v1/reconciliation/run", {})
    if status != 200:
        raise SystemExit(f"reconciliation failed: {status} {body}")
    print(f"  matches={body['total_matches']} counts={body['counts']}")

    if index:
        print("Indexing documents...")
        for upload in (invoice_upload, policy_upload):
            if not upload:
                continue
            doc_id = upload["document_id"]
            st, bd = _post_json(base_url, f"/api/v1/knowledge/index/{doc_id}", {})
            if st != 200:
                raise SystemExit(f"indexing failed for {doc_id}: {st} {bd}")
            print(f"  indexed {doc_id} -> {bd['chunks_indexed']} chunk(s)")

    if create_investigation:
        print("Creating investigation from the partial match...")
        status, results = _request(
            "GET",
            base_url + "/api/v1/reconciliation/results?status=partial_match",
            timeout=30,
        )
        match = next((m for m in results.get("items", []) if m.get("invoice_id")), None)
        if match is None:
            print("  no partial match with an invoice; skipping investigation")
        else:
            invoice_id = match["invoice_id"]
            st, created = _post_json(
                base_url, "/api/v1/investigations", {"invoice_id": invoice_id}
            )
            if st != 201:
                raise SystemExit(f"investigation create failed: {st} {created}")
            inv_id = created["id"]
            st, run = _post_json(
                base_url, f"/api/v1/investigations/{inv_id}/run", {}
            )
            if st != 200:
                raise SystemExit(f"investigation run failed: {st} {run}")
            print(f"  investigation {inv_id} -> status={run['status']}")

    print("Reading dashboard summary...")
    status, summary = _request("GET", base_url + "/api/v1/dashboard/summary", timeout=30)
    if status == 200:
        print(json.dumps(summary, indent=2, default=str))
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://localhost:8000")
    parser.add_argument(
        "--reset",
        action="store_true",
        help="truncate all tables and clear stored files before seeding",
    )
    parser.add_argument(
        "--index",
        action="store_true",
        help="index uploaded documents (loads the embedding model)",
    )
    parser.add_argument(
        "--no-investigation",
        action="store_true",
        help="do not create and run an investigation",
    )
    args = parser.parse_args()

    if args.reset:
        print("Resetting database and stored files...")
        reset_database()

    seed(
        args.base_url,
        index=args.index,
        create_investigation=not args.no_investigation,
    )
    print("Seed complete.")


if __name__ == "__main__":
    main()
