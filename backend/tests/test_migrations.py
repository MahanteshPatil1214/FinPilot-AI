"""Structural checks on the Alembic migration tree.

These run without a database, so they are safe in CI: they only assert the
migration history is a single, linear chain that matches the models.
"""

from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory

BACKEND_DIR = Path(__file__).resolve().parents[1]
ALEMBIC_INI = BACKEND_DIR / "alembic.ini"


def _script_directory() -> ScriptDirectory:
    return ScriptDirectory.from_config(Config(str(ALEMBIC_INI)))


def test_alembic_config_points_at_existing_script_location():
    cfg = Config(str(ALEMBIC_INI))
    location = cfg.get_main_option("script_location").replace("%(here)s", str(BACKEND_DIR))
    assert Path(location).is_dir()


def test_migration_history_has_a_single_head():
    script = _script_directory()
    assert len(script.get_heads()) == 1


def test_migration_history_is_linear_with_one_base():
    script = _script_directory()
    bases = list(script.get_bases())
    assert len(bases) == 1


def test_initial_migration_covers_every_model_table():
    from app.db.base import Base
    import app.models  # noqa: F401  (populate Base.metadata)

    # A live autogenerate comparison needs PostgreSQL; instead assert that
    # every model table name appears in the migration sources.
    migration_sources = "\n".join(
        p.read_text(encoding="utf-8")
        for p in (BACKEND_DIR / "migrations" / "versions").glob("*.py")
    )
    for table_name in Base.metadata.tables:
        assert f"'{table_name}'" in migration_sources, table_name
