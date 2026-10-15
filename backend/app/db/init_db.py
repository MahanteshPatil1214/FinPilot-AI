import logging

from sqlalchemy import inspect, text

from app.db.base import Base
from app.db.session import engine
from app.models import Document, DocumentPage, Invoice, BankTransaction  # noqa

logger = logging.getLogger(__name__)

# Columns added to existing tables after the initial Milestone 1 schema.
# create_all() only creates missing tables, so we add columns explicitly for
# databases created before these fields existed. PostgreSQL only; SQLite tests
# always start from a fresh schema built by create_all().
_ADDITIVE_COLUMNS = {
    "documents": [
        ("storage_path", "VARCHAR(500)"),
        ("file_size", "INTEGER"),
        ("page_count", "INTEGER"),
    ],
}


def _apply_additive_columns() -> None:
    if engine.dialect.name != "postgresql":
        return
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    with engine.begin() as conn:
        for table, columns in _ADDITIVE_COLUMNS.items():
            if table not in existing_tables:
                continue
            existing_columns = {c["name"] for c in inspector.get_columns(table)}
            for name, ddl_type in columns:
                if name in existing_columns:
                    continue
                conn.execute(
                    text(f'ALTER TABLE "{table}" ADD COLUMN IF NOT EXISTS "{name}" {ddl_type}')
                )
                logger.info("Added missing column %s.%s", table, name)


def init_db():
    Base.metadata.create_all(bind=engine)
    _apply_additive_columns()
