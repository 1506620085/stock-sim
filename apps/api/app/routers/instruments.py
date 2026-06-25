from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_
from sqlmodel import Session, select

from app.core.database import get_session
from app.models import Instrument, KlineDaily
from app.schemas import InstrumentCreate, InstrumentRead, InstrumentSearchRead, InstrumentUpdate, KlineDailyRead, KlineSyncResult
from app.services.market_data import akshare_provider
from app.services.market_data.akshare_provider import MarketDataError
from app.services.market_data.sync import sync_daily_bars

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


@router.get("/search", response_model=list[InstrumentSearchRead])
def search_instruments(
    keyword: str = Query(min_length=1),
    include_remote: bool = Query(default=True),
    session: Session = Depends(get_session),
) -> list[InstrumentSearchRead]:
    local_results = list_instruments(keyword=keyword, session=session)
    results = [
        InstrumentSearchRead(
            id=instrument.id,
            code=instrument.code,
            exchange=instrument.exchange,
            symbol=instrument.symbol,
            name=instrument.name,
            asset_type=instrument.asset_type,
            list_date=instrument.list_date,
            is_active=instrument.is_active,
            source="database",
        )
        for instrument in local_results
    ]

    if not include_remote:
        return results

    try:
        remote_results = akshare_provider.search_instruments(keyword)
    except MarketDataError as exc:
        if results:
            return results
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    known_symbols = {item.symbol for item in results}
    for quote in remote_results:
        if quote.symbol in known_symbols:
            continue
        results.append(
            InstrumentSearchRead(
                id=None,
                code=quote.code,
                exchange=quote.exchange,
                symbol=quote.symbol,
                name=quote.name,
                asset_type=quote.asset_type,
                list_date=quote.list_date,
                is_active=True,
                source="akshare",
            )
        )

    return results[:30]


@router.post("", response_model=InstrumentRead, status_code=status.HTTP_201_CREATED)
def create_instrument(payload: InstrumentCreate, session: Session = Depends(get_session)) -> Instrument:
    existing = session.exec(select(Instrument).where(Instrument.symbol == payload.symbol)).first()
    if existing:
        return existing

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


@router.post("/{instrument_id}/sync", response_model=KlineSyncResult)
def sync_instrument_klines(
    instrument_id: int,
    start: date | None = Query(default=None),
    end: date | None = Query(default=None),
    adjust: str = Query(default="qfq", pattern="^(none|qfq|hfq)$"),
    session: Session = Depends(get_session),
) -> KlineSyncResult:
    instrument = session.get(Instrument, instrument_id)
    if not instrument:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Instrument not found")

    try:
        rows_fetched, rows_written, latest_trade_date = sync_daily_bars(
            session=session,
            instrument=instrument,
            start_date=start,
            end_date=end,
            adjust_type=adjust,
        )
    except MarketDataError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    return KlineSyncResult(
        instrument_id=instrument.id,
        symbol=instrument.symbol,
        adjust_type=adjust,
        source="akshare",
        rows_fetched=rows_fetched,
        rows_written=rows_written,
        latest_trade_date=latest_trade_date,
        synced_at=datetime.now(timezone.utc),
    )


@router.get("/{instrument_id}/klines", response_model=list[KlineDailyRead])
def list_instrument_klines(
    instrument_id: int,
    start: date | None = Query(default=None),
    end: date | None = Query(default=None),
    adjust: str = Query(default="qfq", pattern="^(none|qfq|hfq)$"),
    session: Session = Depends(get_session),
) -> list[KlineDaily]:
    statement = (
        select(KlineDaily)
        .where(KlineDaily.instrument_id == instrument_id)
        .where(KlineDaily.adjust_type == adjust)
        .order_by(KlineDaily.trade_date)
    )
    if start:
        statement = statement.where(KlineDaily.trade_date >= start)
    if end:
        statement = statement.where(KlineDaily.trade_date <= end)

    return list(session.exec(statement).all())
