from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_
from sqlmodel import Session, select

from app.core.database import get_session
from app.models import Instrument
from app.schemas import InstrumentCreate, InstrumentRead, InstrumentUpdate

router = APIRouter(prefix="/api/instruments", tags=["instruments"])


@router.get("", response_model=list[InstrumentRead])
def list_instruments(
    keyword: str | None = Query(default=None),
    session: Session = Depends(get_session),
) -> list[Instrument]:
    statement = select(Instrument).order_by(Instrument.code)
    if keyword:
        like_keyword = f"%{keyword.strip()}%"
        statement = statement.where(
            or_(
                Instrument.code.ilike(like_keyword),
                Instrument.symbol.ilike(like_keyword),
                Instrument.name.ilike(like_keyword),
            )
        )
    return list(session.exec(statement).all())


@router.get("/search", response_model=list[InstrumentRead])
def search_instruments(keyword: str = Query(min_length=1), session: Session = Depends(get_session)) -> list[Instrument]:
    return list_instruments(keyword=keyword, session=session)


@router.post("", response_model=InstrumentRead, status_code=status.HTTP_201_CREATED)
def create_instrument(payload: InstrumentCreate, session: Session = Depends(get_session)) -> Instrument:
    instrument = Instrument.model_validate(payload)
    session.add(instrument)
    session.commit()
    session.refresh(instrument)
    return instrument


@router.get("/{instrument_id}", response_model=InstrumentRead)
def get_instrument(instrument_id: int, session: Session = Depends(get_session)) -> Instrument:
    instrument = session.get(Instrument, instrument_id)
    if not instrument:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Instrument not found")
    return instrument


@router.patch("/{instrument_id}", response_model=InstrumentRead)
def update_instrument(instrument_id: int, payload: InstrumentUpdate, session: Session = Depends(get_session)) -> Instrument:
    instrument = session.get(Instrument, instrument_id)
    if not instrument:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Instrument not found")

    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(instrument, key, value)
    instrument.updated_at = datetime.now(timezone.utc)
    session.add(instrument)
    session.commit()
    session.refresh(instrument)
    return instrument
