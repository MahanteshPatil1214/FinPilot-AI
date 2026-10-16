#!/usr/bin/env sh
# Container entrypoint: apply pending migrations, then serve.
# Migrations run once here (not on every worker) and the service refuses to
# start if they fail, so a broken schema never serves traffic.
set -e

echo "Applying database migrations..."
alembic upgrade head

echo "Starting API server on :8000..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
