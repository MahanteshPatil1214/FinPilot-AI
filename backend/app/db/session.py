from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from app.core.config import settings
import os

db_url = os.environ.get("DATABASE_URL", settings.DATABASE_URL)
if db_url.startswith("sqlite"):
    # In-memory SQLite databases are per-connection. StaticPool ensures every
    # session/thread shares the same in-memory database, so tables created by
    # init_db() are visible to the FastAPI request handlers.
    connect_args = {"check_same_thread": False}
    if ":memory:" in db_url:
        engine = create_engine(db_url, connect_args=connect_args, poolclass=StaticPool)
    else:
        engine = create_engine(db_url, connect_args=connect_args, pool_pre_ping=True)
else:
    engine = create_engine(db_url, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
