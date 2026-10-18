# Contributing to FinPilot AI

Thanks for your interest in improving FinPilot AI. This is a portfolio
prototype of a financial-operations platform: contributions that make it more
correct, better tested, clearer, or easier to run are especially welcome.

> **Scope reminder.** This project must never initiate payments, change vendor
> bank details, or make consequential financial decisions autonomously. Pull
> requests that remove a human-review gate, weaken the audit trail, or commit
> real financial data will be declined.

## Ways to help

- Report bugs and rough edges via [GitHub Issues](https://github.com/MahanteshPatil1214/FinPilot-AI/issues).
- Pick up an issue labelled `good first issue`.
- Improve documentation, README screenshots, or the demo scenario.
- Add tests around untested behaviour.

## Development setup

Follow [Option B in the README](README.md#option-b---local-development) —
in short:

```bash
# Database (pgvector)
docker compose up -d postgres

# Backend
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows; source .venv/bin/activate elsewhere
pip install -r requirements.txt
cp .env.example .env
alembic upgrade head
uvicorn app.main:app --reload   # http://localhost:8000

# Seed the synthetic dataset (second terminal, still in backend/)
python scripts/seed_live.py --reset --index

# Frontend (third terminal)
cd frontend
npm install
npm run dev                     # http://localhost:5173
```

`GROQ_API_KEY` may stay empty: the app runs a deterministic, model-free
fallback so everything stays demoable without network AI.

## Before you open a pull request

Run the suites that cover your change:

```bash
# Backend (244 tests; uses an isolated in-memory SQLite, no Docker needed)
cd backend
python -m pytest -q

# Frontend
cd frontend
npm run lint            # tsc --noEmit
npm run test:e2e        # Playwright, every /api request intercepted
```

Live integration tests (`npm run test:e2e:integration`) need the PostgreSQL
container running and are optional for small changes, but please run them if
you touch a route the journey suite covers.

## Coding guidelines

- **Determinism first.** Amounts are `Decimal`; matching is rule-based and
  reproducible. Keep the deterministic core free of LLM calls and keep the LLM
  out of record mutation — a human approves every irreversible action.
- **No secrets, no real data.** Only synthetic fixtures under
  `data/synthetic/`. `.env` files, uploads (`backend/storage/`), and database
  files are gitignored and must stay that way.
- **Tests with behaviour.** New routes, services, and graph nodes need tests;
  bug fixes need a regression test.
- **Style follows the codebase.** Backend: type hints, Pydantic schemas at the
  boundary, services for logic. Frontend: TypeScript strict, components
  under 300 lines where practical.

## Commit messages

This repository uses [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add vendor statement import
fix: reject stale review submissions
docs: regenerate README screenshots
test: cover duplicate invoice detection
chore: update dependencies
```

## Pull request checklist

- [ ] `python -m pytest -q` passes locally.
- [ ] `npm run lint` and `npm run test:e2e` pass locally.
- [ ] New behaviour is covered by tests; bugs have regression tests.
- [ ] README/docs updated if behaviour or setup changed.
- [ ] No `.env`, uploads, database files, or real financial data included.

## Reporting security issues

Please do not open a public issue for security-sensitive reports. This is a
prototype with a development-mode identity that is explicitly **not** a
security boundary (see the README's *Security and limitations* section). Use
GitHub's private vulnerability reporting for anything that goes beyond that
documented limitation.
