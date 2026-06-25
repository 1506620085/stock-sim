from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Any

from app.services.market_data.types import DailyBar, InstrumentQuote


class MarketDataError(RuntimeError):
    pass


def search_instruments(keyword: str) -> list[InstrumentQuote]:
    akshare = _load_akshare()
    text = keyword.strip().lower()
    if not text:
        return []

    results: list[InstrumentQuote] = []
    results.extend(_search_stocks(akshare, text))
    results.extend(_search_etfs(akshare, text))
    return _deduplicate(results)[:30]


def fetch_daily_bars(symbol: str, asset_type: str, start_date: date | None, end_date: date | None, adjust_type: str) -> list[DailyBar]:
    akshare = _load_akshare()
    code = symbol.split(".")[0]
    start = _format_ak_date(start_date)
    end = _format_ak_date(end_date or date.today())
    adjust = "" if adjust_type == "none" else adjust_type

    try:
        if asset_type == "etf":
            frame = akshare.fund_etf_hist_em(symbol=code, period="daily", start_date=start, end_date=end, adjust=adjust)
        else:
            frame = akshare.stock_zh_a_hist(symbol=code, period="daily", start_date=start, end_date=end, adjust=adjust)
    except Exception as exc:  # pragma: no cover - depends on external data source.
        raise MarketDataError(f"AKShare 获取历史 K 线失败：{exc}") from exc

    bars: list[DailyBar] = []
    for row in frame.to_dict("records"):
        trade_date = _parse_date(_pick(row, "日期", "date"))
        if not trade_date:
            continue
        bars.append(
            DailyBar(
                trade_date=trade_date,
                open=_decimal(_pick(row, "开盘", "open")),
                high=_decimal(_pick(row, "最高", "high")),
                low=_decimal(_pick(row, "最低", "low")),
                close=_decimal(_pick(row, "收盘", "close")),
                volume=_decimal(_pick(row, "成交量", "volume")),
                amount=_optional_decimal(_pick(row, "成交额", "amount")),
            )
        )

    return bars


def _load_akshare() -> Any:
    try:
        import akshare as akshare  # type: ignore[import-not-found]
    except ImportError as exc:
        raise MarketDataError("未安装 akshare，请先在 apps/api 环境中安装依赖。") from exc
    return akshare


def _search_stocks(akshare: Any, keyword: str) -> list[InstrumentQuote]:
    try:
        frame = akshare.stock_info_a_code_name()
    except Exception as exc:  # pragma: no cover - depends on external data source.
        raise MarketDataError(f"AKShare 搜索股票失败：{exc}") from exc

    quotes: list[InstrumentQuote] = []
    for row in frame.to_dict("records"):
        code = str(_pick(row, "code", "代码", "证券代码") or "").strip()
        name = str(_pick(row, "name", "名称", "证券简称") or "").strip()
        if not code or not _matches(keyword, code, name):
            continue
        quotes.append(InstrumentQuote(code=code, exchange=_exchange_from_code(code), symbol=_symbol_from_code(code), name=name, asset_type="stock"))
    return quotes


def _search_etfs(akshare: Any, keyword: str) -> list[InstrumentQuote]:
    try:
        frame = akshare.fund_etf_spot_em()
    except Exception as exc:  # pragma: no cover - depends on external data source.
        raise MarketDataError(f"AKShare 搜索 ETF 失败：{exc}") from exc

    quotes: list[InstrumentQuote] = []
    for row in frame.to_dict("records"):
        code = str(_pick(row, "代码", "code") or "").strip()
        name = str(_pick(row, "名称", "name") or "").strip()
        if not code or not _matches(keyword, code, name):
            continue
        quotes.append(InstrumentQuote(code=code, exchange=_exchange_from_code(code), symbol=_symbol_from_code(code), name=name, asset_type="etf"))
    return quotes


def _matches(keyword: str, code: str, name: str) -> bool:
    return keyword in code.lower() or keyword in name.lower()


def _deduplicate(quotes: list[InstrumentQuote]) -> list[InstrumentQuote]:
    seen: set[str] = set()
    unique: list[InstrumentQuote] = []
    for quote in quotes:
        if quote.symbol in seen:
            continue
        seen.add(quote.symbol)
        unique.append(quote)
    return unique


def _symbol_from_code(code: str) -> str:
    return f"{code}.{_exchange_from_code(code)}"


def _exchange_from_code(code: str) -> str:
    if code.startswith(("5", "6", "9")):
        return "SH"
    if code.startswith(("0", "1", "2", "3")):
        return "SZ"
    if code.startswith(("4", "8")):
        return "BJ"
    return "CN"


def _format_ak_date(value: date | None) -> str:
    return (value or date(1990, 1, 1)).strftime("%Y%m%d")


def _pick(row: dict[str, Any], *names: str) -> Any:
    for name in names:
        if name in row:
            return row[name]
    return None


def _parse_date(value: Any) -> date | None:
    if value is None:
        return None
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value)[:10])


def _decimal(value: Any) -> Decimal:
    result = _optional_decimal(value)
    if result is None:
        raise MarketDataError("行情数据缺少必要价格或成交量字段。")
    return result


def _optional_decimal(value: Any) -> Decimal | None:
    if value is None or value == "":
        return None
    try:
        return Decimal(str(value).replace(",", ""))
    except (InvalidOperation, ValueError) as exc:
        raise MarketDataError(f"无法解析行情数值：{value}") from exc
