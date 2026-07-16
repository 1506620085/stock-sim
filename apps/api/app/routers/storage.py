import re
import uuid
from datetime import datetime, timezone
from pathlib import PurePosixPath

from fastapi import APIRouter, HTTPException, Query, Request, status
from fastapi.responses import Response

from app.schemas import StorageUploadRead
from app.services.storage import get_storage_service

router = APIRouter(prefix="/api/storage", tags=["storage"])

ALLOWED_IMAGE_TYPES = {
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/svg+xml",
    "image/bmp",
}
ALLOWED_EXTENSIONS = (".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".bmp")
MAX_UPLOAD_BYTES = 10 * 1024 * 1024  # 10MB


def sanitize_filename(filename: str | None) -> str:
    name = PurePosixPath((filename or "file").replace("\\", "/")).name
    name = re.sub(r"[^\w.\-]+", "_", name, flags=re.UNICODE).strip("._")
    return name or "file"


def build_object_key(filename: str, folder: str = "notes") -> str:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d")
    unique = uuid.uuid4().hex[:12]
    safe_name = sanitize_filename(filename)
    return f"{folder.strip('/')}/{stamp}/{unique}_{safe_name}"


def public_file_url(key: str) -> str:
    return f"/api/storage/files/{key.lstrip('/')}"


def ensure_image(content_type: str, filename: str) -> None:
    ctype = (content_type or "").lower().split(";")[0].strip()
    if ctype in ALLOWED_IMAGE_TYPES:
        return
    if filename.lower().endswith(ALLOWED_EXTENSIONS):
        return
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="仅支持上传图片文件")


@router.post("/upload", response_model=StorageUploadRead)
async def upload_file(
    request: Request,
    folder: str = Query("notes"),
    filename: str = Query("image.png"),
) -> StorageUploadRead:
    """上传图片：请求体为原始二进制，Content-Type 为图片 MIME。"""
    content_type = request.headers.get("content-type", "")
    ensure_image(content_type, filename)

    data = await request.body()
    if not data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="文件内容为空")
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="图片大小不能超过 10MB")

    key = build_object_key(filename, folder=folder or "notes")
    storage = get_storage_service()
    mime = content_type.split(";")[0].strip() or "application/octet-stream"

    try:
        obj = storage.upload(
            key=key,
            data=data,
            content_type=mime,
            size=len(data),
        )
    except ModuleNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"对象存储依赖未安装：{exc.name}。请执行 pip install -r requirements.txt",
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"上传到对象存储失败：{exc}",
        ) from exc

    return StorageUploadRead(
        key=obj.key,
        url=public_file_url(obj.key),
        bucket=obj.bucket,
        content_type=obj.content_type or mime,
        size=obj.size or len(data),
    )


@router.get("/files/{file_key:path}")
def download_file(file_key: str) -> Response:
    key = file_key.lstrip("/")
    if not key or ".." in key.split("/"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="无效的文件路径")

    storage = get_storage_service()
    try:
        if not storage.exists(key):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="文件不存在")
        data, content_type = storage.download(key)
    except ModuleNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"对象存储依赖未安装：{exc.name}。请执行 pip install -r requirements.txt",
        ) from exc
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"读取对象存储失败：{exc}",
        ) from exc

    return Response(
        content=data,
        media_type=content_type or "application/octet-stream",
        headers={"Cache-Control": "public, max-age=86400"},
    )
