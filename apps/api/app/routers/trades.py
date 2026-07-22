from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.core.database import get_session
from app.models import KlineDaily, ReplaySession, Trade, TradeReview
from app.schemas import (
    AccountResetRequest,
    AccountResetResult,
    PnlSummaryRead,
    TradeCreate,
    TradeRead,
    TradeReviewCreate,
    TradeReviewRead,
    TradeUpdate,
)
from app.services.replay.pnl import calculate_fifo_position

router = APIRouter(tags=["trades"])

PRICE_BASIS_OPTIONS = frozenset({"high", "low", "open", "close", "mid"})


def resolve_trade_price(bar: KlineDaily, basis: str) -> Decimal:
    if basis == "high":
        return Decimal(bar.high)
    if basis == "low":
        return Decimal(bar.low)
    if basis == "open":
        return Decimal(bar.open)
    if basis == "close":
        return Decimal(bar.close)
    if basis == "mid":
        return (Decimal(bar.high) + Decimal(bar.low)) / Decimal("2")
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"unsupported price basis: {basis}")


def normalize_price_rule(side: str, price_rule: str | None) -> tuple[str, str]:
    """返回 (price_rule, basis)。缺省：买入最高价、卖出最低价。"""
    default_basis = "high" if side == "buy" else "low"
    if not price_rule:
        basis = default_basis
        return f"{side}_{basis}", basis

    rule = price_rule.strip().lower()
    prefix = f"{side}_"
    if rule.startswith(prefix):
        basis = rule[len(prefix) :]
    elif rule in PRICE_BASIS_OPTIONS:
        basis = rule
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"price_rule must be {side}_<high|low|open|close|mid> or a basis name",
        )

    if basis not in PRICE_BASIS_OPTIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="price_rule basis must be one of high, low, open, close, mid",
        )
    return f"{side}_{basis}", basis


@router.get("/api/trades", response_model=list[TradeRead])
def list_all_trades(session: Session = Depends(get_session)) -> list[Trade]:
    statement = select(Trade).order_by(Trade.trade_date, Trade.id)
    return list(session.exec(statement).all())


@router.post("/api/account/reset", response_model=AccountResetResult)
def reset_account(payload: AccountResetRequest, session: Session = Depends(get_session)) -> AccountResetResult:
    cleared_trades = 0
    cleared_reviews = 0
    if payload.clear_trades:
        reviews = list(session.exec(select(TradeReview)).all())
        for review in reviews:
            session.delete(review)
        cleared_reviews = len(reviews)

        trades = list(session.exec(select(Trade)).all())
        for trade in trades:
            session.delete(trade)
        cleared_trades = len(trades)
        session.commit()

    return AccountResetResult(cleared_trades=cleared_trades, cleared_reviews=cleared_reviews)


@router.get("/api/replay-sessions/{session_id}/trades", response_model=list[TradeRead])
def list_trades(session_id: int, session: Session = Depends(get_session)) -> list[Trade]:
    ensure_replay_session(session_id, session)
    statement = select(Trade).where(Trade.session_id == session_id).order_by(Trade.trade_date, Trade.id)
    return list(session.exec(statement).all())


@router.post("/api/replay-sessions/{session_id}/trades", response_model=TradeRead, status_code=status.HTTP_201_CREATED)
def create_trade(session_id: int, payload: TradeCreate, session: Session = Depends(get_session)) -> Trade:
    replay_session = ensure_replay_session(session_id, session)
    side = payload.side.lower()
    if side not in {"buy", "sell"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="side must be buy or sell")
    if payload.quantity <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="quantity must be greater than 0")
    if payload.fee < 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="fee must not be negative")

    current_bar = get_current_bar(replay_session, session)
    price_rule, basis = normalize_price_rule(side, payload.price_rule)
    price = resolve_trade_price(current_bar, basis)

    if side == "sell":
        existing_trades = list_session_trades_until(session_id, replay_session.current_date, session)
        current_position = calculate_fifo_position(existing_trades)
        if current_position.quantity < payload.quantity:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="sell quantity exceeds current position")

    trade = Trade(
        session_id=replay_session.id,
        instrument_id=replay_session.instrument_id,
        trade_date=replay_session.current_date,
        side=side,
        quantity=payload.quantity,
        price=price,
        price_rule=price_rule,
        fee=payload.fee,
        note=payload.note,
        emotion_score=payload.emotion_score,
    )
    session.add(trade)
    session.commit()
    session.refresh(trade)
    return trade


