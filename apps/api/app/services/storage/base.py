from abc import ABC, abstractmethod
from typing import BinaryIO

from app.services.storage.types import StorageObject


class StorageProvider(ABC):
    """对象存储策略接口，业务层仅依赖此抽象。"""

    @abstractmethod
    def upload(
        self,
        *,
        key: str,
        data: bytes | BinaryIO,
        content_type: str | None = None,
        size: int | None = None,
    ) -> StorageObject:
        raise NotImplementedError

    @abstractmethod
    def delete(self, key: str) -> None:
        raise NotImplementedError

    @abstractmethod
    def get_url(self, key: str, *, expires_in: int = 3600) -> str:
        raise NotImplementedError

    @abstractmethod
    def exists(self, key: str) -> bool:
        raise NotImplementedError
