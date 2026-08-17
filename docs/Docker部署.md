# Docker 部署指南

按本文从上到下操作，可在本机一键拉起：**PostgreSQL + MinIO + API + Web**。

相关文件：

| 文件 | 作用 |
| --- | --- |
| `docker-compose.yml` | 编排四类服务 |
| `.env.example` | 环境变量模板（复制为 `.env`） |
| `apps/api/Dockerfile` | 后端镜像（启动时自动 `alembic upgrade`） |
| `apps/web/Dockerfile` | 前端多阶段构建 + Nginx |
| `apps/web/nginx.conf` | 静态资源 + `/api` 反代 |

---

## 0. 前置条件

1. 安装 [Docker Desktop](https://www.docker.com/products/docker-desktop/)（Windows / macOS）或 Docker Engine + Compose 插件（Linux）。
2. 确认命令可用：

```bash
docker version
docker compose version
```

3. 建议可用内存 ≥ 4GB（构建前端 + 拉 akshare 依赖时更稳）。
4. 在**仓库根目录**执行下文所有命令（与 `docker-compose.yml` 同级）。

---

## 1. 准备环境变量

```bash
# Windows PowerShell
Copy-Item .env.example .env

# macOS / Linux
cp .env.example .env
```

默认即可完成本地部署。常用可改项：

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `WEB_PORT` | `8080` | 浏览器访问端口 |
| `POSTGRES_PASSWORD` | `stock_sim` | 生产请改强密码 |
| `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` | `minioadmin` | 生产请修改 |
| `CORS_ORIGINS` | `http://127.0.0.1:8080,...` | 若改了 `WEB_PORT` 或域名，一并改这里 |
| `MINIO_PUBLIC_ENDPOINT` | `http://127.0.0.1:9000` | 浏览器打开对象 URL 的地址；换机器/域名时改成可达地址 |

> Compose 会读取根目录 `.env`。没有该文件时，`env_file: .env` 会导致 api 启动失败。

---

## 2. 构建并启动全部服务

```bash
docker compose up -d --build
```

首次会构建 `api`、`web` 镜像，耗时可能数分钟，属正常。

启动顺序（由 Compose 依赖保证）：

1. `postgres` 健康检查通过  
2. `minio` 启动  
3. `api` 运行迁移后监听 `8000`  
4. `web`（Nginx）对外提供 `8080`

查看状态：

```bash
docker compose ps
docker compose logs -f api
```

看到类似 `[api] migrations applied` 且 `stock-sim-api` / `stock-sim-web` 为 healthy / running 即可。

---

## 3. 验证是否部署成功

在浏览器或命令行检查：

| 检查项 | 地址 |
| --- | --- |
| 前端页面 | http://127.0.0.1:8080 |
| API 健康 | http://127.0.0.1:8080/api/health |
| API 数据库 | http://127.0.0.1:8080/api/health/db |
| API 直连（可选） | http://127.0.0.1:8000/api/health |
| MinIO 控制台 | http://127.0.0.1:9001 （账号见 `.env`） |

期望：

- 前端能打开复盘工作台  
- `/api/health` 返回正常 JSON  
- `/api/health/db` 表示数据库可连  

---

## 4. 日常使用命令

```bash
# 查看日志
docker compose logs -f web
docker compose logs -f api

# 停止（保留数据卷）
docker compose stop

# 再次启动（不重新构建）
docker compose up -d

# 改代码或依赖后重新构建
docker compose up -d --build

# 进入 API 容器（调试）
docker compose exec api sh
```

---

## 5. 仅启动数据库（本地开发模式）

若仍用本机 `npm run dev` + `uvicorn`，只需库：

```bash
docker compose up -d postgres
```

然后按根目录 `README.md` 启动前后端；`DATABASE_URL` 指向 `localhost:5432`。

可选一并起 MinIO：

```bash
docker compose up -d postgres minio
```

---

## 6. 数据备份与恢复

数据卷：

- `stock_sim_postgres_data` — 行情、复盘、交易等  
- `stock_sim_minio_data` — 笔记等对象存储  

### 备份 PostgreSQL

```bash
docker compose exec -T postgres pg_dump -U stock_sim stock_sim > backup_stock_sim.sql
```

### 恢复 PostgreSQL

```bash
type backup_stock_sim.sql | docker compose exec -T postgres psql -U stock_sim -d stock_sim
# macOS / Linux:
# cat backup_stock_sim.sql | docker compose exec -T postgres psql -U stock_sim -d stock_sim
```

### 备份 / 清理卷（慎用）

```bash
# 列出卷
docker volume ls | findstr stock_sim

# 停止并删除容器与卷（会清空数据库与 MinIO！）
docker compose down -v
```

---

## 7. 架构说明（便于排错）

```text
浏览器
  │
  ├─ http://127.0.0.1:8080/          → web (Nginx 静态)
  ├─ http://127.0.0.1:8080/api/...   → Nginx 反代 → api:8000
  └─ http://127.0.0.1:9000/...       → minio（预签名下载，笔记图片）

api 容器内：
  DATABASE_URL → postgres:5432
  MINIO_ENDPOINT → http://minio:9000
  MINIO_PUBLIC_ENDPOINT → http://127.0.0.1:9000（写进浏览器可打开的 URL）
```

前端构建时 `VITE_API_BASE_URL` 留空，请求走相对路径 `/api`，避免跨域。

---

## 8. 常见问题

### 8.1 `env file .env not found`

先执行第 1 步复制 `.env.example` → `.env`。

### 8.2 前端能开，接口 502 / 失败

```bash
docker compose ps
docker compose logs api --tail=100
```

确认 `api` healthy；确认本机 `8080` 未被占用。

### 8.3 数据库迁移失败

```bash
docker compose logs api --tail=200
docker compose exec api alembic current
docker compose exec api alembic upgrade head
```

### 8.4 笔记图片打不开

检查：

1. MinIO 端口 `9000` 已映射  
2. `.env` 中 `MINIO_PUBLIC_ENDPOINT` 是**浏览器能访问**的地址（本机一般是 `http://127.0.0.1:9000`）  
3. 修改后重建/重启 api：`docker compose up -d api`

### 8.5 改了前端代码页面没变

需重新构建 web 镜像：

```bash
docker compose up -d --build web
```

### 8.6 Windows 换行导致 entrypoint 失败

API Dockerfile 已做 `sed` 去除 `\r`。若仍异常，确认 `apps/api/docker/entrypoint.sh` 为 LF。

### 8.7 端口冲突

在 `.env` 中修改 `WEB_PORT` / `API_PORT` / `POSTGRES_PORT` / `MINIO_API_PORT`，并同步 `CORS_ORIGINS`、`MINIO_PUBLIC_ENDPOINT`。

---

## 9. 推荐部署顺序（清单）

按顺序勾选：

1. [ ] 安装 Docker，确认 `docker compose version`  
2. [ ] 进入仓库根目录  
3. [ ] `Copy-Item .env.example .env`（或 `cp`）  
4. [ ] （可选）修改密码与端口  
5. [ ] `docker compose up -d --build`  
6. [ ] `docker compose ps` 全部正常  
7. [ ] 打开 http://127.0.0.1:8080  
8. [ ] 检查 http://127.0.0.1:8080/api/health/db  
9. [ ] （可选）配置定时备份 `pg_dump`  

完成以上即可按 Docker 方式使用整站。本地热更新开发仍建议用 README 中的「仅 postgres + 本机前后端」方式。

---

## 修订记录

| 日期 | 说明 |
| --- | --- |
| 2026-08-13 | 初稿：全栈 Compose、API/Web Dockerfile、顺序化部署说明 |
