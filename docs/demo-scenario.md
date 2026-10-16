# Demo scenario: the 300.00 early-settlement discount

This walkthrough uses the synthetic dataset in `data/synthetic/` and the live,
seeded application. It takes about five minutes.

## Cast

| Artifact | What it is |
| --- | --- |
| `invoice_acme_2026_0001.pdf` | ACME Supplies invoice **INV-2026-0001** for **12,000.00**, due 2026-02-05. |
| `vendor_policy_acme.pdf` | ACME policy: a **300.00 discount** if the invoice is settled early. |
| `bank_statement_2026_01.csv` | Bank rows, including a **11,700.00** payment referencing INV-2026-0001. |

The payment is **300.00 short** of the invoice. The policy explains exactly why.

## Setup

```bash
docker compose up -d postgres
cd backend && alembic upgrade head
python scripts/seed_live.py --reset --index
uvicorn app.main:app --reload            # terminal 1
cd ../frontend && npm run dev            # terminal 2
```

`seed_live.py` uploads both documents, imports the CSV, runs reconciliation,
indexes the documents, and creates + runs one investigation from the partial
match. It prints a dashboard summary when it finishes.

## Walkthrough

### 1. Dashboard - the operations snapshot

Open <http://localhost:5173/dashboard>.

- Documents: **2**, indexed: **2**
- Invoices imported: **1**, transactions imported: **3**
- Reconciliation: **1 partial match**, 2 unmatched
- Investigations awaiting review: **1**

![Dashboard](screenshots/dashboard.png)

### 2. Document center - the sources

Open **Document center**. Both uploaded files are listed with their type and
processing status.

![Document center](screenshots/documents.png)

### 3. Reconciliation - the deterministic result

Open **Reconciliation**. Three rows are shown. The relevant one is a
**Partial match** with a difference of **+300.00**.

![Reconciliation](screenshots/reconciliation.png)

Press **Run reconciliation** again to show the result is stable and idempotent:
the same rules produce the same rows.

### 4. Investigation - cited evidence

Open **Investigations**. One investigation is in **Needs review**. Open it to see
the structured report: the discrepancy, the gathered evidence, and citations back
to the vendor policy that offers the 300.00 early-payment discount.

![Investigation report](screenshots/investigation-detail.png)

Note that the deterministic match is unchanged - the investigation only explains
it. Nothing here can move money or edit records.

### 5. Review - human decision

Open **Report review**, select the waiting item, and record a decision:
**Approve**, with a rationale such as *"Confirmed the 300.00 early-settlement
discount against the vendor policy."*

![Report review](screenshots/review-detail.png)

The decision is written to an append-only trail along with the `report_version`
it was made against. If the report were regenerated first, the stale submission
would be rejected instead of overwriting the newer version.

### 6. Dashboard - reflected state

Return to the dashboard: **Awaiting review** is now **0**, and the **Review
decisions** section shows the recorded approval.

## What this demonstrates

- Deterministic, Decimal-safe matching that never consults the LLM.
- Retrieval that finds and **cites** the one document that explains a difference.
- A report that *explains* but cannot *alter* financial state.
- Human approval as a hard gate, with a versioned, append-only audit trail.

## Reproducing without the UI

Everything above is also reachable over HTTP; `backend/scripts/seed_live.py` is
itself a pure API client. See the [API reference](../README.md#api-reference).
