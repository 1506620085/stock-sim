from functools import lru_cache
from os import getenv

from dotenv import load_dotenv

load_dotenv()


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


@lru_cache
def get_settings() -> Settings:
    return Settings()
