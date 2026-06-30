# 股票 K 线复盘训练系统

这是一个用于股票/ETF 历史 K 线复盘训练的本地网站项目。旧静态 demo 保留在 `prototype/` 作为交互参考，正式工程位于 `apps/web` 和 `apps/api`。

## 目录结构

```text
apps/
  web/      React + TypeScript + Vite 前端
  api/      FastAPI + PostgreSQL 后端
docs/       设计文档与开发内容顺序
prototype/ 旧静态交互原型
```

## 启动前端

正式前端不能直接双击打开 `apps/web/index.html`。Vite 使用 ES module，必须通过本地开发服务器访问。

```bash
npm install
npm run dev:web
```

访问：

```text
http://127.0.0.1:5173
```

前端默认通过相对路径 `/api/...` 访问后端；开发时由 Vite 代理到 `http://127.0.0.1:8000`，无需跨域。若需直连后端，可在 `apps/web/.env` 设置 `VITE_API_BASE_URL=http://127.0.0.1:8000`。

## 启动 PostgreSQL

项目主数据库为 PostgreSQL。可以在仓库根目录启动本地数据库：

```bash
docker compose up -d postgres
```

默认连接：

```text
postgresql+psycopg://stock_sim:stock_sim@localhost:5432/stock_sim
```

## 启动后端

```bash
cd apps/api
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
alembic upgrade head
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

健康检查：

```text
http://127.0.0.1:8000/api/health
http://127.0.0.1:8000/api/health/db
```

## 运行旧原型

旧静态原型位于 `prototype/`：

```bash
cd prototype
node serve.mjs
```

访问：

```text
http://127.0.0.1:5173
```

## 文档

- `docs/设计文档.md`
- `docs/开发内容顺序.md`
