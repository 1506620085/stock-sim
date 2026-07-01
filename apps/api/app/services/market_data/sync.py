from datetime import date, datetime, timezone

from sqlalchemy.dialects.postgresql import insert
from sqlmodel import Session

from app.models import Instrument, KlineDaily
from app.services.market_data import akshare_provider


def sync_daily_bars(
    session: Session,
    instrument: Instrument,
    start_date: date | None,
    end_date: date | None,
    adjust_type: str,
    source: str = "akshare",
) -> tuple[int, int, date | None]:
    bars = akshare_provider.fetch_daily_bars(
        symbol=instrument.symbol,
        asset_type=instrument.asset_type,
        start_date=start_date,
        end_date=end_date,
        adjust_type=adjust_type,
    )
    now = datetime.now(timezone.utc)

    if not bars:
        return 0, 0, None

    today = date.today()
    bars = [bar for bar in bars if bar.trade_date <= today]
    if not bars:
        return 0, 0, None

    rows = [
        {
            "instrument_id": instrument.id,
            "trade_date": bar.trade_date,
            "open": bar.open,
            "high": bar.high,
            "low": bar.low,
            "close": bar.close,
            "volume": bar.volume,
            "amount": bar.amount,
            "adjust_type": adjust_type,
            "source": source,
            "source_updated_at": now,
            "created_at": now,
            "updated_at": now,
        }
        for bar in bars
    ]

    statement = insert(KlineDaily).values(rows)
    update_columns = {
        "open": statement.excluded.open,
        "high": statement.excluded.high,
        "low": statement.excluded.low,
        "close": statement.excluded.close,
        "volume": statement.excluded.volume,
        "amount": statement.excluded.amount,
        "source_updated_at": statement.excluded.source_updated_at,
        "updated_at": statement.excluded.updated_at,
    }
    statement = statement.on_conflict_do_update(
        constraint="uq_kline_daily_identity",
        set_=update_columns,
    )
    session.exec(statement)
    session.commit()

    latest_date = max(bar.trade_date for bar in bars)
    # PostgreSQL 批量 upsert 的 rowcount 常为 -1（未知），用实际处理条数代替。
    return len(bars), len(bars), latest_date
