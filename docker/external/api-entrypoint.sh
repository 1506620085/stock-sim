#!/bin/sh
set -eu

echo "[api] waiting for database migrations..."
alembic upgrade head
echo "[api] migrations applied"

exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips='*'
