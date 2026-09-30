#!/usr/bin/env bash
# 模式 B：预拉 api/web 构建所需基础镜像并导出为 tar
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="${ROOT}/docker/external/images"
mkdir -p "${OUT}"

IMAGES=(
  "python:3.12-slim-bookworm"
  "node:22-bookworm-slim"
  "nginx:1.27-alpine"
)

echo "[preload] pulling and saving images to ${OUT}"
for img in "${IMAGES[@]}"; do
  safe_name="$(echo "${img}" | tr ':/' '__')"
  tar_path="${OUT}/${safe_name}.tar"
  echo "[preload] docker pull ${img}"
  docker pull "${img}"
  echo "[preload] docker save ${img} -> ${tar_path}"
  docker save -o "${tar_path}" "${img}"
done

echo "[preload] done. On deploy machine:"
echo "  ./docker/external/load-images.sh"
echo "  ./docker/external/setup-network.sh"
echo "  docker compose -f docker-compose.external.yml up -d --build"
