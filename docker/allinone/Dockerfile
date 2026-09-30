# 一体机镜像：Nginx(前端) + FastAPI + PostgreSQL + MinIO
# 构建上下文必须是仓库根目录
#
# MinIO：Docker Hub / Quay 的 minio 镜像与 dl.min.io 直链均已不可用，
# 改为用 Go 从 GitHub 源码编译二进制。

# ---------- MinIO 源码编译 ----------
FROM golang:1.24-bookworm AS minio-build

ARG MINIO_VERSION=RELEASE.2025-04-22T22-12-26Z
ENV CGO_ENABLED=0 \
    GOPROXY=https://goproxy.cn,https://proxy.golang.org,direct

RUN go install -v "github.com/minio/minio@${MINIO_VERSION}"

# ---------- 前端构建 ----------
FROM node:22-bookworm-slim AS web-build

WORKDIR /web

COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm ci \
 && npm install --no-save @rollup/rollup-linux-x64-gnu

COPY apps/web/ ./

ARG VITE_API_BASE_URL=
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

RUN npm run build

# ---------- 运行阶段 ----------
FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PGDATA=/var/lib/postgresql/data \
    POSTGRES_DB=stock_sim \
    POSTGRES_USER=stock_sim \
    POSTGRES_PASSWORD=stock_sim \
    MINIO_ROOT_USER=minioadmin \
    MINIO_ROOT_PASSWORD=minioadmin \
    MINIO_BUCKET=stock-review \
    TZ=Asia/Shanghai

WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      curl \
      ca-certificates \
      nginx \
      supervisor \
      postgresql \
      postgresql-contrib \
      gosu \
      locales \
 && rm -rf /var/lib/apt/lists/* \
 && mkdir -p /var/log/supervisor /data /run/postgresql /var/lib/postgresql \
 && chown -R postgres:postgres /var/lib/postgresql /run/postgresql

COPY --from=minio-build /go/bin/minio /usr/local/bin/minio
RUN chmod +x /usr/local/bin/minio

COPY apps/api/requirements.txt /app/requirements.txt
RUN pip install -r /app/requirements.txt

COPY apps/api/ /app/
COPY --from=web-build /web/dist /usr/share/nginx/html

COPY docker/allinone/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/allinone/supervisord.conf /etc/supervisor/conf.d/stock-sim.conf
COPY docker/allinone/entrypoint.sh /entrypoint.sh
COPY docker/allinone/start-api.sh /start-api.sh

RUN rm -f /etc/nginx/sites-enabled/default \
 && sed -i 's/\r$//' /entrypoint.sh /start-api.sh \
 && chmod +x /entrypoint.sh /start-api.sh \
 && mkdir -p /var/lib/postgresql/data \
 && chown -R postgres:postgres /var/lib/postgresql

EXPOSE 80 9000 9001

HEALTHCHECK --interval=20s --timeout=5s --start-period=90s --retries=10 \
  CMD curl -fsS http://127.0.0.1/api/health || exit 1

VOLUME ["/var/lib/postgresql/data", "/data"]

ENTRYPOINT ["/entrypoint.sh"]
