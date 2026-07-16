from app.core.config import Settings
from app.services.storage.base import StorageProvider

SUPPORTED_STORAGE_TYPES = ("minio", "tencent", "aliyun", "qiniu")


def _require(value: str, name: str, storage_type: str) -> str:
    if not value.strip():
        raise ValueError(f"{name} is required when STORAGE_TYPE={storage_type}")
    return value.strip()


def create_storage_provider(settings: Settings) -> StorageProvider:
    storage_type = settings.storage_type.lower().strip()

    if storage_type == "minio":
        from app.services.storage.minio_provider import MinioStorageProvider

        return MinioStorageProvider(
            endpoint=settings.minio_endpoint,
            access_key=settings.minio_access_key,
            secret_key=settings.minio_secret_key,
            bucket=_require(settings.minio_bucket, "MINIO_BUCKET", storage_type),
            region=settings.minio_region,
            use_ssl=settings.minio_use_ssl,
        )

    if storage_type == "tencent":
        from app.services.storage.tencent_provider import TencentCosStorageProvider

        return TencentCosStorageProvider(
            secret_id=_require(settings.tencent_secret_id, "TENCENT_SECRET_ID", storage_type),
            secret_key=_require(settings.tencent_secret_key, "TENCENT_SECRET_KEY", storage_type),
            region=_require(settings.tencent_region, "TENCENT_REGION", storage_type),
            bucket=_require(settings.tencent_bucket, "TENCENT_BUCKET", storage_type),
        )

    if storage_type == "aliyun":
        from app.services.storage.aliyun_provider import AliyunOssStorageProvider

        return AliyunOssStorageProvider(
            endpoint=_require(settings.aliyun_endpoint, "ALIYUN_ENDPOINT", storage_type),
            access_key_id=_require(settings.aliyun_access_key_id, "ALIYUN_ACCESS_KEY_ID", storage_type),
            access_key_secret=_require(settings.aliyun_access_key_secret, "ALIYUN_ACCESS_KEY_SECRET", storage_type),
            bucket=_require(settings.aliyun_bucket, "ALIYUN_BUCKET", storage_type),
        )

    if storage_type == "qiniu":
        from app.services.storage.qiniu_provider import QiniuKodoStorageProvider

        return QiniuKodoStorageProvider(
            access_key=_require(settings.qiniu_access_key, "QINIU_ACCESS_KEY", storage_type),
            secret_key=_require(settings.qiniu_secret_key, "QINIU_SECRET_KEY", storage_type),
            bucket=_require(settings.qiniu_bucket, "QINIU_BUCKET", storage_type),
            region=settings.qiniu_region,
            domain=settings.qiniu_domain,
        )

    supported = ", ".join(SUPPORTED_STORAGE_TYPES)
    raise ValueError(f"Unsupported STORAGE_TYPE={storage_type!r}. Supported values: {supported}")
