from dataclasses import dataclass
from datetime import date
from decimal import Decimal


@dataclass(frozen=True)
class InstrumentQuote:
    code: str
    exchange: str
    symbol: str
    name: str
    asset_type: str
    list_date: date | None = None


@dataclass(frozen=True)
class DailyBar:
    trade_date: date
    open: Decimal
    high: Decimal
    low: Decimal
    close: Decimal
    volume: Decimal
    amount: Decimal | None = None
    turnover_rate: Decimal | None = None
