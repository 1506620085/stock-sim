from typing import BinaryIO
from urllib.parse import urlparse

from minio import Minio
from minio.error import S3Error

from app.services.storage.base import StorageProvider
from app.services.storage.types import StorageObject
from app.services.storage.utils import normalize_key, read_payload


def _parse_minio_endpoint(endpoint: str, use_ssl: bool) -> tuple[str, bool]:
    raw = endpoint.strip()
    if "://" not in raw:
        raw = f"http://{raw}"
    parsed = urlparse(raw)
    host = parsed.netloc or parsed.path
    secure = use_ssl or parsed.scheme == "https"
    return host, secure


class MinioStorageProvider(StorageProvider):
    def __init__(
        self,
        *,
        endpoint: str,
        access_key: str,
        secret_key: str,
        bucket: str,
        region: str = "",
        use_ssl: bool = False,
    ) -> None:
        host, secure = _parse_minio_endpoint(endpoint, use_ssl)
        self._bucket = bucket
        self._client = Minio(
            host,
            access_key=access_key,
            secret_key=secret_key,
            secure=secure,
            region=region or None,
        )
        self._ensure_bucket()

    def _ensure_bucket(self) -> None:
        if not self._client.bucket_exists(self._bucket):
            self._client.make_bucket(self._bucket)

    def upload(
        self,
        *,
        key: str,
        data: bytes | BinaryIO,
        content_type: str | None = None,
        size: int | None = None,
    ) -> StorageObject:
        object_key = normalize_key(key)
        payload, payload_size = read_payload(data, size)
        self._client.put_object(
            self._bucket,
            object_key,
            payload,
            payload_size,
            content_type=content_type or "application/octet-stream",
        )
        return StorageObject(
            key=object_key,
            url=self.get_url(object_key),
            bucket=self._bucket,
            content_type=content_type,
            size=payload_size,
        )

    def delete(self, key: str) -> None:
        self._client.remove_object(self._bucket, normalize_key(key))

    def get_url(self, key: str, *, expires_in: int = 3600) -> str:
        from datetime import timedelta

        return self._client.presigned_get_object(
            self._bucket,
            normalize_key(key),
            expires=timedelta(seconds=expires_in),
        )

    def exists(self, key: str) -> bool:
        try:
            self._client.stat_object(self._bucket, normalize_key(key))
            return True
        except S3Error:
            return False
