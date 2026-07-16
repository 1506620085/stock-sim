from typing import BinaryIO

from app.services.storage.base import StorageProvider
from app.services.storage.types import StorageObject


class StorageService:
    """统一对象存储门面，业务层仅依赖此类。"""

    def __init__(self, provider: StorageProvider) -> None:
        self._provider = provider

    @property
    def provider(self) -> StorageProvider:
        return self._provider

    def upload(
        self,
        *,
        key: str,
        data: bytes | BinaryIO,
        content_type: str | None = None,
        size: int | None = None,
    ) -> StorageObject:
        return self._provider.upload(
            key=key,
            data=data,
            content_type=content_type,
            size=size,
        )

    def delete(self, key: str) -> None:
        self._provider.delete(key)

    def get_url(self, key: str, *, expires_in: int = 3600) -> str:
        return self._provider.get_url(key, expires_in=expires_in)

    def exists(self, key: str) -> bool:
        return self._provider.exists(key)
