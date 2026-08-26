# Docker 部署指南

本文说明如何在 **Windows / Linux 服务器** 上用 Docker 部署股票 K 线复盘训练系统。

项目默认由 **Web（Nginx）+ API（FastAPI）+ PostgreSQL + MinIO** 组成。根据你的环境，可选择：

| 模式 | 适用场景 | 启动命令 |
| --- | --- | --- |
| **A. 全栈独立部署** | 干净机器、无已有数据库/对象存储 | `docker compose up -d --build` |
| **B. 复用已有容器** | 服务器上已有名为 `postgres`、`minio` 的容器 | 见 [第 4 节](#4-模式-b复用已有-postgres--minio) |

相关文件：

| 文件 | 作用 |
| --- | --- |
| `docker-compose.yml` | 服务编排 |
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

3. 建议可用内存 ≥ 4GB（构建前端 + 安装 akshare 依赖时更稳）。
4. 下文所有命令均在**仓库根目录**执行（与 `docker-compose.yml` 同级）。

### 服务器防火墙（按需）

| 端口 | 是否建议对外开放 | 用途 |
| --- | --- | --- |
| `8080`（`WEB_PORT`） | 是 | 浏览器访问站点 |
| `9000`（`MINIO_API_PORT`） | 是 | 笔记图片等对象下载 |
| `8000`（`API_PORT`） | 否 | API 直连；日常走 `8080/api` 即可 |
| `9001` | 否 | MinIO 控制台 |
| `5432` | **否** | 数据库，勿对公网开放 |

---

## 1. 获取代码

任选一种方式将项目放到服务器：

```bash
# 方式 A：git clone
git clone <仓库地址> stock-sim
cd stock-sim

# 方式 B：本机打包上传后解压
# scp / unzip 到服务器后 cd 进入目录
```

> **说明**：部署**不一定**必须在服务器上 `git clone` 整仓。也可在本机/CI 构建好镜像后传到服务器运行；但按本文操作，在服务器上拉代码并 `docker compose up --build` 是最直接的方式。

---

## 2. 准备环境变量

```bash
# Windows PowerShell
Copy-Item .env.example .env

# macOS / Linux
cp .env.example .env
```

编辑 `.env`，至少确认以下项：

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `WEB_PORT` | `8080` | 浏览器访问端口 |
| `API_PORT` | `8000` | API 映射端口 |
| `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` | `stock_sim` | 数据库连接信息 |
| `CORS_ORIGINS` | `http://127.0.0.1:8080,...` | 浏览器实际打开站点的地址；改端口或域名时必改 |
| `MINIO_PUBLIC_ENDPOINT` | `http://127.0.0.1:9000` | 浏览器访问 MinIO 的地址；部署到服务器时改为 `http://服务器IP:9000` 或域名 |
| `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` | `minioadmin` | 生产环境请修改 |
| `VITE_API_BASE_URL` | 留空 | 留空表示前端走相对路径 `/api`，由 Nginx 反代，**推荐** |

> Compose 会读取根目录 `.env`。没有该文件时，`env_file: .env` 会导致 api 启动失败。

### 部署到远程服务器时示例

假设服务器 IP 为 `192.168.1.100`：

```env
WEB_PORT=8080
CORS_ORIGINS=http://192.168.1.100:8080
MINIO_PUBLIC_ENDPOINT=http://192.168.1.100:9000
POSTGRES_PASSWORD=改成强密码
MINIO_ACCESS_KEY=改成强账号
MINIO_SECRET_KEY=改成强密码
```

---

## 3. 模式 A：全栈独立部署

适用于：**机器上没有占用端口的 Postgres / MinIO**，或希望本项目完全自包含。

### 3.1 启用 compose 中的 postgres 与 minio

打开 `docker-compose.yml`，**取消注释** `postgres`、`minio` 两个 service 块，以及 `api` 下的 `depends_on`：

```yaml
api:
  depends_on:
    postgres:
      condition: service_healthy
    minio:
      condition: service_started
```

若使用模式 A，可**删除或注释** `api` 的 `networks.shared` 与文件底部的 `networks.shared` 外部网络配置（模式 B 才需要）。

### 3.2 构建并启动

```bash
docker compose up -d --build
```

首次会构建 `api`、`web` 镜像，可能耗时数分钟。

启动顺序（由 Compose 依赖保证）：

1. `postgres` 健康检查通过
2. `minio` 启动
3. `api` 执行 `alembic upgrade head` 后监听 `8000`
4. `web`（Nginx）对外提供 `8080`

### 3.3 验证

```bash
docker compose ps
docker compose logs -f api
```

日志中应出现 `[api] migrations applied`。

| 检查项 | 地址 |
| --- | --- |
| 前端页面 | http://127.0.0.1:8080 |
| API 健康 | http://127.0.0.1:8080/api/health |
| API 数据库 | http://127.0.0.1:8080/api/health/db |
| API 直连（可选） | http://127.0.0.1:8000/api/health |
| MinIO 控制台 | http://127.0.0.1:9001 |

---

## 4. 模式 B：复用已有 postgres / minio

适用于：服务器上**已有独立容器**，且容器名分别为 `postgres`、`minio`（端口通常已映射 `5432`、`9000`）。

当前仓库默认 `docker-compose.yml` 即为此模式：`postgres`、`minio` 服务被注释，只启动 `api` + `web`。

### 4.1 检查端口与容器

```bash
docker ps
```

确认：

- 存在名为 `postgres`、`minio` 的容器且在运行
- 端口 `5432`、`9000` 未被其他进程占用（或与 `.env` 中配置一致）

### 4.2 准备数据库

在已有 Postgres 中创建项目库（若尚未创建）：

```bash
docker exec -it postgres psql -U postgres -c "CREATE DATABASE stock_sim;"
```

`.env` 中的 `POSTGRES_USER`、`POSTGRES_PASSWORD` 必须与已有 Postgres 的账号一致。例如使用 `postgres/postgres`：

```env
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=stock_sim
```

### 4.3 准备 MinIO

确认 MinIO 中已存在 bucket（默认 `stock-review`），且 `.env` 中 `MINIO_ACCESS_KEY`、`MINIO_SECRET_KEY` 与已有 MinIO 一致。

可在 MinIO 控制台（通常 `http://服务器IP:9001`）手动创建 bucket。

### 4.4 创建共享网络并接入容器

容器之间要通过**主机名**互访（如 `postgres`、`minio`），必须处于**同一自定义 Docker 网络**。默认 `bridge` 网络通常无法靠容器名解析。

```bash
# 1. 创建共享网络（已存在会报错，可忽略）
docker network create stock-sim-shared

# 2. 将已有容器接入网络
docker network connect stock-sim-shared postgres
docker network connect stock-sim-shared minio
```

`docker-compose.yml` 中 `api` 已配置加入该网络：

```yaml
api:
  networks:
    - default    # web → api
    - shared     # api → postgres / minio

networks:
  shared:
    external: true
    name: stock-sim-shared
```

网络关系：

```text
stock-sim-shared（自定义网络）
  ├── postgres
  ├── minio
  └── stock-sim-api

stock-sim_default（Compose 默认网络）
  ├── stock-sim-api
  └── stock-sim-web  →  反代到 api:8000
```

### 4.5 构建并启动 api + web

```bash
docker compose up -d --build web api
```

> **说明**：即使只执行 `docker compose up -d web api`，Docker Desktop 仍可能在 `stock-sim` 项目下显示 `postgres`、`minio` 条目——那是 compose 文件里**曾经定义过**或项目分组展示所致，**不代表它们被启动**。模式 B 下实际运行的只有 `stock-sim-api` 与 `stock-sim-web`。

### 4.6 验证网络连通

```bash
# 查看共享网络成员
docker network inspect stock-sim-shared --format "{{range .Containers}}{{.Name}} {{end}}"

# 应包含：postgres minio stock-sim-api

# 在 api 容器内测试解析
docker exec stock-sim-api ping -c 1 postgres
docker exec stock-sim-api ping -c 1 minio
```

### 4.7 备选：不走 Docker 网络，改走宿主机端口

若不想配置共享网络，可在 `docker-compose.yml` 的 `api.environment` 中改为：

```yaml
DATABASE_URL: postgresql+psycopg://${POSTGRES_USER}:${POSTGRES_PASSWORD}@host.docker.internal:${POSTGRES_PORT:-5432}/${POSTGRES_DB}
MINIO_ENDPOINT: http://host.docker.internal:${MINIO_API_PORT:-9000}
```

Windows / macOS 的 Docker Desktop 支持 `host.docker.internal`；Linux 可能需要额外配置或使用宿主机内网 IP（如 `172.17.0.1`）。

---

## 5. 环境变量与网络说明

### 5.1 两类 MinIO 地址

| 变量 | 谁使用 | 示例 | 能否写 `minio` |
| --- | --- | --- | --- |
| `MINIO_ENDPOINT` | **api 容器内部**访问 MinIO | `http://minio:9000` | 可以（需同一 Docker 网络） |
| `MINIO_PUBLIC_ENDPOINT` | **浏览器**打开签名 URL | `http://192.168.1.100:9000` | 不可以，必须写浏览器可达地址 |

### 5.2 两类数据库地址

| 场景 | `DATABASE_URL` 主机部分 |
| --- | --- |
| Compose 自带 postgres（模式 A） | `postgres` |
| 复用已有容器 + 共享网络（模式 B） | `postgres` |
| 复用已有容器 + 宿主机端口 | `host.docker.internal` 或宿主机 IP |

> `docker-compose.yml` 中 `api.environment.DATABASE_URL` 会**覆盖** `.env` 里的 `DATABASE_URL`。

---

## 6. 架构说明

```text
浏览器
  │
  ├─ http://服务器:8080/           → web (Nginx 静态)
  ├─ http://服务器:8080/api/...    → Nginx 反代 → api:8000
  └─ http://服务器:9000/...        → minio（预签名下载，笔记图片）

api 容器内（模式 B + 共享网络）：
  DATABASE_URL      → postgres:5432
  MINIO_ENDPOINT    → http://minio:9000
  MINIO_PUBLIC_ENDPOINT → http://服务器IP:9000（写入返回给浏览器的 URL）
```

前端构建时 `VITE_API_BASE_URL` 留空，请求走相对路径 `/api`，避免跨域。

---

## 7. 日常使用命令

```bash
# 查看状态
docker compose ps

# 查看日志
docker compose logs -f api
docker compose logs -f web

# 停止（保留数据卷 / 外部数据库数据）
docker compose stop

# 再次启动（不重新构建）
docker compose up -d

# 改代码或依赖后重新构建
docker compose up -d --build

# 只重建前端
docker compose up -d --build web

# 只重启后端（例如改了 .env 中 MinIO 地址）
docker compose up -d --force-recreate api

# 进入 API 容器调试
docker compose exec api sh
```

---

## 8. 数据备份与恢复

### 模式 A（Compose 自带 postgres）

```bash
docker compose exec -T postgres pg_dump -U stock_sim stock_sim > backup_stock_sim.sql
```

恢复：

```bash
# Windows
type backup_stock_sim.sql | docker compose exec -T postgres psql -U stock_sim -d stock_sim

# macOS / Linux
cat backup_stock_sim.sql | docker compose exec -T postgres psql -U stock_sim -d stock_sim
```

数据卷：

- `stock_sim_postgres_data` — PostgreSQL 数据
- `stock_sim_minio_data` — MinIO 数据

### 模式 B（复用已有 postgres）

```bash
docker exec -T postgres pg_dump -U postgres stock_sim > backup_stock_sim.sql
```

> **慎用** `docker compose down -v`：会删除 Compose 管理的卷；模式 B 下主要数据在已有容器中，但仍可能影响本项目相关资源。

---

## 9. 常见问题与排错

### 9.1 `env file .env not found`

在仓库根目录执行：

```bash
Copy-Item .env.example .env   # Windows
cp .env.example .env          # Linux / macOS
```

### 9.2 前端构建失败：`Cannot find module @rollup/rollup-linux-x64-*`

**现象**（构建 `web` 镜像时）：

```text
Error: Cannot find module @rollup/rollup-linux-x64-gnu
# 或
Error: Cannot find module @rollup/rollup-linux-x64-musl
```

**原因**：`package-lock.json` 在 Windows 上生成，`npm ci` 在 Linux 容器内可能漏装 rollup 平台可选依赖；使用 Alpine（musl）镜像时更易出现。

**解决**：`apps/web/Dockerfile` 已做如下处理（请确保服务器上的代码包含这些修改）：

1. 构建阶段使用 `node:22-bookworm-slim`（glibc），不用 Alpine
2. `npm ci` 后显式安装：`npm install --no-save @rollup/rollup-linux-x64-gnu`

重建：

```bash
docker builder prune -f
docker compose build --no-cache web
docker compose up -d web api
```

### 9.3 API 启动失败：`Name or service not known`

**现象**：

```text
sqlalchemy.exc.OperationalError: (psycopg.OperationalError) [Errno -2] Name or service not known
```

**原因**：`api` 连接 `@postgres:5432` 或 `http://minio:9000`，但 `stock-sim-api` 与 `postgres` / `minio` **不在同一 Docker 网络**，无法解析主机名。常见于模式 B 且未执行 `docker network connect`，或 `--force-recreate api` 后丢失手动网络连接。

**解决**（任选其一）：

1. **共享网络**（推荐）：按 [4.4 节](#44-创建共享网络并接入容器) 操作，并确认 `docker-compose.yml` 中 `api.networks.shared` 已配置
2. **宿主机端口**：改用 `host.docker.internal`（见 [4.7 节](#47-备选不走-docker-网络改走宿主机端口)）

验证：

```bash
docker network inspect stock-sim-shared --format "{{range .Containers}}{{.Name}} {{end}}"
docker exec stock-sim-api ping -c 1 postgres
```

### 9.4 迁移失败：`Can't locate revision identified by '0006_knowledge_nodes'`

**现象**：

```text
FAILED: Can't locate revision identified by '0006_knowledge_nodes'
```

**原因**：数据库 `alembic_version` 表中记录的版本与**当前代码**中的迁移文件不一致。例如库曾被旧版/其他分支代码迁移过，而当前代码最新迁移为 `0006_trading_rules_tree`。

查看当前记录：

```bash
docker exec -it postgres psql -U postgres -d stock_sim -c "SELECT * FROM alembic_version;"
```

**解决**：

| 情况 | 做法 |
| --- | --- |
| 新部署、无重要数据 | 删库重建（最快） |
| 有数据且表结构已与当前代码一致 | 仅修正版本号 |
| 有数据但不确定 | 先备份再处理 |

**删库重建**（无重要数据时）：

```bash
docker exec -it postgres psql -U postgres -c "DROP DATABASE IF EXISTS stock_sim;"
docker exec -it postgres psql -U postgres -c "CREATE DATABASE stock_sim;"
docker compose up -d --force-recreate api
```

**仅修正版本号**（确认表结构已对齐时）：

```bash
docker exec -it postgres psql -U postgres -d stock_sim -c "UPDATE alembic_version SET version_num = '0006_trading_rules_tree';"
docker compose up -d api
```

手动排查迁移：

```bash
docker compose logs api --tail=200
docker compose exec api alembic current
docker compose exec api alembic upgrade head
```

### 9.5 只启动了 web / api，为什么 Docker Desktop 还显示 postgres、minio？

`docker-compose.yml` 中若仍**定义**了 `postgres`、`minio`（即使被注释或曾创建过），Docker Desktop 可能在 `stock-sim` 项目分组下展示它们。这不等于这些服务正在运行——看状态图标：虚线/停止表示未运行。

模式 B 下应确保 compose 里 `postgres`、`minio` 服务块保持注释，只启动 `api` + `web`。

### 9.6 前端能开，接口 502 / 失败

```bash
docker compose ps
docker compose logs api --tail=100
```

常见原因：

- `api` 未 healthy（数据库连不上、迁移失败）
- `8080` 端口被占用
- `web` 依赖 `api` 健康检查，api 起不来则 web 也无法正常反代

### 9.7 笔记图片打不开

检查：

1. MinIO 端口 `9000` 已映射且防火墙放行
2. `.env` 中 `MINIO_PUBLIC_ENDPOINT` 是**浏览器能访问**的地址（不能写 `minio` 或 `127.0.0.1`，除非浏览器就在同一台机器上）
3. bucket `stock-review` 已创建
4. 修改后重启 api：`docker compose up -d --force-recreate api`

### 9.8 端口冲突

若已有容器占用 `5432` / `9000` / `8080`：

- **模式 A**：在 `.env` 修改 `POSTGRES_PORT`、`MINIO_API_PORT`、`WEB_PORT`，并同步 `CORS_ORIGINS`、`MINIO_PUBLIC_ENDPOINT`
- **模式 B**：不要启动 compose 里的 postgres/minio，复用已有容器即可

### 9.9 改了前端代码页面没变

```bash
docker compose up -d --build web
```

### 9.10 Windows 换行导致 entrypoint 失败

API Dockerfile 已做 `sed` 去除 `\r`。若仍异常，确认 `apps/api/docker/entrypoint.sh` 为 LF 换行。

### 9.11 API 容器反复 Restarting

按顺序排查：

1. 看日志：`docker compose logs api --tail=50`
2. 若是 `Name or service not known` → [9.3](#93-api-启动失败name-or-service-not-known)
3. 若是 `Can't locate revision` → [9.4](#94-迁移失败cant-locate-revision-identified-by-0006_knowledge_nodes)
4. 若是认证失败 → 检查 `.env` 中 `POSTGRES_USER` / `POSTGRES_PASSWORD` 是否与已有 Postgres 一致

---

## 10. 推荐部署清单

### 模式 A（全栈）

1. [ ] 安装 Docker，确认 `docker compose version`
2. [ ] 进入仓库根目录
3. [ ] `cp .env.example .env` 并修改密码、端口、CORS、MinIO 公网地址
4. [ ] 取消注释 `docker-compose.yml` 中 `postgres`、`minio` 及 `depends_on`
5. [ ] `docker compose up -d --build`
6. [ ] `docker compose ps` 四个服务均 healthy / running
7. [ ] 打开 `http://服务器:8080`
8. [ ] 检查 `http://服务器:8080/api/health/db`
9. [ ] （建议）配置 `pg_dump` 定时备份

### 模式 B（复用已有 postgres / minio）

1. [ ] 确认已有容器名为 `postgres`、`minio` 且在运行
2. [ ] 进入仓库根目录，`cp .env.example .env`，账号密码与已有服务一致
3. [ ] 创建数据库 `stock_sim`（若不存在）
4. [ ] `docker network create stock-sim-shared`
5. [ ] `docker network connect stock-sim-shared postgres`
6. [ ] `docker network connect stock-sim-shared minio`
7. [ ] 确认 `docker-compose.yml` 中 `api.networks.shared` 已配置
8. [ ] `docker compose up -d --build web api`
9. [ ] 验证共享网络成员与 `ping postgres`
10. [ ] 打开 `http://服务器:8080` 并检查 `/api/health/db`
11. [ ] 若迁移版本冲突，按 [9.4](#94-迁移失败cant-locate-revision-identified-by-0006_knowledge_nodes) 处理

---

## 11. 其他说明

### 是否必须在服务器 git clone？

不是必须。也可以在本地/CI 构建镜像后传到服务器，服务器只需镜像 + `docker-compose.yml` + `.env`。但在服务器上 `git clone` 后 `docker compose up --build` 是最简单的入门方式。

### 本地热更新开发

不建议用 Docker 跑前后端做日常开发。可仅启动数据库：

```bash
# 模式 A 且已启用 postgres 服务时
docker compose up -d postgres minio
```

然后按根目录 `README.md` 用 `npm run dev` + 本机 `uvicorn` 开发。

---

## 修订记录

| 日期 | 说明 |
| --- | --- |
| 2026-08-13 | 初稿：全栈 Compose、API/Web Dockerfile、顺序化部署说明 |
| 2026-08-26 | 增补模式 B（复用已有 postgres/minio）、共享网络、rollup 构建修复、迁移版本冲突、排错合集 |
