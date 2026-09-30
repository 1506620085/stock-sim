#!/usr/bin/env bash
# 模式 B：导入预先下载的基础镜像 tar
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DIR="${ROOT}/docker/external/images"

if [ ! -d "${DIR}" ]; then
  echo "[load] directory not found: ${DIR}" >&2
  exit 1
fi

shopt -s nullglob
files=("${DIR}"/*.tar)
if [ ${#files[@]} -eq 0 ]; then
  echo "[load] no .tar files in ${DIR}" >&2
  exit 1
fi

echo "[load] importing from ${DIR}"
for f in "${files[@]}"; do
  echo "[load] docker load -i ${f}"
  docker load -i "${f}"
done

echo "[load] done."
echo "  ./docker/external/setup-network.sh"
echo "  docker compose -f docker-compose.external.yml up -d --build"
