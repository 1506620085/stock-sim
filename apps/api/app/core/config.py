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

    # Object storage
    storage_type: str = getenv("STORAGE_TYPE", "minio")

    minio_endpoint: str = getenv("MINIO_ENDPOINT", "http://127.0.0.1:9000")
    minio_access_key: str = getenv("MINIO_ACCESS_KEY", "minioadmin")
    minio_secret_key: str = getenv("MINIO_SECRET_KEY", "minioadmin")
    minio_bucket: str = getenv("MINIO_BUCKET", "stock-review")
    minio_region: str = getenv("MINIO_REGION", "")
    minio_use_ssl: bool = getenv("MINIO_USE_SSL", "false").lower() in {"1", "true", "yes"}

    tencent_secret_id: str = getenv("TENCENT_SECRET_ID", "")
    tencent_secret_key: str = getenv("TENCENT_SECRET_KEY", "")
    tencent_region: str = getenv("TENCENT_REGION", "ap-guangzhou")
    tencent_bucket: str = getenv("TENCENT_BUCKET", "")

    aliyun_endpoint: str = getenv("ALIYUN_ENDPOINT", "oss-cn-guangzhou.aliyuncs.com")
    aliyun_access_key_id: str = getenv("ALIYUN_ACCESS_KEY_ID", "")
    aliyun_access_key_secret: str = getenv("ALIYUN_ACCESS_KEY_SECRET", "")
    aliyun_bucket: str = getenv("ALIYUN_BUCKET", "")

    qiniu_access_key: str = getenv("QINIU_ACCESS_KEY", "")
    qiniu_secret_key: str = getenv("QINIU_SECRET_KEY", "")
    qiniu_bucket: str = getenv("QINIU_BUCKET", "")
    qiniu_region: str = getenv("QINIU_REGION", "z2")
    qiniu_domain: str = getenv("QINIU_DOMAIN", "https://your-domain.com")

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
