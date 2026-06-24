# 股票 K 线复盘训练系统

这是一个用于股票/ETF 历史 K 线复盘训练的本地网站项目。当前仓库已经进入正式工程结构，旧静态 demo 保留在 `prototype/` 中作为交互参考。

## 目录结构

```text
apps/
  web/      React + TypeScript + Vite 前端
  api/      FastAPI 后端
docs/       设计文档与开发顺序
prototype/ 旧静态交互原型
```

## 启动前端

正式前端不能直接双击打开 `apps/web/index.html`。Vite 使用 ES module，必须通过本地开发服务器访问，否则浏览器会出现 `file://` CORS 报错。

```bash
npm install
npm run dev:web
```

然后访问：

```text
http://127.0.0.1:5173
```

## 启动后端

```bash
cd apps/api
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

健康检查：

```text
http://127.0.0.1:8000/api/health
```

## 运行旧原型

旧静态原型位于 `prototype/`，它可以直接打开 HTML，也可以运行静态服务：

```bash
cd prototype
node serve.mjs
```

然后访问：

```text
http://127.0.0.1:5173
```

## 文档

- `docs/设计文档.md`
- `docs/开发内容顺序.md`
