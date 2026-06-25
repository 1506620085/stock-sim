from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session, select

from app.core.database import get_session
from app.models import Instrument, ReplaySession
from app.schemas import ReplaySessionCreate, ReplaySessionRead, ReplaySessionUpdate

router = APIRouter(prefix="/api/replay-sessions", tags=["replay-sessions"])


@router.get("", response_model=list[ReplaySessionRead])
def list_replay_sessions(
    instrument_id: int | None = Query(default=None),
    session: Session = Depends(get_session),
) -> list[ReplaySession]:
    statement = select(ReplaySession).order_by(ReplaySession.updated_at.desc())
    if instrument_id is not None:
        statement = statement.where(ReplaySession.instrument_id == instrument_id)
    return list(session.exec(statement).all())


@router.post("", response_model=ReplaySessionRead, status_code=status.HTTP_201_CREATED)
def create_replay_session(payload: ReplaySessionCreate, session: Session = Depends(get_session)) -> ReplaySession:
    instrument = session.get(Instrument, payload.instrument_id)
    if not instrument:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Instrument not found")

    replay_session = ReplaySession.model_validate(payload)
    session.add(replay_session)
    session.commit()
    session.refresh(replay_session)
    return replay_session


@router.get("/{session_id}", response_model=ReplaySessionRead)
def get_replay_session(session_id: int, session: Session = Depends(get_session)) -> ReplaySession:
    replay_session = session.get(ReplaySession, session_id)
    if not replay_session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Replay session not found")
    return replay_session


@router.patch("/{session_id}", response_model=ReplaySessionRead)
def update_replay_session(session_id: int, payload: ReplaySessionUpdate, session: Session = Depends(get_session)) -> ReplaySession:
    replay_session = session.get(ReplaySession, session_id)
    if not replay_session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Replay session not found")

    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(replay_session, key, value)
    replay_session.updated_at = datetime.now(timezone.utc)
    session.add(replay_session)
    session.commit()
    session.refresh(replay_session)
    return replay_session


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_replay_session(session_id: int, session: Session = Depends(get_session)) -> None:
    replay_session = session.get(ReplaySession, session_id)
    if not replay_session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Replay session not found")
    session.delete(replay_session)
    session.commit()
