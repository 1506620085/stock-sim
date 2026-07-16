# Stock Sim API

股票复盘训练系统的 FastAPI 后端服务。

## 功能概览

- 行情与自选：标的搜索、日 K 同步、自选列表
- 复盘训练：复盘会话、买卖成交、盈亏统计
- 交易笔记：实盘笔记、操作规则 / 总结笔记（树形知识库）
- 系统设置：偏好与模板配置
- 对象存储：统一 `StorageService`，支持 MinIO / 腾讯云 COS / 阿里云 OSS / 七牛云 Kodo

## 本地环境搭建

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
```

在仓库根目录启动 PostgreSQL：

```bash
docker compose up -d postgres
```

在 `apps/api` 目录执行数据库迁移：

```bash
.venv\Scripts\activate
python -m alembic upgrade head
```

若未激活虚拟环境，也可直接运行：

```bash
.venv\Scripts\python.exe -m alembic upgrade head
```

也可以用 SQL 初始化空库：

```bash
psql "postgresql://stock_sim:stock_sim@localhost:5432/stock_sim" -f sql/001_init_schema.sql
```

启动 API：

```bash
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

健康检查：

```text
http://127.0.0.1:8000/api/health
http://127.0.0.1:8000/api/health/db
```

通过前端开发服务器访问时，也可使用：

```text
http://127.0.0.1:5173/api/health
```

## 环境变量说明

复制 `.env.example` 为 `.env` 后按需修改。主要配置如下。

### 基础配置

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `APP_ENV` | 运行环境（`development` / `production`） | `development` |
| `DATABASE_URL` | PostgreSQL 连接串（SQLAlchemy + psycopg） | 见下方示例 |
| `MARKET_DATA_PROVIDER` | 行情数据源 | `akshare` |
| `TUSHARE_TOKEN` | Tushare Token（预留） | 空 |
| `TIMEZONE` | 时区 | `Asia/Shanghai` |
| `CORS_ORIGINS` | 允许跨域的前端源，逗号分隔 | 本地 Vite 地址 |
| `TRUST_PROXY_HEADERS` | 是否信任 Nginx 等反向代理头 | `false` |

示例：

```env
APP_ENV=development
DATABASE_URL=postgresql+psycopg://stock_sim:stock_sim@localhost:5432/stock_sim
MARKET_DATA_PROVIDER=akshare
TUSHARE_TOKEN=
TIMEZONE=Asia/Shanghai
CORS_ORIGINS=http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:4173,http://localhost:4173
TRUST_PROXY_HEADERS=false
```

说明：

- `CORS_ORIGINS`：浏览器**直连** API 时需要配置；前端经 Vite / Nginx 同域代理 `/api` 时通常不触发跨域。
- 部署到 Nginx 后建议设置 `TRUST_PROXY_HEADERS=true`，以便正确识别客户端 IP 与协议。

### 对象存储配置（Storage）

业务层统一调用 `StorageService`，由 `STORAGE_TYPE` 决定具体云厂商实现，**无需改业务代码**即可切换。

```env
########################################
# Storage Configuration
# 可选值：
# minio    = MinIO（本地开发默认）
# tencent  = 腾讯云 COS
# aliyun   = 阿里云 OSS
# qiniu    = 七牛云 Kodo
########################################

STORAGE_TYPE=minio
```

| `STORAGE_TYPE` | 提供商 | 适用场景 |
|----------------|--------|----------|
| `minio` | MinIO | 本地开发默认 |
| `tencent` | 腾讯云 COS | 生产 / 腾讯云环境 |
| `aliyun` | 阿里云 OSS | 生产 / 阿里云环境 |
| `qiniu` | 七牛云 Kodo | 生产 / CDN 场景 |

只填写当前 `STORAGE_TYPE` 对应厂商的配置即可；其余可留空。

#### MinIO（本地默认）

```env
MINIO_ENDPOINT=http://127.0.0.1:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=stock-review
MINIO_REGION=
MINIO_USE_SSL=false
```

| 变量 | 说明 |
|------|------|
| `MINIO_ENDPOINT` | MinIO API 地址（含协议） |
| `MINIO_ACCESS_KEY` | Access Key |
| `MINIO_SECRET_KEY` | Secret Key |
| `MINIO_BUCKET` | 桶名称；不存在时会自动创建 |
| `MINIO_REGION` | 区域（可留空） |
| `MINIO_USE_SSL` | 是否强制 HTTPS（`true` / `false`） |

