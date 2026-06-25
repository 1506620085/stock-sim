from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlmodel import Session

from app.core.database import get_session

router = APIRouter(prefix="/api/health", tags=["health"])


@router.get("")
def health_check() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/db")
def database_health_check(session: Session = Depends(get_session)) -> dict[str, str]:
    session.execute(text("select 1"))
    return {"status": "ok", "database": "postgresql"}
