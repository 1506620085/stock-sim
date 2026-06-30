from functools import lru_cache
from os import getenv

from dotenv import load_dotenv

load_dotenv()

DEFAULT_CORS_ORIGINS = "http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:4173,http://localhost:4173"


class Settings:
    app_name: str = "Stock Sim API"
    app_version: str = "0.1.0"
    app_env: str = getenv("APP_ENV", "development")
    database_url: str = getenv(
        "DATABASE_URL",
        "postgresql+psycopg://stock_sim:stock_sim@localhost:5432/stock_sim",
    )
    market_data_provider: str = getenv("MARKET_DATA_PROVIDER", "akshare")
    timezone: str = getenv("TIMEZONE", "Asia/Shanghai")
    cors_origins: str = getenv("CORS_ORIGINS", DEFAULT_CORS_ORIGINS)
    trust_proxy_headers: bool = getenv("TRUST_PROXY_HEADERS", "false").lower() in {"1", "true", "yes"}

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
