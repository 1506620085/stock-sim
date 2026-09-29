# Docker 部署指南

本文说明如何在 **Windows / Linux 服务器** 上用 Docker 部署股票 K 线复盘训练系统。

根据环境选择模式：

| 模式 | 形态 | 适用场景 | 启动命令 |
| --- | --- | --- | --- |
| **A. 一体机（推荐干净机器）** | **单个容器**内含 Nginx 前端 + FastAPI + PostgreSQL + MinIO | 无已有库/对象存储，希望一条命令拉起 | `docker compose -f docker-compose.allinone.yml up -d --build` |
| **B. 复用已有中间件** | `api` + `web` 两个容器，连接已有 `postgres` / `minio` | 服务器上已有数据库与 MinIO | `docker compose up -d --build`（需先配网络或宿主机地址） |

相关文件：

| 文件 | 作用 |
| --- | --- |
| `docker-compose.allinone.yml` | **模式 A**：单容器编排 |
| `docker/allinone/` | 一体机 Dockerfile、Nginx、supervisord、启动脚本 |
| `docker-compose.yml` | **模式 B**：仅 api + web，依赖外部 `stock-sim-shared` 网络 |
| `.env.example` | 索引说明（指向 A/B） |
| `.env.example.A` | **模式 A** 环境变量模板 → 复制为 `.env` |
| `.env.example.B` | **模式 B** 环境变量模板 → 复制为 `.env` |
| `apps/api/Dockerfile` | 模式 B 后端镜像 |
| `apps/web/Dockerfile` | 模式 B 前端镜像 |

---

## 0. 前置条件

1. 安装 Docker Engine + Compose（或 Docker Desktop）。
2. 确认：`docker version`、`docker compose version`。
3. 建议内存 ≥ 4GB（一体机构建前端 + 安装依赖更吃资源）。
4. 命令均在**仓库根目录**执行。

### 防火墙端口

| 端口 | 模式 A | 模式 B | 用途 |
| --- | --- | --- | --- |
| `8080` | 开放 | 开放 | 站点（HTTP） |
| `9000` | 开放（笔记图片） | 开放 | MinIO API |
| `9001` | 可选 | 可选 | MinIO 控制台 |
| `8000` | 不映射 | 可选 | 模式 B 的 API 直连 |
| `5432` | **不对外映射** | 已有库自行管理 | 数据库 |

局域网访问用 **`http://IP:8080`**，不要用 `https://`（未配置 SSL）。

---

## 1. 获取代码与 `.env`

```bash
git clone <仓库地址> stock-sim
cd stock-sim
```

按模式复制环境文件（**不要**再复制笼统的 `.env.example`，它只是索引）：

```bash
# 模式 A 一体机
cp .env.example.A .env

# 或模式 B 复用已有库
cp .env.example.B .env
```

Windows PowerShell：

```powershell
Copy-Item .env.example.A .env
# 或
Copy-Item .env.example.B .env
```

局域网示例（假设 IP `192.168.1.100`），在对应 `.env` 中修改：

```env
WEB_PORT=8080
CORS_ORIGINS=http://192.168.1.100:8080,http://127.0.0.1:8080,http://localhost:8080
MINIO_PUBLIC_ENDPOINT=http://192.168.1.100:9000
POSTGRES_PASSWORD=改成强密码
MINIO_ACCESS_KEY=改成强账号
MINIO_SECRET_KEY=改成强密码
```

> `0.0.0.0` 不能写进 `CORS_ORIGINS` / `MINIO_PUBLIC_ENDPOINT`。模式 B 的 `POSTGRES_USER` / `POSTGRES_PASSWORD` 必须与已有 Postgres 一致。

`git pull` 只更新源码；更新后需重新 `build`（见第 7 节）。若 pull 因本地改过 compose/Dockerfile 失败：

```bash
git checkout -- docker-compose.yml apps/web/Dockerfile
git pull
```

---

## 3. 模式 A：一体机（单容器）

一个容器内同时运行：

```text
Nginx(:80)  → 静态前端 + 反代 /api
FastAPI     → 127.0.0.1:8000
PostgreSQL  → 127.0.0.1:5432（仅容器内）
MinIO       → :9000 / 控制台 :9001
```

由 `supervisord` 托管进程；数据落在 Docker volume，容器重建不丢库。