#### 腾讯云 COS

```env
TENCENT_SECRET_ID=
TENCENT_SECRET_KEY=
TENCENT_REGION=ap-guangzhou
TENCENT_BUCKET=
```

| 变量 | 说明 |
|------|------|
| `TENCENT_SECRET_ID` | 腾讯云 SecretId |
| `TENCENT_SECRET_KEY` | 腾讯云 SecretKey |
| `TENCENT_REGION` | 地域，如 `ap-guangzhou` |
| `TENCENT_BUCKET` | 桶名称（形如 `bucket-appid`） |

#### 阿里云 OSS

```env
ALIYUN_ENDPOINT=oss-cn-guangzhou.aliyuncs.com
ALIYUN_ACCESS_KEY_ID=
ALIYUN_ACCESS_KEY_SECRET=
ALIYUN_BUCKET=
```

| 变量 | 说明 |
|------|------|
| `ALIYUN_ENDPOINT` | Endpoint（可不带 `https://`） |
| `ALIYUN_ACCESS_KEY_ID` | AccessKey ID |
| `ALIYUN_ACCESS_KEY_SECRET` | AccessKey Secret |
| `ALIYUN_BUCKET` | Bucket 名称 |

#### 七牛云 Kodo

```env
QINIU_ACCESS_KEY=
QINIU_SECRET_KEY=
QINIU_BUCKET=
QINIU_REGION=z2
QINIU_DOMAIN=https://your-domain.com
```

| 变量 | 说明 |
|------|------|
| `QINIU_ACCESS_KEY` | AccessKey |
| `QINIU_SECRET_KEY` | SecretKey |
| `QINIU_BUCKET` | 空间名称 |
| `QINIU_REGION` | 机房：`z0` 华东 / `z1` 华北 / `z2` 华南 / `na0` 北美 / `as0` 东南亚 |
| `QINIU_DOMAIN` | 外链域名（含协议），用于拼接访问地址 |

## 对象存储使用说明

代码位置：`app/services/storage/`

| 文件 | 作用 |
|------|------|
| `base.py` | `StorageProvider` 抽象接口（策略模式） |
| `factory.py` | 根据 `STORAGE_TYPE` 创建对应实现 |
| `service.py` | 业务统一入口 `StorageService` |
| `minio_provider.py` 等 | 各云厂商实现 |

### HTTP 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/storage/upload?folder=&filename=` | 上传图片（请求体为原始二进制，`Content-Type` 为图片 MIME） |
| `GET` | `/api/storage/files/{key}` | 读取已上传文件（编辑器内嵌图片使用此稳定地址） |

上传成功示例响应：

```json
{
  "key": "notes/1/20260716/abcd1234_cover.png",
  "url": "/api/storage/files/notes/1/20260716/abcd1234_cover.png",
  "bucket": "stock-review",
  "content_type": "image/png",
  "size": 12345
}
```

业务代码示例（不要直接依赖某一家 SDK）：

```python
from app.services.storage import get_storage_service

storage = get_storage_service()

# 上传
obj = storage.upload(
    key="notes/1/cover.png",
    data=file_bytes,
    content_type="image/png",
)

# 获取访问地址（支持预签名过期时间）
url = storage.get_url("notes/1/cover.png", expires_in=3600)

# 判断是否存在
ok = storage.exists("notes/1/cover.png")

# 删除
storage.delete("notes/1/cover.png")
```

切换云厂商步骤：

1. 修改 `.env` 中的 `STORAGE_TYPE`
2. 填写对应厂商密钥与桶配置
3. 重启 API 进程

无需改 router / service 业务代码。后续扩展华为云 OBS、AWS S3 时，新增 Provider 并在 `factory.py` 注册即可。

## 项目结构（简要）

```text
apps/api/
├── app/
│   ├── main.py              # FastAPI 入口
│   ├── core/                # 配置、数据库
│   ├── models/              # SQLModel 表模型
│   ├── schemas/             # 请求/响应模型
│   ├── routers/             # HTTP 路由
│   ├── services/            # 业务与外部能力（行情、存储等）
│   └── migrations/          # Alembic 迁移
├── sql/                     # 可选 SQL 初始化脚本
├── .env.example             # 环境变量模板
├── requirements.txt
└── README.md
```

## 依赖安装提示

对象存储相关依赖已写入 `requirements.txt`：

- `minio`
- `cos-python-sdk-v5`
- `oss2`
- `qiniu`

执行 `pip install -r requirements.txt` 即可一并安装。
