from collections import defaultdict
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from app.core.database import get_session
from app.models import ReplaySession, Trade, TradeReview
from app.schemas import StatsSummaryRead
from app.services.replay.pnl import calculate_fifo_position

router = APIRouter(prefix="/api/stats", tags=["stats"])


@router.get("/summary", response_model=StatsSummaryRead)
def get_stats_summary(session: Session = Depends(get_session)) -> StatsSummaryRead:
    replay_sessions = list(session.exec(select(ReplaySession).order_by(ReplaySession.updated_at.desc())).all())
    trades = list(session.exec(select(Trade).order_by(Trade.trade_date, Trade.id)).all())
    reviews = list(session.exec(select(TradeReview).order_by(TradeReview.created_at.desc())).all())

    trades_by_session: dict[int, list[Trade]] = defaultdict(list)
    for trade in trades:
        trades_by_session[trade.session_id].append(trade)

    session_pnls = [calculate_fifo_position(items).realized for items in trades_by_session.values()]
    realized_pnl = sum(session_pnls, Decimal("0"))
    profitable_sessions = [value for value in session_pnls if value > 0]
    losing_sessions = [value for value in session_pnls if value < 0]
    average_profit = average(profitable_sessions)
    average_loss = average(losing_sessions)

    return StatsSummaryRead(
        total_sessions=len(replay_sessions),
        total_trades=len(trades),
        buy_count=sum(1 for trade in trades if trade.side == "buy"),
        sell_count=sum(1 for trade in trades if trade.side == "sell"),
        win_rate=(len(profitable_sessions) / len(session_pnls) * 100) if session_pnls else 0,
        realized_pnl=float(realized_pnl),
        average_profit=float(average_profit),
        average_loss=float(average_loss),
        profit_loss_ratio=float(abs(average_profit / average_loss)) if average_loss else 0,
        review_count=len(reviews),
        calendar=build_calendar(replay_sessions, trades_by_session),
        tag_stats=build_tag_stats(reviews),
        recent_reviews=reviews[:5],
    )


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


def build_tag_stats(reviews: list[TradeReview]) -> list[dict[str, Any]]:
    stats: dict[str, dict[str, Any]] = {}
    for review in reviews:
        pnl = parse_decimal_metric(review.metrics_snapshot, "pnl")
        for tag in review.tags or []:
            entry = stats.setdefault(tag, {"tag": tag, "count": 0, "pnl": Decimal("0")})
            entry["count"] += 1
            entry["pnl"] += pnl

    return [
        {"tag": item["tag"], "count": item["count"], "pnl": float(item["pnl"])}
        for item in sorted(stats.values(), key=lambda value: (value["pnl"], -value["count"]))
    ][:12]


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