@router.patch("/api/trades/{trade_id}", response_model=TradeRead)
def update_trade(trade_id: int, payload: TradeUpdate, session: Session = Depends(get_session)) -> Trade:
    trade = session.get(Trade, trade_id)
    if not trade:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trade not found")

    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(trade, key, value)
    session.add(trade)
    session.commit()
    session.refresh(trade)
    return trade


@router.delete("/api/trades/{trade_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_trade(trade_id: int, session: Session = Depends(get_session)) -> None:
    trade = session.get(Trade, trade_id)
    if not trade:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trade not found")
    session.delete(trade)
    session.commit()


@router.get("/api/replay-sessions/{session_id}/pnl", response_model=PnlSummaryRead)
def get_session_pnl(session_id: int, session: Session = Depends(get_session)) -> PnlSummaryRead:
    replay_session = ensure_replay_session(session_id, session)
    trades = list_session_trades_until(session_id, replay_session.current_date, session)
    position = calculate_fifo_position(trades)
    current_bar = get_current_bar(replay_session, session)
    floating_close = (Decimal(current_bar.close) - position.avg_cost) * position.quantity if position.quantity > 0 else Decimal("0")
    floating_low = (Decimal(current_bar.low) - position.avg_cost) * position.quantity if position.quantity > 0 else Decimal("0")

    return PnlSummaryRead(
        quantity=float(position.quantity),
        cost=float(position.cost),
        avg_cost=float(position.avg_cost),
        realized=float(position.realized),
        floating_close=float(floating_close),
        floating_low=float(floating_low),
        total=float(position.realized + floating_low),
    )


@router.get("/api/replay-sessions/{session_id}/reviews", response_model=list[TradeReviewRead])
def list_trade_reviews(session_id: int, session: Session = Depends(get_session)) -> list[TradeReview]:
    ensure_replay_session(session_id, session)
    statement = select(TradeReview).where(TradeReview.session_id == session_id).order_by(TradeReview.created_at.desc())
    return list(session.exec(statement).all())


@router.post("/api/replay-sessions/{session_id}/reviews", response_model=TradeReviewRead, status_code=status.HTTP_201_CREATED)
def create_trade_review(session_id: int, payload: TradeReviewCreate, session: Session = Depends(get_session)) -> TradeReview:
    ensure_replay_session(session_id, session)
    validate_review_trade(session_id, payload.start_trade_id, session)
    validate_review_trade(session_id, payload.end_trade_id, session)

    review = TradeReview(
        session_id=session_id,
        start_trade_id=payload.start_trade_id,
        end_trade_id=payload.end_trade_id,
        title=payload.title,
        note=payload.note,
        tags=payload.tags,
        metrics_snapshot=payload.metrics_snapshot,
    )
    session.add(review)
    session.commit()
    session.refresh(review)
    return review


def ensure_replay_session(session_id: int, session: Session) -> ReplaySession:
    replay_session = session.get(ReplaySession, session_id)
    if not replay_session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Replay session not found")
    return replay_session


def get_current_bar(replay_session: ReplaySession, session: Session) -> KlineDaily:
    statement = (
        select(KlineDaily)
        .where(KlineDaily.instrument_id == replay_session.instrument_id)
        .where(KlineDaily.trade_date == replay_session.current_date)
        .where(KlineDaily.adjust_type == replay_session.adjust_type)
        .order_by(KlineDaily.source_updated_at.desc())
    )
    bar = session.exec(statement).first()
    if not bar:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="current replay date has no kline data")
    return bar


def list_session_trades_until(session_id: int, trade_date, session: Session) -> list[Trade]:
    statement = (
        select(Trade)
        .where(Trade.session_id == session_id)
        .where(Trade.trade_date <= trade_date)
        .order_by(Trade.trade_date, Trade.id)
    )
    return list(session.exec(statement).all())


def validate_review_trade(session_id: int, trade_id: int | None, session: Session) -> None:
    if trade_id is None:
        return
    trade = session.get(Trade, trade_id)
    if not trade or trade.session_id != session_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="review trade must belong to replay session")
