#!/usr/bin/env bash
# 在「能访问 Docker Hub」的机器上拉取并导出一体机构建所需基础镜像。
#
# 用法：
#   chmod +x docker/allinone/preload-images.sh
#   ./docker/allinone/preload-images.sh
#
# 生成目录：docker/allinone/images/*.tar
# 拷到部署机后执行：
#   ./docker/allinone/load-images.sh
#   docker compose -f docker-compose.allinone.yml up -d --build
#
# 说明：不再预拉 minio/minio（Docker Hub / Quay 已不可用）。
# MinIO 二进制在构建时由 golang 镜像从 GitHub 源码编译。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="${ROOT}/docker/allinone/images"
mkdir -p "${OUT}"

# 须与 docker/allinone/Dockerfile 中的 FROM 一致
IMAGES=(
  "golang:1.24-bookworm"
  "node:22-bookworm-slim"
  "python:3.12-slim-bookworm"
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

echo "[preload] done."
echo "Copy ${OUT}/*.tar to the deploy machine, then run:"
echo "  ./docker/allinone/load-images.sh"
echo "  docker compose -f docker-compose.allinone.yml up -d --build"
echo
echo "Note: build still needs outbound access to proxy.golang.org / github.com"
echo "      to compile MinIO (or configure GOPROXY)."
