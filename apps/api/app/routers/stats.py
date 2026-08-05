from collections import Counter, defaultdict
from datetime import date
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlmodel import Session, col, select

from app.core.database import get_session
from app.models import Instrument, JournalEntry, KlineDaily, ReplaySession, Trade, TradeReview
from app.schemas import StatsSummaryRead
from app.services.replay.pnl import (
    calculate_closed_trade_details,
    calculate_fifo_position,
    calculate_mtm_equity_curve,
)

router = APIRouter(prefix="/api/stats", tags=["stats"])

MARK_BASIS_OPTIONS = frozenset({"high", "low", "open", "close", "mid"})


@router.get("/summary", response_model=StatsSummaryRead)
def get_stats_summary(
    session: Session = Depends(get_session),
    mark_basis: str = Query(default="low", description="持仓盯市估值口径，默认与卖出成交价一致用最低价"),
) -> StatsSummaryRead:
    basis = mark_basis if mark_basis in MARK_BASIS_OPTIONS else "low"
    replay_sessions = list(session.exec(select(ReplaySession).order_by(ReplaySession.updated_at.desc())).all())
    trades = list(session.exec(select(Trade).order_by(Trade.trade_date, Trade.id)).all())
    reviews = list(session.exec(select(TradeReview).order_by(TradeReview.created_at.desc())).all())
    instruments = list(session.exec(select(Instrument)).all())
    journal_entries = list(session.exec(select(JournalEntry).order_by(JournalEntry.entry_date.desc(), JournalEntry.id.desc())).all())

    trades_by_session: dict[int, list[Trade]] = defaultdict(list)
    for trade in trades:
        trades_by_session[trade.session_id].append(trade)

    sessions_by_id = {item.id: item for item in replay_sessions if item.id is not None}
    trades_by_id = {item.id: item for item in trades if item.id is not None}
    instruments_by_id = {item.id: item for item in instruments if item.id is not None}

    # 已实现总额仍按会话汇总；胜率/盈亏比按每笔平仓（卖出）样本
    session_pnls = [calculate_fifo_position(items).realized for items in trades_by_session.values()]
    realized_pnl = sum(session_pnls, Decimal("0"))

    closed_details = []
    for items in trades_by_session.values():
        closed_details.extend(calculate_closed_trade_details(items))
    closed_details.sort(key=lambda item: item.trade_date)

    closed_pnls = [item.pnl for item in closed_details]
    profitable_closes = [value for value in closed_pnls if value > 0]
    losing_closes = [value for value in closed_pnls if value < 0]
    average_profit = average(profitable_closes)
    average_loss = average(losing_closes)

    profit_rates = [item.return_rate for item in closed_details if item.pnl > 0]
    loss_rates = [item.return_rate for item in closed_details if item.pnl < 0]
    max_profit_rate = max(profit_rates) if profit_rates else Decimal("0")
    max_loss_rate = min(loss_rates) if loss_rates else Decimal("0")

    trade_day_span = 0
    first_day: date | None = None
    last_day: date | None = None
    if trades:
        first_day = min(trade.trade_date for trade in trades)
        last_day = max(trade.trade_date for trade in trades)
        for trade in trades:
            replay_session = sessions_by_id.get(trade.session_id)
            if replay_session and replay_session.current_date > last_day:
                last_day = replay_session.current_date
        trade_day_span = max(1, (last_day - first_day).days + 1)

    bars_by_key = load_bars_for_mtm(session, trades, sessions_by_id, first_day, last_day)
    mtm_equity_curve = calculate_mtm_equity_curve(trades, sessions_by_id, bars_by_key, basis)

    journal_emotions = [item.emotion_score for item in journal_entries if item.emotion_score is not None]
    journal_tag_counter: Counter[str] = Counter()
    journal_rule_ref_count = 0
    for entry in journal_entries:
        journal_tag_counter.update(entry.tags or [])
        journal_rule_ref_count += len(entry.rule_ids or [])

    return StatsSummaryRead(
        total_sessions=len(replay_sessions),
        total_trades=len(trades),
        buy_count=sum(1 for trade in trades if trade.side == "buy"),
        sell_count=sum(1 for trade in trades if trade.side == "sell"),
        win_rate=(len(profitable_closes) / len(closed_pnls) * 100) if closed_pnls else 0,
        realized_pnl=float(realized_pnl),
        average_profit=float(average_profit),
        average_loss=float(average_loss),
        # 盈亏比 = |平均盈利 / 平均亏损|；缺少亏损样本时为 0，前端显示为 -
        profit_loss_ratio=float(abs(average_profit / average_loss)) if average_loss else 0,
        review_count=len(reviews),
        calendar=build_calendar(replay_sessions, trades_by_session),
        tag_stats=build_tag_stats(reviews, sessions_by_id, trades_by_session, trades_by_id, instruments_by_id),
        recent_reviews=reviews[:5],
        journal_entry_count=len(journal_entries),
        journal_emotion_avg=(sum(journal_emotions) / len(journal_emotions)) if journal_emotions else None,
        journal_rule_ref_count=journal_rule_ref_count,
        journal_tag_stats=[{"tag": tag, "count": count} for tag, count in journal_tag_counter.most_common(12)],
        recent_journal_entries=[
            {
                "id": entry.id,
                "entry_date": entry.entry_date.isoformat(),
                "side": entry.side,
                "symbol_code": entry.symbol_code,
                "symbol_name": entry.symbol_name,
                "reason": entry.reason,
                "emotion_score": entry.emotion_score,
                "tags": entry.tags or [],
            }
            for entry in journal_entries[:5]
        ],
        operation_count=len(closed_details),
        trade_day_span=trade_day_span,
        win_count=len(profitable_closes),
        max_profit_rate=float(max_profit_rate),
        max_loss_rate=float(max_loss_rate),
        mtm_equity_curve=mtm_equity_curve,
    )


