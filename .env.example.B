########################################
# 模式 B：复用已有 postgres / minio，只启动 api + web
#
# 相关文件：
#   docker-compose.external.yml      # 编排（推荐）
#   docker-compose.yml               # include 上述文件，可简写 docker compose up
#   docker/external/                 # Dockerfile、nginx、entrypoint、网络脚本
#
# 用法：
#   cp .env.example.B .env
#   chmod +x docker/external/*.sh
#   ./docker/external/setup-network.sh
#   docker compose -f docker-compose.external.yml up -d --build
#   # 或：docker compose up -d --build
#
# 备选：不配共享网络时，改 compose 中 DATABASE_URL / MINIO_ENDPOINT
# 为 host.docker.internal 或 172.17.0.1
########################################

APP_ENV=production
TIMEZONE=Asia/Shanghai
MARKET_DATA_PROVIDER=akshare

WEB_PORT=8080
API_PORT=8000
POSTGRES_PORT=5432
MINIO_API_PORT=9000
MINIO_CONSOLE_PORT=9001

# 本机访问可保留；局域网请改成 http://你的局域网IP:8080
CORS_ORIGINS=http://127.0.0.1:8080,http://localhost:8080
TRUST_PROXY_HEADERS=true

VITE_API_BASE_URL=

########################################
# PostgreSQL（必须与已有容器账号一致）
########################################
POSTGRES_DB=stock_sim
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres

# compose 默认用主机名 postgres（需在 stock-sim-shared 网络内）
# 本地开发直连示例（api 容器内会被 compose environment 覆盖）：
DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/stock_sim

########################################
# MinIO（必须与已有容器账号一致）
########################################
STORAGE_TYPE=minio
# 容器内访问：共享网络下用 minio 主机名
MINIO_ENDPOINT=http://minio:9000
# 浏览器访问：局域网请改为 http://你的局域网IP:9000
MINIO_PUBLIC_ENDPOINT=http://127.0.0.1:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=stock-review
MINIO_USE_SSL=false
MINIO_REGION=

########################################
# 其他云存储（STORAGE_TYPE 切到对应值时填写）
########################################
TENCENT_SECRET_ID=
TENCENT_SECRET_KEY=
TENCENT_REGION=ap-guangzhou
TENCENT_BUCKET=

ALIYUN_ENDPOINT=oss-cn-guangzhou.aliyuncs.com
ALIYUN_ACCESS_KEY_ID=
ALIYUN_ACCESS_KEY_SECRET=
ALIYUN_BUCKET=

QINIU_ACCESS_KEY=
QINIU_SECRET_KEY=
QINIU_BUCKET=
QINIU_REGION=z2
QINIU_DOMAIN=https://your-domain.com

TUSHARE_TOKEN=