### 3.1 启动

```bash
cp .env.example.A .env   # 首次
# 编辑 CORS_ORIGINS、MINIO_PUBLIC_ENDPOINT、密码

docker compose -f docker-compose.allinone.yml up -d --build
```

首次构建可能较慢（前端 npm + pip + 拉取 MinIO 二进制）。

查看状态：

```bash
docker compose -f docker-compose.allinone.yml ps
docker compose -f docker-compose.allinone.yml logs -f app
```

健康检查通过后访问：

| 检查 | 地址 |
| --- | --- |
| 前端 | http://127.0.0.1:8080 |
| API | http://127.0.0.1:8080/api/health |
| 数据库 | http://127.0.0.1:8080/api/health/db |
| MinIO 控制台 | http://127.0.0.1:9001 |

容器名：`stock-sim`。

### 3.2 一体机内部连接说明

容器内固定：

- `DATABASE_URL=...@127.0.0.1:5432/...`
- `MINIO_ENDPOINT=http://127.0.0.1:9000`

**不要**再配置 `stock-sim-shared`，也**不需要**已有 postgres/minio。

浏览器侧仍依赖 `.env` 中的 `CORS_ORIGINS`、`MINIO_PUBLIC_ENDPOINT`（填局域网可达地址）。

### 3.3 数据卷

| Volume | 内容 |
| --- | --- |
| `stock_sim_allinone_pgdata` | PostgreSQL |
| `stock_sim_allinone_minio` | MinIO 对象 |

备份示例：

```bash
docker exec -T stock-sim gosu postgres pg_dump -U stock_sim stock_sim > backup.sql
```

### 3.4 更新一体机

```bash
git pull
docker compose -f docker-compose.allinone.yml build --no-cache app
docker compose -f docker-compose.allinone.yml up -d --force-recreate app
```

---

## 4. 模式 B：复用已有 postgres / minio

使用默认 `docker-compose.yml`，只启动 `stock-sim-api` + `stock-sim-web`。

### 4.1 前置

```bash
docker ps   # 确认已有 postgres、minio，且映射 5432 / 9000
docker exec -it postgres psql -U postgres -c "CREATE DATABASE stock_sim;"
```

`.env` 账号与已有库一致。

### 4.2 连通方式（二选一）

**共享网络：**

```bash
docker network create stock-sim-shared
docker network connect stock-sim-shared postgres
docker network connect stock-sim-shared minio
```

compose 会把 **api** 自动加入 `shared`；**不会**自动加入外部 postgres/minio。  
若未创建网络，会报：`network stock-sim-shared not found`。

**或宿主机端口（Linux 常用）：** 改 `docker-compose.yml` 中：

```yaml
DATABASE_URL: postgresql+psycopg://${POSTGRES_USER}:${POSTGRES_PASSWORD}@172.17.0.1:${POSTGRES_PORT:-5432}/${POSTGRES_DB}
MINIO_ENDPOINT: http://172.17.0.1:${MINIO_API_PORT:-9000}
```

（Windows Docker Desktop 可用 `host.docker.internal`。）

### 4.3 启动

```bash
docker compose up -d --build
```

验证：`http://127.0.0.1:8080/api/health/db`。

---

## 5. 环境变量要点

| 变量 | 作用 |
| --- | --- |
| `CORS_ORIGINS` | 浏览器 Origin 白名单；局域网必须加 `http://局域网IP:8080` |
| `MINIO_PUBLIC_ENDPOINT` | 返回给浏览器的对象 URL；局域网勿用 `127.0.0.1` |
| `MINIO_ENDPOINT` | api **容器内**访问 MinIO（模式 A 固定本机；模式 B 为 `minio` 或宿主机） |
| `VITE_API_BASE_URL` | 留空，走同域 `/api` |

### 哪些数据跨设备共享

| 数据 | 存储 | 跨电脑 |
| --- | --- | --- |
| 复盘 / 笔记 / 行情等 | PostgreSQL | ✅ |
| 笔记图片 | MinIO | ✅（公网/局域网地址配对） |
| 做 T、均摊历史等 | 浏览器 `localStorage` | ❌ |

---

## 6. 架构示意

### 模式 A（单容器）

