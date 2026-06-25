from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlmodel import Field, SQLModel


class InstrumentCreate(SQLModel):
    code: str
    exchange: str
    symbol: str
    name: str
    asset_type: str
    list_date: date | None = None
    is_active: bool = True


class InstrumentUpdate(SQLModel):
    code: str | None = None
    exchange: str | None = None
    symbol: str | None = None
    name: str | None = None
    asset_type: str | None = None
    list_date: date | None = None
    is_active: bool | None = None


class InstrumentRead(InstrumentCreate):
    id: int
    created_at: datetime
    updated_at: datetime


class InstrumentSearchRead(InstrumentCreate):
    id: int | None = None
    source: str = "database"


class KlineDailyRead(SQLModel):
    id: int
    instrument_id: int
    trade_date: date
    open: float
    high: float
    low: float
    close: float
    volume: float
    amount: float | None = None
    adjust_type: str
    source: str
    source_updated_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class KlineSyncResult(SQLModel):
    instrument_id: int
    symbol: str
    adjust_type: str
    source: str
    rows_fetched: int
    rows_written: int
    latest_trade_date: date | None = None
    synced_at: datetime


class WatchlistItemCreate(SQLModel):
    instrument_id: int
    sort_order: int = 0


class WatchlistItemRead(WatchlistItemCreate):
    id: int
    created_at: datetime


class ReplaySessionCreate(SQLModel):
    instrument_id: int
    name: str
    start_date: date
    current_date: date
    hide_future: bool = True
    adjust_type: str = "qfq"
    indicator_config: dict[str, Any] = Field(default_factory=dict)


class ReplaySessionUpdate(SQLModel):
    name: str | None = None
    current_date: date | None = None
    hide_future: bool | None = None
    adjust_type: str | None = None
    indicator_config: dict[str, Any] | None = None


class ReplaySessionRead(ReplaySessionCreate):
    id: int
    created_at: datetime
    updated_at: datetime


class TradeCreate(SQLModel):
    side: str
    quantity: Decimal
    fee: Decimal = Decimal("0")
    note: str | None = None
    emotion_score: int | None = None


class TradeUpdate(SQLModel):
    note: str | None = None
    emotion_score: int | None = None


class TradeRead(SQLModel):
    id: int
    session_id: int
    instrument_id: int
    trade_date: date
    side: str
    quantity: float
    price: float
    price_rule: str
    fee: float
    note: str | None = None
    emotion_score: int | None = None
    created_at: datetime


class PnlSummaryRead(SQLModel):
    quantity: float
    cost: float
    avg_cost: float
    realized: float
    floating_close: float
    floating_low: float
    total: float


class TradeReviewCreate(SQLModel):
    start_trade_id: int | None = None
    end_trade_id: int | None = None
    title: str
    note: str | None = None
    tags: list[str] = Field(default_factory=list)
    metrics_snapshot: dict[str, Any] = Field(default_factory=dict)


class TradeReviewRead(TradeReviewCreate):
    id: int
    session_id: int
    created_at: datetime
    updated_at: datetime
