from functools import lru_cache

from app.core.config import get_settings
from app.services.storage.base import StorageProvider
from app.services.storage.factory import create_storage_provider
from app.services.storage.service import StorageService
from app.services.storage.types import StorageObject


@lru_cache
def get_storage_service() -> StorageService:
    settings = get_settings()
    provider = create_storage_provider(settings)
    return StorageService(provider)


__all__ = [
    "StorageObject",
    "StorageProvider",
    "StorageService",
    "get_storage_service",
]
