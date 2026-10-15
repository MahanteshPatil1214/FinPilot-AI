from app.db.session import get_db
from fastapi import Depends
from sqlalchemy.orm import Session

# re-export for compatibility
__all__ = ["get_db"]
