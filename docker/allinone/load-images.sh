#!/usr/bin/env bash
# 在部署机上导入预先下载好的基础镜像 tar 包。
#
# 用法：
#   chmod +x docker/allinone/load-images.sh
#   ./docker/allinone/load-images.sh
#
# 或手动逐个导入：
#   docker load -i docker/allinone/images/node__22-bookworm-slim.tar
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DIR="${ROOT}/docker/allinone/images"

if [ ! -d "${DIR}" ]; then
  echo "[load] directory not found: ${DIR}" >&2
  echo "[load] first run preload-images.sh on a machine with Docker Hub access," >&2
  echo "[load] then copy the images/ folder here." >&2
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

echo "[load] done. Current related images:"
docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.ID}}\t{{.Size}}" \
  | grep -E "REPOSITORY|node|python|minio" || true

echo
echo "Next:"
echo "  docker compose -f docker-compose.allinone.yml up -d --build"
