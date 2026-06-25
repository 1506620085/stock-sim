from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import BigInteger, Boolean, Column, Date, DateTime, ForeignKey, Index, Numeric, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, SQLModel


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def timestamp_column() -> Column:
    return Column(DateTime(timezone=True), nullable=False)


class Instrument(SQLModel, table=True):
    __tablename__ = "instruments"
    __table_args__ = (
        UniqueConstraint("symbol", name="uq_instruments_symbol"),
        Index("ix_instruments_code", "code"),
        Index("ix_instruments_asset_type", "asset_type"),
    )

    id: int | None = Field(default=None, sa_column=Column(BigInteger, primary_key=True, autoincrement=True))
    code: str = Field(sa_column=Column(String(16), nullable=False))
    exchange: str = Field(sa_column=Column(String(8), nullable=False))
    symbol: str = Field(sa_column=Column(String(24), nullable=False))
    name: str = Field(sa_column=Column(String(64), nullable=False))
    asset_type: str = Field(sa_column=Column(String(16), nullable=False))
    list_date: date | None = Field(default=None, sa_column=Column(Date))
    is_active: bool = Field(default=True, sa_column=Column(Boolean, nullable=False))
    created_at: datetime = Field(default_factory=utc_now, sa_column=timestamp_column())
    updated_at: datetime = Field(default_factory=utc_now, sa_column=timestamp_column())


class KlineDaily(SQLModel, table=True):
    __tablename__ = "kline_daily"
    __table_args__ = (
        UniqueConstraint("instrument_id", "trade_date", "adjust_type", "source", name="uq_kline_daily_identity"),
        Index("ix_kline_daily_instrument_date", "instrument_id", "trade_date"),
    )

    id: int | None = Field(default=None, sa_column=Column(BigInteger, primary_key=True, autoincrement=True))
    instrument_id: int = Field(sa_column=Column(BigInteger, ForeignKey("instruments.id", ondelete="CASCADE"), nullable=False))
    trade_date: date = Field(sa_column=Column(Date, nullable=False))
    open: Decimal = Field(sa_column=Column(Numeric(18, 4), nullable=False))
    high: Decimal = Field(sa_column=Column(Numeric(18, 4), nullable=False))
    low: Decimal = Field(sa_column=Column(Numeric(18, 4), nullable=False))
    close: Decimal = Field(sa_column=Column(Numeric(18, 4), nullable=False))
    volume: Decimal = Field(sa_column=Column(Numeric(24, 4), nullable=False))
    amount: Decimal | None = Field(default=None, sa_column=Column(Numeric(24, 4)))
    adjust_type: str = Field(default="qfq", sa_column=Column(String(16), nullable=False))
    source: str = Field(default="akshare", sa_column=Column(String(24), nullable=False))
    source_updated_at: datetime | None = Field(default=None, sa_column=Column(DateTime(timezone=True)))
    created_at: datetime = Field(default_factory=utc_now, sa_column=timestamp_column())
    updated_at: datetime = Field(default_factory=utc_now, sa_column=timestamp_column())


class WatchlistItem(SQLModel, table=True):
    __tablename__ = "watchlist_items"
    __table_args__ = (UniqueConstraint("instrument_id", name="uq_watchlist_items_instrument_id"),)

    id: int | None = Field(default=None, sa_column=Column(BigInteger, primary_key=True, autoincrement=True))
    instrument_id: int = Field(sa_column=Column(BigInteger, ForeignKey("instruments.id", ondelete="CASCADE"), nullable=False))
    sort_order: int = Field(default=0, nullable=False)
    created_at: datetime = Field(default_factory=utc_now, sa_column=Column(DateTime(timezone=True), nullable=False))


