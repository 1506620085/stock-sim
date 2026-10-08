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

# 国内默认走 npmmirror；可用 --build-arg NPM_REGISTRY=https://registry.npmjs.org 覆盖
ARG NPM_REGISTRY=https://registry.npmmirror.com
ENV NPM_CONFIG_REGISTRY=${NPM_REGISTRY} \
    NPM_CONFIG_FETCH_RETRIES=10 \
    NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=20000 \
    NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=300000 \
    NPM_CONFIG_FETCH_TIMEOUT=600000 \
    NPM_CONFIG_MAXSOCKETS=20

WORKDIR /web

COPY apps/web/package.json apps/web/package-lock.json ./
# 弱网下失败则自动重试（npm 本身不支持跨进程断点续传）
RUN set -eux; \
    for i in 1 2 3 4 5; do \
      npm ci && break; \
      echo "[web-build] npm ci failed (attempt $$i), retrying in 15s..."; \
      sleep 15; \
      if [ "$$i" -eq 5 ]; then exit 1; fi; \
    done; \
    npm install --no-save @rollup/rollup-linux-x64-gnu

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

# 默认换国内 Debian 源（deb.debian.org 在部分机房 DNS/网络不可达）
# 覆盖：--build-arg DEBIAN_MIRROR=http://deb.debian.org/debian
ARG DEBIAN_MIRROR=https://mirrors.aliyun.com/debian
ARG DEBIAN_SECURITY_MIRROR=https://mirrors.aliyun.com/debian-security
RUN set -eux; \
    if [ -f /etc/apt/sources.list.d/debian.sources ]; then \
      sed -i \
        -e "s|https\\?://deb.debian.org/debian|${DEBIAN_MIRROR}|g" \
        -e "s|https\\?://deb.debian.org/debian-security|${DEBIAN_SECURITY_MIRROR}|g" \
        /etc/apt/sources.list.d/debian.sources; \
    fi; \
    if [ -f /etc/apt/sources.list ]; then \
      sed -i \
        -e "s|https\\?://deb.debian.org/debian|${DEBIAN_MIRROR}|g" \
        -e "s|https\\?://security.debian.org/debian-security|${DEBIAN_SECURITY_MIRROR}|g" \
        -e "s|https\\?://deb.debian.org/debian-security|${DEBIAN_SECURITY_MIRROR}|g" \
        /etc/apt/sources.list; \
    fi; \
    for i in 1 2 3 4 5; do \
      if apt-get -o Acquire::Retries=3 update \
        && apt-cache show curl >/dev/null 2>&1; then \
        break; \
      fi; \
      echo "[apt] update/DNS failed (attempt $$i), retrying in 10s..."; \
      sleep 10; \
      if [ "$$i" -eq 5 ]; then \
        echo "[apt] still cannot resolve apt mirrors. Fix Docker DNS or build with --network=host"; \
        exit 1; \
      fi; \
    done; \
    apt-get install -y --no-install-recommends \
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
# pip 同样默认国内源，避免构建后期再慢挂
ARG PIP_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple
RUN pip install -i "${PIP_INDEX_URL}" -r /app/requirements.txt

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
