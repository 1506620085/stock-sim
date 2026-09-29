#!/bin/bash
set -euo pipefail

echo "[api] waiting for PostgreSQL..."
for i in $(seq 1 90); do
  if python - <<'PY'
import os, sys
url = os.environ["DATABASE_URL"].replace("postgresql+psycopg://", "postgresql://", 1)
try:
    import psycopg
    with psycopg.connect(url, connect_timeout=2) as conn:
        conn.execute("SELECT 1")
except Exception:
    sys.exit(1)
sys.exit(0)
PY
  then
    echo "[api] PostgreSQL is ready"
    break
  fi
  sleep 1
  if [ "$i" -eq 90 ]; then
    echo "[api] PostgreSQL not ready after 90s" >&2
    exit 1
  fi
done

echo "[api] waiting for MinIO..."
for i in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:9000/minio/health/live" >/dev/null 2>&1; then
    echo "[api] MinIO is ready"
    break
  fi
  sleep 1
  if [ "$i" -eq 60 ]; then
    echo "[api] MinIO not ready after 60s" >&2
    exit 1
  fi
done

python - <<'PY' || true
import os
from minio import Minio

endpoint = os.environ.get("MINIO_ENDPOINT", "http://127.0.0.1:9000")
endpoint = endpoint.replace("https://", "").replace("http://", "")
secure = os.environ.get("MINIO_USE_SSL", "false").lower() == "true"
client = Minio(
    endpoint,
    access_key=os.environ.get("MINIO_ACCESS_KEY", "minioadmin"),
    secret_key=os.environ.get("MINIO_SECRET_KEY", "minioadmin"),
    secure=secure,
)
bucket = os.environ.get("MINIO_BUCKET", "stock-review")
if not client.bucket_exists(bucket):
    client.make_bucket(bucket)
    print(f"[api] created bucket {bucket}")
else:
    print(f"[api] bucket {bucket} ok")
PY

cd /app
echo "[api] running migrations..."
alembic upgrade head
echo "[api] migrations applied"

exec uvicorn app.main:app --host 127.0.0.1 --port 8000 --proxy-headers --forwarded-allow-ips='*'