class ReplaySession(SQLModel, table=True):
    __tablename__ = "replay_sessions"

    id: int | None = Field(default=None, sa_column=Column(BigInteger, primary_key=True, autoincrement=True))
    instrument_id: int = Field(sa_column=Column(BigInteger, ForeignKey("instruments.id", ondelete="CASCADE"), nullable=False))
    name: str = Field(sa_column=Column(String(128), nullable=False))
    start_date: date = Field(sa_column=Column(Date, nullable=False))
    current_date: date = Field(sa_column=Column(Date, nullable=False))
    hide_future: bool = Field(default=True, sa_column=Column(Boolean, nullable=False))
    adjust_type: str = Field(default="qfq", sa_column=Column(String(16), nullable=False))
    indicator_config: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSONB, nullable=False))
    created_at: datetime = Field(default_factory=utc_now, sa_column=timestamp_column())
    updated_at: datetime = Field(default_factory=utc_now, sa_column=timestamp_column())


class Trade(SQLModel, table=True):
    __tablename__ = "trades"
    __table_args__ = (Index("ix_trades_session_date", "session_id", "trade_date"),)

    id: int | None = Field(default=None, sa_column=Column(BigInteger, primary_key=True, autoincrement=True))
    session_id: int = Field(sa_column=Column(BigInteger, ForeignKey("replay_sessions.id", ondelete="CASCADE"), nullable=False))
    instrument_id: int = Field(sa_column=Column(BigInteger, ForeignKey("instruments.id", ondelete="CASCADE"), nullable=False))
    trade_date: date = Field(sa_column=Column(Date, nullable=False))
    side: str = Field(sa_column=Column(String(8), nullable=False))
    quantity: Decimal = Field(sa_column=Column(Numeric(24, 4), nullable=False))
    price: Decimal = Field(sa_column=Column(Numeric(18, 4), nullable=False))
    price_rule: str = Field(sa_column=Column(String(24), nullable=False))
    fee: Decimal = Field(default=Decimal("0"), sa_column=Column(Numeric(18, 4), nullable=False))
    note: str | None = Field(default=None, sa_column=Column(Text))
    emotion_score: int | None = Field(default=None)
    created_at: datetime = Field(default_factory=utc_now, sa_column=Column(DateTime(timezone=True), nullable=False))


class TradeReview(SQLModel, table=True):
    __tablename__ = "trade_reviews"

    id: int | None = Field(default=None, sa_column=Column(BigInteger, primary_key=True, autoincrement=True))
    session_id: int = Field(sa_column=Column(BigInteger, ForeignKey("replay_sessions.id", ondelete="CASCADE"), nullable=False))
    start_trade_id: int | None = Field(default=None, sa_column=Column(BigInteger, ForeignKey("trades.id", ondelete="SET NULL")))
    end_trade_id: int | None = Field(default=None, sa_column=Column(BigInteger, ForeignKey("trades.id", ondelete="SET NULL")))
    title: str = Field(sa_column=Column(String(128), nullable=False))
    note: str | None = Field(default=None, sa_column=Column(Text))
    tags: list[str] = Field(default_factory=list, sa_column=Column(JSONB, nullable=False))
    metrics_snapshot: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSONB, nullable=False))
    created_at: datetime = Field(default_factory=utc_now, sa_column=timestamp_column())
    updated_at: datetime = Field(default_factory=utc_now, sa_column=timestamp_column())


class FeeTemplate(SQLModel, table=True):
    __tablename__ = "fee_templates"

    id: int | None = Field(default=None, sa_column=Column(BigInteger, primary_key=True, autoincrement=True))
    name: str = Field(sa_column=Column(String(64), nullable=False))
    asset_type: str = Field(sa_column=Column(String(16), nullable=False))
    commission_rate: Decimal = Field(sa_column=Column(Numeric(12, 8), nullable=False))
    min_commission: Decimal = Field(default=Decimal("0"), sa_column=Column(Numeric(18, 4), nullable=False))
    stamp_tax_rate: Decimal = Field(default=Decimal("0"), sa_column=Column(Numeric(12, 8), nullable=False))
    transfer_rate: Decimal = Field(default=Decimal("0"), sa_column=Column(Numeric(12, 8), nullable=False))
    config: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSONB, nullable=False))
    created_at: datetime = Field(default_factory=utc_now, sa_column=timestamp_column())
    updated_at: datetime = Field(default_factory=utc_now, sa_column=timestamp_column())
