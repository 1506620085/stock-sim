from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

from app.core.config import get_settings
from app.routers import health, instruments, notes, replay_sessions, settings as settings_router, stats, storage, trades, watchlist

settings = get_settings()

app = FastAPI(title=settings.app_name, version=settings.app_version)


@app.exception_handler(Exception)
async def unhandled_exception_handler(_: Request, exc: Exception) -> JSONResponse:
    detail = str(exc) if settings.app_env == "development" else "服务器内部错误，请稍后重试"
    return JSONResponse(status_code=500, content={"detail": detail})


if settings.trust_proxy_headers:
    app.add_middleware(ProxyHeadersMiddleware, trusted_hosts="*")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(instruments.router)
app.include_router(watchlist.router)
app.include_router(replay_sessions.router)
app.include_router(trades.router)
app.include_router(stats.router)
app.include_router(notes.router)
app.include_router(storage.router)
app.include_router(settings_router.router)
