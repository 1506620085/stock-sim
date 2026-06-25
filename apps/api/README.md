# Stock Sim API

FastAPI backend for the stock replay training system.

## Local Setup

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
```

Start PostgreSQL from the repository root:

```bash
docker compose up -d postgres
```

Run database migrations from `apps/api`:

```bash
alembic upgrade head
```

Start the API:

```bash
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Health checks:

```text
http://127.0.0.1:8000/api/health
http://127.0.0.1:8000/api/health/db
```

## Environment

```env
APP_ENV=development
DATABASE_URL=postgresql+psycopg://stock_sim:stock_sim@localhost:5432/stock_sim
MARKET_DATA_PROVIDER=akshare
TIMEZONE=Asia/Shanghai
```