def load_bars_for_mtm(
    session: Session,
    trades: list[Trade],
    sessions_by_id: dict[int, ReplaySession],
    first_day: date | None,
    last_day: date | None,
) -> dict[tuple[int, str], dict[date, tuple[Decimal, Decimal, Decimal, Decimal]]]:
    if not trades or first_day is None or last_day is None:
        return {}

    instrument_ids = {trade.instrument_id for trade in trades}
    adjust_types = {
        sessions_by_id[trade.session_id].adjust_type
        for trade in trades
        if trade.session_id in sessions_by_id
    } or {"qfq"}

    rows = list(
        session.exec(
            select(KlineDaily)
            .where(col(KlineDaily.instrument_id).in_(instrument_ids))
            .where(col(KlineDaily.adjust_type).in_(adjust_types))
            .where(KlineDaily.trade_date >= first_day)
            .where(KlineDaily.trade_date <= last_day)
            .order_by(KlineDaily.trade_date, KlineDaily.source_updated_at)
        ).all()
    )

    bars_by_key: dict[tuple[int, str], dict[date, tuple[Decimal, Decimal, Decimal, Decimal]]] = defaultdict(dict)
    for row in rows:
        bars_by_key[(row.instrument_id, row.adjust_type)][row.trade_date] = (
            Decimal(row.open),
            Decimal(row.high),
            Decimal(row.low),
            Decimal(row.close),
        )
    return bars_by_key


def average(values: list[Decimal]) -> Decimal:
    if not values:
        return Decimal("0")
    return sum(values, Decimal("0")) / Decimal(len(values))


def build_calendar(replay_sessions: list[ReplaySession], trades_by_session: dict[int, list[Trade]]) -> list[dict[str, Any]]:
    calendar: dict[str, dict[str, Any]] = {}
    for replay_session in replay_sessions:
        day = replay_session.updated_at.date().isoformat()
        entry = calendar.setdefault(day, {"date": day, "sessions": 0, "trades": 0})
        entry["sessions"] += 1
        entry["trades"] += len(trades_by_session.get(replay_session.id or 0, []))
    return sorted(calendar.values(), key=lambda item: item["date"], reverse=True)[:30]


def build_tag_stats(
    reviews: list[TradeReview],
    sessions_by_id: dict[int, ReplaySession],
    trades_by_session: dict[int, list[Trade]],
    trades_by_id: dict[int, Trade],
    instruments_by_id: dict[int, Instrument],
) -> list[dict[str, Any]]:
    """错因标签展开为每次打标记录，附带股票与复盘区间。"""
    items: list[dict[str, Any]] = []
    for review in reviews:
        tags = [tag for tag in (review.tags or []) if tag]
        if not tags:
            continue

        replay_session = sessions_by_id.get(review.session_id)
        instrument = instruments_by_id.get(replay_session.instrument_id) if replay_session else None
        session_trades = sorted(
            trades_by_session.get(review.session_id, []),
            key=lambda item: (item.trade_date, item.id or 0),
        )
        start_trade = trades_by_id.get(review.start_trade_id) if review.start_trade_id else None
        end_trade = trades_by_id.get(review.end_trade_id) if review.end_trade_id else None
        if start_trade is None and session_trades:
            start_trade = session_trades[0]
        if end_trade is None and session_trades:
            end_trade = session_trades[-1]

        start_date = start_trade.trade_date.isoformat() if start_trade is not None else None
        end_date = end_trade.trade_date.isoformat() if end_trade is not None else None

        snapshot = review.metrics_snapshot if isinstance(review.metrics_snapshot, dict) else {}
        if not start_date:
            start_date = coerce_snapshot_date(snapshot.get("startDate"))
        if not end_date:
            end_date = coerce_snapshot_date(snapshot.get("endDate"))

        pnl = float(parse_decimal_metric(snapshot, "pnl"))
        symbol_code = instrument.code if instrument else None
        symbol_name = instrument.name if instrument else None

        for tag in tags:
            items.append(
                {
                    "tag": tag,
                    "count": 1,
                    "pnl": pnl,
                    "symbol_code": symbol_code,
                    "symbol_name": symbol_name,
                    "start_date": start_date,
                    "end_date": end_date,
                    "review_id": review.id,
                    "created_at": review.created_at.isoformat() if review.created_at else None,
                }
            )

    return sorted(
        items,
        key=lambda value: (value.get("created_at") or "", value["pnl"], value["tag"]),
        reverse=True,
    )


def coerce_snapshot_date(value: Any) -> str | None:
    if value in (None, ""):
        return None
    text = str(value).strip()
    return text or None


def parse_decimal_metric(metrics: dict[str, Any], key: str) -> Decimal:
    if not isinstance(metrics, dict):
        return Decimal("0")
    value = metrics.get(key, 0)
    if value in (None, ""):
        return Decimal("0")
    try:
        return Decimal(str(value))
    except Exception:
        return Decimal("0")
