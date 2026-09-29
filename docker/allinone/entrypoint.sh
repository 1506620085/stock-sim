#!/bin/bash
set -euo pipefail

PG_MAJOR="$(ls /usr/lib/postgresql | head -1)"
PG_BIN="/usr/lib/postgresql/${PG_MAJOR}/bin"
export PATH="${PG_BIN}:${PATH}"
export PGDATA="${PGDATA:-/var/lib/postgresql/data}"

POSTGRES_DB="${POSTGRES_DB:-stock_sim}"
POSTGRES_USER="${POSTGRES_USER:-stock_sim}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-stock_sim}"
MINIO_ROOT_USER="${MINIO_ROOT_USER:-${MINIO_ACCESS_KEY:-minioadmin}}"
MINIO_ROOT_PASSWORD="${MINIO_ROOT_PASSWORD:-${MINIO_SECRET_KEY:-minioadmin}}"
MINIO_BUCKET="${MINIO_BUCKET:-stock-review}"

export MINIO_ROOT_USER MINIO_ROOT_PASSWORD

# 一体机内部固定走本机回环，避免依赖外部主机名
export DATABASE_URL="${DATABASE_URL:-postgresql+psycopg://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:5432/${POSTGRES_DB}}"
export MINIO_ENDPOINT="${MINIO_ENDPOINT:-http://127.0.0.1:9000}"
export MINIO_PUBLIC_ENDPOINT="${MINIO_PUBLIC_ENDPOINT:-http://127.0.0.1:9000}"
export MINIO_ACCESS_KEY="${MINIO_ACCESS_KEY:-$MINIO_ROOT_USER}"
export MINIO_SECRET_KEY="${MINIO_SECRET_KEY:-$MINIO_ROOT_PASSWORD}"
export STORAGE_TYPE="${STORAGE_TYPE:-minio}"
export APP_ENV="${APP_ENV:-production}"
export TRUST_PROXY_HEADERS="${TRUST_PROXY_HEADERS:-true}"

mkdir -p "$PGDATA" /run/postgresql /data /var/log/supervisor
chown -R postgres:postgres "$PGDATA" /run/postgresql
chmod 700 "$PGDATA" || true

if [ ! -s "${PGDATA}/PG_VERSION" ]; then
  echo "[allinone] initializing PostgreSQL data directory..."
  gosu postgres "${PG_BIN}/initdb" -D "$PGDATA" --auth-local=trust --auth-host=scram-sha-256 --encoding=UTF8 --locale=C
  cat >> "${PGDATA}/postgresql.conf" <<EOF
listen_addresses = '127.0.0.1'
unix_socket_directories = '/run/postgresql'
EOF
  # 临时启动以创建业务库用户
  gosu postgres "${PG_BIN}/pg_ctl" -D "$PGDATA" -o "-c listen_addresses=127.0.0.1 -c unix_socket_directories=/run/postgresql" -w start
  gosu postgres psql -v ON_ERROR_STOP=1 -d postgres <<-EOSQL
    DO \$\$
    BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${POSTGRES_USER}') THEN
        CREATE ROLE ${POSTGRES_USER} LOGIN PASSWORD '${POSTGRES_PASSWORD}';
      ELSE
        ALTER ROLE ${POSTGRES_USER} WITH LOGIN PASSWORD '${POSTGRES_PASSWORD}';
      END IF;
    END
    \$\$;
EOSQL
  if ! gosu postgres psql -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='${POSTGRES_DB}'" | grep -q 1; then
    gosu postgres psql -d postgres -c "CREATE DATABASE ${POSTGRES_DB} OWNER ${POSTGRES_USER}"
  fi
  gosu postgres "${PG_BIN}/pg_ctl" -D "$PGDATA" -m fast -w stop
  echo "[allinone] PostgreSQL initialized"
else
  echo "[allinone] PostgreSQL data directory already exists"
fi

# 供 supervisord 环境插值（部分版本需要写进 conf，这里用 export 给子进程）
export MINIO_ROOT_USER MINIO_ROOT_PASSWORD

echo "[allinone] starting supervisord (postgres + minio + api + nginx)..."
exec /usr/bin/supervisord -c /etc/supervisor/supervisord.conf -n
