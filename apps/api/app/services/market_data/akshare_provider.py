import re
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation
from typing import Any

from app.services.market_data.types import DailyBar, InstrumentQuote


class MarketDataError(RuntimeError):
    pass


_CODE_PATTERN = re.compile(r"^(\d{6})(?:\.(SH|SZ|BJ))?$", re.IGNORECASE)


def search_instruments(keyword: str) -> list[InstrumentQuote]:
    code = _normalize_code(keyword)
    if not code:
        return []

    akshare = _load_akshare()
    if _is_likely_etf_code(code):
        quote = _fetch_etf_by_code(akshare, code)
        if quote:
            return [quote]
        quote = _fetch_stock_by_code(akshare, code)
        if quote:
            return [quote]
        return []

    quote = _fetch_stock_by_code(akshare, code)
    if quote:
        return [quote]

    quote = _fetch_etf_by_code(akshare, code)
    if quote:
        return [quote]

    return []


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


def _normalize_code(keyword: str) -> str | None:
    text = keyword.strip().upper()
    if not text:
        return None
    match = _CODE_PATTERN.fullmatch(text)
    if match:
        return match.group(1)
    return None


def _is_likely_etf_code(code: str) -> bool:
    return code.startswith(("51", "52", "56", "58", "15", "16", "18"))


def _fetch_stock_by_code(akshare: Any, code: str) -> InstrumentQuote | None:
    if _is_likely_etf_code(code):
        return None

    name = _fetch_stock_name_from_cninfo(akshare, code)
    if name:
        return InstrumentQuote(
            code=code,
            exchange=_exchange_from_code(code),
            symbol=_symbol_from_code(code),
            name=name,
            asset_type="stock",
        )

    if _has_stock_history(akshare, code):
        return InstrumentQuote(
            code=code,
            exchange=_exchange_from_code(code),
            symbol=_symbol_from_code(code),
            name=_fetch_em_symbol_name(akshare, code) or code,
            asset_type="stock",
        )

    return None


def _fetch_etf_by_code(akshare: Any, code: str) -> InstrumentQuote | None:
    if _has_etf_history_sina(akshare, code):
        return InstrumentQuote(
            code=code,
            exchange=_exchange_from_code(code),
            symbol=_symbol_from_code(code),
            name=_fetch_em_symbol_name(akshare, code) or code,
            asset_type="etf",
        )

    if _has_etf_history_em(akshare, code):
        return InstrumentQuote(
            code=code,
            exchange=_exchange_from_code(code),
            symbol=_symbol_from_code(code),
            name=_fetch_em_symbol_name(akshare, code) or code,
            asset_type="etf",
        )

    return None


def _fetch_stock_name_from_cninfo(akshare: Any, code: str) -> str | None:
    try:
        frame = akshare.stock_profile_cninfo(symbol=code)
    except Exception:
        return None

    if frame is None or frame.empty:
        return None

    row = frame.iloc[0].to_dict()
    listed_code = str(_pick(row, "A股代码", "a股代码", "A 股代码") or "").strip()
    if listed_code and listed_code != code:
        return None

    name = str(_pick(row, "A股简称", "a股简称", "公司名称", "公司简称") or "").strip()
    return name or None


def _has_stock_history(akshare: Any, code: str) -> bool:
    start, end = _recent_date_range(days=15)
    for symbol in _tx_symbols_for_code(code):
        try:
            frame = akshare.stock_zh_a_hist_tx(symbol=symbol, start_date=start, end_date=end, adjust="")
        except Exception:
            continue
        if frame is not None and not frame.empty:
            return True
    return False


def _has_etf_history_sina(akshare: Any, code: str) -> bool:
    for symbol in _sina_symbols_for_code(code):
        try:
            frame = akshare.fund_etf_hist_sina(symbol=symbol)
        except Exception:
            continue
        if frame is not None and not frame.empty:
            return True
    return False


def _has_etf_history_em(akshare: Any, code: str) -> bool:
    start, end = _recent_date_range(days=15)
    try:
        frame = akshare.fund_etf_hist_em(symbol=code, period="daily", start_date=start, end_date=end, adjust="")
    except Exception:
        return False
    return frame is not None and not frame.empty


def _fetch_em_symbol_name(akshare: Any, code: str) -> str | None:
    try:
        frame = akshare.stock_individual_info_em(symbol=code)
    except Exception:
        return None

    if frame is None or frame.empty:
        return None

    for row in frame.to_dict("records"):
        item = str(_pick(row, "item", "项目") or "").strip()
        if item in {"股票简称", "证券简称", "基金简称", "名称"}:
            value = str(_pick(row, "value", "值") or "").strip()
            if value:
                return value
    return None


def _recent_date_range(days: int) -> tuple[str, str]:
    end = date.today()
    start = end - timedelta(days=days)
    return start.strftime("%Y%m%d"), end.strftime("%Y%m%d")


def _tx_symbols_for_code(code: str) -> list[str]:
    exchange = _exchange_from_code(code)
    if exchange == "SH":
        return [f"sh{code}"]
    if exchange == "SZ":
        return [f"sz{code}"]
    return [f"sh{code}", f"sz{code}"]


def _sina_symbols_for_code(code: str) -> list[str]:
    exchange = _exchange_from_code(code)
    if exchange == "SH":
        return [f"sh{code}"]
    if exchange == "SZ":
        return [f"sz{code}"]
    return [f"sh{code}", f"sz{code}"]


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
