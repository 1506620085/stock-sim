#!/usr/bin/env bash
# 模式 B：创建共享网络并把已有 postgres / minio 接入（只需做一次）
#
# 用法：
#   chmod +x docker/external/setup-network.sh
#   ./docker/external/setup-network.sh
#   # 可选自定义容器名：
#   POSTGRES_CONTAINER=postgres MINIO_CONTAINER=minio ./docker/external/setup-network.sh
set -euo pipefail

NETWORK_NAME="${NETWORK_NAME:-stock-sim-shared}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-postgres}"
MINIO_CONTAINER="${MINIO_CONTAINER:-minio}"

if ! docker network inspect "${NETWORK_NAME}" >/dev/null 2>&1; then
  echo "[setup] creating network ${NETWORK_NAME}"
  docker network create "${NETWORK_NAME}"
else
  echo "[setup] network ${NETWORK_NAME} already exists"
fi

connect_if_needed() {
  local container="$1"
  if ! docker inspect "${container}" >/dev/null 2>&1; then
    echo "[setup] WARN: container '${container}' not found, skip connect" >&2
    return 0
  fi
  if docker network inspect "${NETWORK_NAME}" --format '{{range .Containers}}{{.Name}} {{end}}' \
    | grep -qw "${container}"; then
    echo "[setup] ${container} already on ${NETWORK_NAME}"
  else
    echo "[setup] connecting ${container} -> ${NETWORK_NAME}"
    docker network connect "${NETWORK_NAME}" "${container}"
  fi
}

connect_if_needed "${POSTGRES_CONTAINER}"
connect_if_needed "${MINIO_CONTAINER}"

echo "[setup] members:"
docker network inspect "${NETWORK_NAME}" --format '{{range .Containers}}{{.Name}} {{end}}'
echo "[setup] done. Next:"
echo "  cp .env.example.B .env"
echo "  docker compose -f docker-compose.external.yml up -d --build"
