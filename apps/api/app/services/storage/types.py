from dataclasses import dataclass


@dataclass(frozen=True)
class StorageObject:
    """上传成功后的对象元信息。"""

    key: str
    url: str
    bucket: str
    content_type: str | None = None
    size: int | None = None
