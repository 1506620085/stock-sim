from typing import BinaryIO

import oss2
from oss2.exceptions import OssError

from app.services.storage.base import StorageProvider
from app.services.storage.types import StorageObject
from app.services.storage.utils import normalize_key, read_payload


class AliyunOssStorageProvider(StorageProvider):
    def __init__(
        self,
        *,
        endpoint: str,
        access_key_id: str,
        access_key_secret: str,
        bucket: str,
    ) -> None:
        auth = oss2.Auth(access_key_id, access_key_secret)
        self._bucket_name = bucket
        self._bucket = oss2.Bucket(auth, endpoint, bucket)

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
        headers = {}
        if content_type:
            headers["Content-Type"] = content_type
        self._bucket.put_object(object_key, payload, headers=headers or None)
        return StorageObject(
            key=object_key,
            url=self.get_url(object_key),
            bucket=self._bucket_name,
            content_type=content_type,
            size=payload_size,
        )

    def delete(self, key: str) -> None:
        self._bucket.delete_object(normalize_key(key))

    def get_url(self, key: str, *, expires_in: int = 3600) -> str:
        return self._bucket.sign_url("GET", normalize_key(key), expires_in)

    def exists(self, key: str) -> bool:
        try:
            return self._bucket.object_exists(normalize_key(key))
        except OssError:
            return False
