# 已迁移：模式 B 请使用仓库根目录编排
#   docker compose -f docker-compose.external.yml build api
# Dockerfile 路径：docker/external/api.Dockerfile
#
# 本文件保留仅为兼容旧文档；请勿再以此 context=apps/api 单独构建。
FROM python:3.12-slim-bookworm
RUN echo "Use docker/external/api.Dockerfile via docker-compose.external.yml" >&2 && exit 1
