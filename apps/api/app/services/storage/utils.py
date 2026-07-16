from io import BytesIO
from typing import BinaryIO


def normalize_key(key: str) -> str:
    return key.lstrip("/")


def read_payload(data: bytes | BinaryIO, size: int | None) -> tuple[BinaryIO, int]:
    if isinstance(data, bytes):
        return BytesIO(data), len(data)
    if size is None:
        current = data.tell()
        data.seek(0, 2)
        size = data.tell()
        data.seek(current)
    return data, size
