# FinPilot AI

Financial operations and reconciliation platform for small businesses and finance teams.

## Overview

FinPilot AI helps users investigate differences between invoices and bank transaction records, search company financial documents, understand payment terms, and prepare evidence-backed investigation reports. The application combines:

- Deterministic Python functions for financial calculations and transaction matching
- Retrieval-Augmented Generation (RAG) for finding evidence in uploaded documents
- A Groq-hosted LLM for natural-language reasoning, structured outputs, and tool calling
- A LangGraph workflow to coordinate investigation steps
- Human approval before consequential actions

**Important:** This is a portfolio prototype, not a banking product or system for moving money. It must not automatically initiate payments, change vendor bank details, or make consequential financial decisions.

## Milestone 1 - Project Foundation (Current)

Completed:
- [x] Git repository structure
- [x] FastAPI backend application
- [x] React frontend application (Vite + TypeScript)
- [x] Environment configuration
- [x] Health endpoint (`GET /api/v1/health`)
- [x] Basic tests for health endpoint
- [x] README and .env.example

## Technology Stack

### Backend
- Python, FastAPI, Pydantic v2
- SQLAlchemy, Alembic
- PostgreSQL with pgvector
- Pytest, HTTPX

### Frontend
- React, Vite, TypeScript
- Tailwind CSS

### AI/ML
- Groq API (hosted LLM)
- LangGraph
- sentence-transformers (local embeddings)
- pgvector for vector storage

## Getting Started

### Prerequisites
- Python 3.11+
- Node.js 18+
- PostgreSQL 14+ with pgvector extension (for later milestones)

### Backend Setup

```bash
cd finpilot-ai/backend
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload
```

Backend will be available at http://localhost:8000. API docs at http://localhost:8000/docs.

### Frontend Setup

```bash
cd finpilot-ai/frontend
npm install
npm run dev
```

Frontend will be available at http://localhost:5173.

### Running Tests

```bash
cd finpilot-ai/backend
python -m pytest -v
```

## Project Structure

```
finpilot-ai/
├── backend/
│   ├── app/
│   │   ├── api/routes/      # API route handlers
│   │   ├── core/            # Config, logging, security
│   │   ├── db/              # Database session
│   │   ├── models/          # SQLAlchemy models (future)
│   │   ├── services/        # Business logic (future)
│   │   ├── agents/          # LangGraph agents (future)
│   │   └── main.py          # FastAPI app
│   ├── tests/               # Test files
│   ├── migrations/          # Alembic migrations (future)
│   └── requirements.txt
├── frontend/                # React + Vite + TypeScript
├── data/synthetic/          # Sample data
└── docs/                   # Documentation
```

## Security Notes

- GROQ_API_KEY is stored only in backend environment variables
- `.env` files are excluded from version control
- All synthetic data for development
- No real financial data or secrets committed

## Next Steps

- Milestone 2: Data ingestion (PDF extraction, CSV import)
- Milestone 3: Deterministic reconciliation with Decimal arithmetic
- Milestone 4: Local embeddings and RAG with pgvector
- Milestone 5: Groq and LangGraph investigation workflow
- Milestone 6: Human review and audit
- Milestone 7: Hardening and delivery

## License

This is a portfolio project for demonstration purposes.
