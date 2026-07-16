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
    turnover_rate: float | None = None
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
    fee_template_id: int | None = None


class ReplaySessionUpdate(SQLModel):
    name: str | None = None
    current_date: date | None = None
    hide_future: bool | None = None
    adjust_type: str | None = None
    indicator_config: dict[str, Any] | None = None
    fee_template_id: int | None = None


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


class FeeTemplateCreate(SQLModel):
    name: str
    asset_type: str
    commission_rate: Decimal
    min_commission: Decimal = Decimal("0")
    stamp_tax_rate: Decimal = Decimal("0")
    transfer_rate: Decimal = Decimal("0")
    config: dict[str, Any] = Field(default_factory=dict)


class FeeTemplateUpdate(SQLModel):
    name: str | None = None
    asset_type: str | None = None
    commission_rate: Decimal | None = None
    min_commission: Decimal | None = None
    stamp_tax_rate: Decimal | None = None
    transfer_rate: Decimal | None = None
    config: dict[str, Any] | None = None


class FeeTemplateRead(SQLModel):
    id: int
    name: str
    asset_type: str
    commission_rate: float
    min_commission: float
    stamp_tax_rate: float
    transfer_rate: float
    config: dict[str, Any]
    is_default: bool
    created_at: datetime
    updated_at: datetime


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


class StatsSummaryRead(SQLModel):
    total_sessions: int
    total_trades: int
    buy_count: int
    sell_count: int
    win_rate: float
    realized_pnl: float
    average_profit: float
    average_loss: float
    profit_loss_ratio: float
    review_count: int
    calendar: list[dict[str, Any]]
    tag_stats: list[dict[str, Any]]
    recent_reviews: list[TradeReviewRead]
    journal_entry_count: int = 0
    journal_emotion_avg: float | None = None
    journal_rule_ref_count: int = 0
    journal_tag_stats: list[dict[str, Any]] = Field(default_factory=list)
    recent_journal_entries: list[dict[str, Any]] = Field(default_factory=list)


class DataQualityRead(SQLModel):
    instrument_id: int
    symbol: str
    name: str
    adjust_type: str
    source: str
    total_rows: int
    first_trade_date: date | None = None
    latest_trade_date: date | None = None
    last_synced_at: datetime | None = None
    missing_weekdays: list[date] = Field(default_factory=list)
    possible_suspended_dates: list[date] = Field(default_factory=list)


class JournalEntryCreate(SQLModel):
    entry_date: date
    side: str
    reason: str = ""
    symbol_code: str | None = None
    symbol_name: str | None = None
    price: Decimal | None = None
    quantity: Decimal | None = None
    plan_note: str | None = None
    emotion_score: int | None = None
    emotion_note: str | None = None
    result_note: str | None = None
    tags: list[str] = Field(default_factory=list)
    rule_ids: list[int] = Field(default_factory=list)


class JournalEntryUpdate(SQLModel):
    entry_date: date | None = None
    side: str | None = None
    reason: str | None = None
    symbol_code: str | None = None
    symbol_name: str | None = None
    price: Decimal | None = None
    quantity: Decimal | None = None
    plan_note: str | None = None
    emotion_score: int | None = None
    emotion_note: str | None = None
    result_note: str | None = None
    tags: list[str] | None = None
    rule_ids: list[int] | None = None


class JournalEntryRead(SQLModel):
    id: int
    entry_date: date
    side: str
    symbol_code: str | None = None
    symbol_name: str | None = None
    price: float | None = None
    quantity: float | None = None
    reason: str
    plan_note: str | None = None
    emotion_score: int | None = None
    emotion_note: str | None = None
    result_note: str | None = None
    tags: list[str]
    rule_ids: list[int]
    created_at: datetime
    updated_at: datetime


class TradingRuleCreate(SQLModel):
    title: str
    body: str = ""
    category: str = "other"
    status: str = "active"
    tags: list[str] = Field(default_factory=list)
    parent_id: int | None = None
    node_type: str = "doc"
    sort_order: int | None = None


class TradingRuleUpdate(SQLModel):
    title: str | None = None
    body: str | None = None
    category: str | None = None
    status: str | None = None
    tags: list[str] | None = None
    parent_id: int | None = None
    node_type: str | None = None
    sort_order: int | None = None


class TradingRuleRead(SQLModel):
    id: int
    title: str
    body: str
    category: str
    status: str
    tags: list[str]
    parent_id: int | None = None
    node_type: str = "doc"
    sort_order: int = 0
    created_at: datetime
    updated_at: datetime


class TradingRuleReorderItem(SQLModel):
    id: int
    parent_id: int | None = None
    sort_order: int


class TradingRuleReorderRequest(SQLModel):
    items: list[TradingRuleReorderItem]


class JournalPeriodSummaryRead(SQLModel):
    start_date: date
    end_date: date
    entry_count: int
    side_stats: list[dict[str, Any]]
    tag_stats: list[dict[str, Any]]
    emotion_avg: float | None = None
    emotion_count: int
    rule_ref_count: int
    entries: list[JournalEntryRead]


class StorageUploadRead(SQLModel):
    key: str
    url: str
    bucket: str
    content_type: str | None = None
    size: int | None = None
