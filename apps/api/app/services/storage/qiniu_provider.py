from typing import BinaryIO

from qiniu import Auth, BucketManager, put_data
from qiniu import config as qiniu_config

from app.services.storage.base import StorageProvider
from app.services.storage.types import StorageObject
from app.services.storage.utils import normalize_key, read_payload

_REGION_MAP = {
    "z0": qiniu_config.Zone_z0,
    "z1": qiniu_config.Zone_z1,
    "z2": qiniu_config.Zone_z2,
    "na0": qiniu_config.Zone_na0,
    "as0": qiniu_config.Zone_as0,
}


class QiniuKodoStorageProvider(StorageProvider):
    def __init__(
        self,
        *,
        access_key: str,
        secret_key: str,
        bucket: str,
        region: str = "z2",
        domain: str = "",
    ) -> None:
        self._auth = Auth(access_key, secret_key)
        self._bucket = bucket
        self._domain = domain.rstrip("/")
        zone = _REGION_MAP.get(region.lower())
        if zone is not None:
            qiniu_config.set_default(zone)
        self._bucket_manager = BucketManager(self._auth)

    def _build_public_url(self, key: str) -> str:
        object_key = normalize_key(key)
        if not self._domain:
            raise ValueError("QINIU_DOMAIN is required to build public access URLs")
        return f"{self._domain}/{object_key}"

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
        if isinstance(payload, bytes):
            body = payload
        else:
            body = payload.read()

        token = self._auth.upload_token(self._bucket, object_key)
        ret, info = put_data(token, object_key, body, mime_type=content_type)
        if info.status_code >= 400:
            raise RuntimeError(f"Qiniu upload failed: {info}")

        return StorageObject(
            key=object_key,
            url=self._build_public_url(object_key),
            bucket=self._bucket,
            content_type=content_type,
            size=payload_size,
        )

    def delete(self, key: str) -> None:
        object_key = normalize_key(key)
        ret, info = self._bucket_manager.delete(self._bucket, object_key)
        if info.status_code >= 400:
            raise RuntimeError(f"Qiniu delete failed: {info}")

    def get_url(self, key: str, *, expires_in: int = 3600) -> str:
        object_key = normalize_key(key)
        if self._domain:
            return self._auth.private_download_url(
                self._build_public_url(object_key),
                expires=expires_in,
            )
        return self._auth.private_download_url(
            f"https://{self._bucket}.qiniudn.com/{object_key}",
            expires=expires_in,
        )

    def exists(self, key: str) -> bool:
        object_key = normalize_key(key)
        ret, info = self._bucket_manager.stat(self._bucket, object_key)
        return info.status_code < 400
