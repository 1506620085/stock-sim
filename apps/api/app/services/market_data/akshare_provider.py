import re
import time
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation
from http.client import RemoteDisconnected
from typing import Any, Callable

import pandas as pd
import requests

from app.services.market_data.types import DailyBar, InstrumentQuote


class MarketDataError(RuntimeError):
    pass


_CODE_PATTERN = re.compile(r"^(\d{6})(?:\.(SH|SZ|BJ))?$", re.IGNORECASE)
_AKSHARE_RETRY_ATTEMPTS = 3
_AKSHARE_RETRY_BASE_DELAY_SECONDS = 0.8


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
    range_start = start_date or date(1990, 1, 1)
    range_end = end_date or date.today()

    try:
        if asset_type == "etf":
            frame = _fetch_etf_daily_frame(akshare, code, start, end, adjust)
        else:
            frame = _fetch_stock_daily_frame(akshare, code, start, end, adjust)
    except MarketDataError:
        raise
    except Exception as exc:  # pragma: no cover - depends on external data source.
        raise MarketDataError(f"AKShare 获取历史 K 线失败：{exc}") from exc

    return _bars_from_frame(frame, range_start, range_end)


def _fetch_stock_daily_frame(akshare: Any, code: str, start: str, end: str, adjust: str) -> pd.DataFrame:
    errors: list[str] = []

    def fetch_em() -> pd.DataFrame:
        return akshare.stock_zh_a_hist(
            symbol=code,
            period="daily",
            start_date=start,
            end_date=end,
            adjust=adjust,
            timeout=20,
        )

    try:
        frame = _call_with_retry(fetch_em)
        if frame is not None and not frame.empty:
            return frame
        errors.append("东财 stock_zh_a_hist 返回空数据")
    except Exception as exc:
        errors.append(f"东财 stock_zh_a_hist：{exc}")

    for symbol in _tx_symbols_for_code(code):
        try:
            frame = akshare.stock_zh_a_hist_tx(symbol=symbol, start_date=start, end_date=end, adjust=adjust, timeout=20)
        except Exception as exc:
            errors.append(f"腾讯 stock_zh_a_hist_tx({symbol})：{exc}")
            continue
        if frame is not None and not frame.empty:
            return frame

    raise MarketDataError(_format_fetch_errors("股票", code, errors))


def _fetch_etf_daily_frame(akshare: Any, code: str, start: str, end: str, adjust: str) -> pd.DataFrame:
    errors: list[str] = []

    def fetch_em() -> pd.DataFrame:
        return akshare.fund_etf_hist_em(symbol=code, period="daily", start_date=start, end_date=end, adjust=adjust)

    try:
        frame = _call_with_retry(fetch_em)
        if frame is not None and not frame.empty:
            return frame
        errors.append("东财 fund_etf_hist_em 返回空数据")
    except Exception as exc:
        errors.append(f"东财 fund_etf_hist_em：{exc}")

    for symbol in _sina_symbols_for_code(code):
        try:
            frame = akshare.fund_etf_hist_sina(symbol=symbol)
        except Exception as exc:
            errors.append(f"新浪 fund_etf_hist_sina({symbol})：{exc}")
            continue
        if frame is not None and not frame.empty:
            return frame

    raise MarketDataError(_format_fetch_errors("ETF", code, errors))


def _call_with_retry(fetch: Callable[[], pd.DataFrame]) -> pd.DataFrame:
    last_error: Exception | None = None
    for attempt in range(_AKSHARE_RETRY_ATTEMPTS):
        try:
            return fetch()
        except Exception as exc:
            last_error = exc
            if not _is_retryable_error(exc) or attempt >= _AKSHARE_RETRY_ATTEMPTS - 1:
                raise
            time.sleep(_AKSHARE_RETRY_BASE_DELAY_SECONDS * (attempt + 1))
    if last_error is not None:
        raise last_error
    raise MarketDataError("AKShare 请求失败。")


def _is_retryable_error(exc: Exception) -> bool:
    if isinstance(exc, (ConnectionError, TimeoutError, RemoteDisconnected, requests.exceptions.RequestException)):
        return True
    message = str(exc).lower()
    return any(
        token in message
        for token in (
            "connection aborted",
            "remote end closed connection",
            "connection reset",
            "timed out",
            "temporarily unavailable",
        )
    )


def _format_fetch_errors(asset_label: str, code: str, errors: list[str]) -> str:
    detail = "；".join(errors) if errors else "未知错误"
    return f"AKShare 获取{asset_label} {code} 历史 K 线失败：{detail}"


def _bars_from_frame(frame: pd.DataFrame, start_date: date, end_date: date) -> list[DailyBar]:
    bars: list[DailyBar] = []
    for row in frame.to_dict("records"):
        trade_date = _parse_date(_pick(row, "日期", "date"))
        if not trade_date or trade_date < start_date or trade_date > end_date:
            continue

        volume_value = _pick(row, "成交量", "volume")
        amount_value = _optional_decimal(_pick(row, "成交额", "turnover"))
        if volume_value is None:
            volume_value = _pick(row, "amount")
            amount_value = None
        elif amount_value is None:
            amount_value = _optional_decimal(_pick(row, "amount"))

        bars.append(
            DailyBar(
                trade_date=trade_date,
                open=_decimal(_pick(row, "开盘", "open")),
                high=_decimal(_pick(row, "最高", "high")),
                low=_decimal(_pick(row, "最低", "low")),
                close=_decimal(_pick(row, "收盘", "close")),
                volume=_decimal(volume_value),
                amount=amount_value,
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
    etf_name = _fetch_etf_name_from_em_search(code)

    if _has_etf_history_sina(akshare, code):
        return InstrumentQuote(
            code=code,
            exchange=_exchange_from_code(code),
            symbol=_symbol_from_code(code),
            name=etf_name or code,
            asset_type="etf",
        )

    if _has_etf_history_em(akshare, code):
        return InstrumentQuote(
            code=code,
            exchange=_exchange_from_code(code),
            symbol=_symbol_from_code(code),
            name=etf_name or code,
            asset_type="etf",
        )

    return None


def _fetch_etf_name_from_em_search(code: str) -> str | None:
    try:
        response = requests.get(
            "https://searchapi.eastmoney.com/api/suggest/get",
            params={
                "input": code,
                "type": "14",
                "token": "D43BF722C8E2775DC906FE854BF132C8",
                "count": "5",
            },
            timeout=10,
        )
        response.raise_for_status()
        payload = response.json()
    except Exception:
        return None

    rows = payload.get("QuotationCodeTable", {}).get("Data") or []
    for row in rows:
        if str(row.get("Code") or "").strip() != code:
            continue
        name = str(row.get("Name") or "").strip()
        return name or None
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
