from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

from app.core.config import get_settings
from app.routers import health, instruments, replay_sessions, settings as settings_router, stats, trades, watchlist

settings = get_settings()

app = FastAPI(title=settings.app_name, version=settings.app_version)

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
app.include_router(settings_router.router)
