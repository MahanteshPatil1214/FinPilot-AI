from app.db.session import get_db
from app.services.embedding_service import get_embedding_provider
from app.services.llm_client import get_llm_client
from fastapi import Depends
from sqlalchemy.orm import Session

# re-export for compatibility
__all__ = ["get_db", "get_embedding_provider", "get_llm_client"]
