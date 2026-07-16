from typing import BinaryIO

from qcloud_cos import CosConfig, CosS3Client
from qcloud_cos.cos_exception import CosServiceError

from app.services.storage.base import StorageProvider
from app.services.storage.types import StorageObject
from app.services.storage.utils import normalize_key, read_payload


class TencentCosStorageProvider(StorageProvider):
    def __init__(
        self,
        *,
        secret_id: str,
        secret_key: str,
        region: str,
        bucket: str,
    ) -> None:
        config = CosConfig(Region=region, SecretId=secret_id, SecretKey=secret_key)
        self._bucket = bucket
        self._client = CosS3Client(config)

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
            Bucket=self._bucket,
            Body=payload,
            Key=object_key,
            ContentType=content_type or "application/octet-stream",
            ContentLength=payload_size,
        )
        return StorageObject(
            key=object_key,
            url=self.get_url(object_key),
            bucket=self._bucket,
            content_type=content_type,
            size=payload_size,
        )

    def delete(self, key: str) -> None:
        self._client.delete_object(Bucket=self._bucket, Key=normalize_key(key))

    def get_url(self, key: str, *, expires_in: int = 3600) -> str:
        return self._client.get_presigned_url(
            Method="GET",
            Bucket=self._bucket,
            Key=normalize_key(key),
            Expired=expires_in,
        )

    def exists(self, key: str) -> bool:
        try:
            self._client.head_object(Bucket=self._bucket, Key=normalize_key(key))
            return True
        except CosServiceError:
            return False

    def download(self, key: str) -> tuple[bytes, str | None]:
        object_key = normalize_key(key)
        response = self._client.get_object(Bucket=self._bucket, Key=object_key)
        body = response["Body"]
        data = body.get_raw_stream().read()
        content_type = response.get("Content-Type")
        return data, content_type