```text
浏览器 → :8080 → [stock-sim 容器]
                    Nginx → 静态页
                         → 127.0.0.1:8000 FastAPI
                    PostgreSQL / MinIO（同容器，volume 持久化）
浏览器 → :9000 → MinIO（笔记图片）
```

### 模式 B

```text
浏览器 → web:8080 → Nginx → api:8000
api → postgres / minio（外部容器或宿主机端口）
```

---

## 7. 日常命令

### 模式 A

```bash
docker compose -f docker-compose.allinone.yml ps
docker compose -f docker-compose.allinone.yml logs -f app
docker compose -f docker-compose.allinone.yml stop
docker compose -f docker-compose.allinone.yml up -d
docker compose -f docker-compose.allinone.yml build --no-cache app
docker compose -f docker-compose.allinone.yml up -d --force-recreate app
docker exec -it stock-sim bash
```

### 模式 B

```bash
docker compose ps
docker compose logs -f api
docker compose build --no-cache web api
docker compose up -d --force-recreate web api
```

---

## 8. 常见问题

### 8.1 `network stock-sim-shared not found`

你在跑 **模式 B** 的 `docker-compose.yml`。先：

```bash
docker network create stock-sim-shared
```

或改用模式 A：`docker compose -f docker-compose.allinone.yml up -d --build`。

### 8.2 模式 B：`Temporary failure in name resolution` / `Name or service not known`

api 解析不到 `postgres`。按 [4.2](#42-连通方式二选一) 做网络 connect 或改宿主机地址。

### 8.3 一体机构建失败（rollup）

一体机 Dockerfile 已使用 bookworm + 显式安装 `@rollup/rollup-linux-x64-gnu`。仍失败时：

```bash
docker builder prune -f
docker compose -f docker-compose.allinone.yml build --no-cache app
```

### 8.4 拉取基础镜像 / MinIO 二进制失败

配置 Docker registry mirror，或检查出网；一体机还需能访问 `dl.min.io` 下载 MinIO。

### 8.5 迁移版本冲突

```bash
# 模式 A
docker exec -it stock-sim bash -c 'cd /app && alembic current'

# 模式 B
docker compose exec api alembic current
```

无重要数据时可删库重建后重启容器。

### 8.6 局域网无法安全连接

用 `http://` 不是 `https://`。

### 8.7 git pull 后页面仍旧

必须 `build --no-cache` + `--force-recreate`，并 Ctrl+F5。

### 8.8 做 T 记录其他电脑看不到

`localStorage`，不在数据库中，属预期行为。

---

## 9. 部署清单

### 模式 A（一体机）

1. [ ] 安装 Docker  
2. [ ] `cp .env.example.A .env`，改 CORS / MinIO 公网地址 / 密码  
3. [ ] `docker compose -f docker-compose.allinone.yml up -d --build`  
4. [ ] 打开 `http://服务器:8080` 与 `/api/health/db`  
5. [ ] （可选）放行 8080、9000  

### 模式 B

1. [ ] 已有 `postgres`、`minio`  
2. [ ] `cp .env.example.B .env`，账号与已有服务一致；局域网改 CORS / `MINIO_PUBLIC_ENDPOINT`  
3. [ ] 创建库 + 配网络（`stock-sim-shared`）或宿主机连接  
4. [ ] `docker compose up -d --build`  
5. [ ] 验证健康检查  

---

## 10. 模式对比与注意

| | 模式 A 一体机 | 模式 B 拆分 |
| --- | --- | --- |
| 容器数 | 1 | 2（+ 外部库） |
| 运维复杂度 | 低，适合内网试用 | 需处理网络/主机名 |
| 扩展性 | 差（库与应用耦合） | 更好 |
| 生产建议 | 可用但非最佳实践 | 更接近常见部署 |

一体机把数据库打进同一容器，便于「拷走就跑」；若以后要独立扩容或单独备份策略，可迁到模式 B 或标准多服务 compose。

---

## 修订记录

| 日期 | 说明 |
| --- | --- |
| 2026-08-13 | 初稿 |
| 2026-08-26 | 模式 B、排错合集 |
| 2026-09-02 | 对照实践修正文档 |
| 2026-09-29 | **模式 A 改为单容器一体机**（`docker-compose.allinone.yml` + `docker/allinone`）；原多服务全栈改为一体机；`docker-compose.yml` 专用于模式 B |
