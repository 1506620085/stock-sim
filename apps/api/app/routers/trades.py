from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.core.database import get_session
from app.models import FeeTemplate, Instrument, KlineDaily, ReplaySession, Trade, TradeReview
from app.schemas import (
    AccountResetRequest,
    AccountResetResult,
    PnlSummaryRead,
    SessionClearTradesRequest,
    SessionClearTradesResult,
    SessionImportRequest,
    SessionImportResult,
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


def calculate_template_trade_fee(side: str, price: Decimal, quantity: Decimal, template: FeeTemplate | None, asset_type: str) -> Decimal:
    if template is None or quantity <= 0 or price <= 0:
        return Decimal("0")
    amount = price * quantity
    config = template.config or {}
    mode = str(config.get("commissionMode") or "rate")
    if mode == "fixed":
        commission = Decimal(str(config.get("fixedCommission") or 0))
    else:
        commission = amount * Decimal(template.commission_rate) / Decimal("100")
        commission = max(commission, Decimal(template.min_commission))
    transfer_fee = amount * Decimal(template.transfer_rate) / Decimal("100")
    stamp_tax = (
        amount * Decimal(template.stamp_tax_rate) / Decimal("100")
        if side == "sell" and asset_type == "stock"
        else Decimal("0")
    )
    return (commission + transfer_fee + stamp_tax).quantize(Decimal("0.01"))


def trade_cash_delta(trade: Trade) -> Decimal:
    gross = Decimal(trade.price) * Decimal(trade.quantity)
    fee = Decimal(trade.fee)
    if trade.side == "buy":
        return -(gross + fee)
    return gross - fee


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


@router.post("/api/replay-sessions/{session_id}/clear-trades", response_model=SessionClearTradesResult)
def clear_session_trades(
    session_id: int,
    payload: SessionClearTradesRequest,
    session: Session = Depends(get_session),
) -> SessionClearTradesResult:
    """
    清除指定复盘会话的买卖记录与复盘记录。
    若仍有持仓，先按当前复盘日与卖出成交价基准全部卖出结算，再删除记录；
    返回 net_cash_delta 供前端并入本地初始资产，以保留结算后的资金结果。
    """
    replay_session = ensure_replay_session(session_id, session)
    instrument = session.get(Instrument, replay_session.instrument_id)
    if not instrument:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Instrument not found")

    basis = payload.sell_price_basis.strip().lower()
    if basis not in PRICE_BASIS_OPTIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="sell_price_basis must be one of high, low, open, close, mid",
        )

    existing_trades = list(
        session.exec(select(Trade).where(Trade.session_id == session_id).order_by(Trade.trade_date, Trade.id)).all()
    )
    position = calculate_fifo_position(existing_trades)

    settled_quantity = Decimal("0")
    settle_price: Decimal | None = None
    settle_fee = Decimal("0")
    settle_date = None

    if position.quantity > 0:
        current_bar = get_current_bar(replay_session, session)
        settle_price = resolve_trade_price(current_bar, basis)
        settled_quantity = position.quantity
        fee_template = (
            session.get(FeeTemplate, replay_session.fee_template_id) if replay_session.fee_template_id else None
        )
        settle_fee = calculate_template_trade_fee(
            "sell",
            settle_price,
            settled_quantity,
            fee_template,
            instrument.asset_type,
        )
        settlement = Trade(
            session_id=replay_session.id,
            instrument_id=replay_session.instrument_id,
            trade_date=replay_session.current_date,
            side="sell",
            quantity=settled_quantity,
            price=settle_price,
            price_rule=f"sell_{basis}",
            fee=settle_fee,
            note="系统结算：清除交易记录前平仓",
            emotion_score=None,
        )
        session.add(settlement)
        session.flush()
        existing_trades.append(settlement)
        settle_date = replay_session.current_date

    net_cash_delta = sum((trade_cash_delta(trade) for trade in existing_trades), Decimal("0"))

    reviews = list(session.exec(select(TradeReview).where(TradeReview.session_id == session_id)).all())
    for review in reviews:
        session.delete(review)

    trades = list(session.exec(select(Trade).where(Trade.session_id == session_id)).all())
    for trade in trades:
        session.delete(trade)

    session.commit()

    return SessionClearTradesResult(
        cleared_trades=len(trades),
        cleared_reviews=len(reviews),
        settled_quantity=float(settled_quantity),
        settle_price=float(settle_price) if settle_price is not None else None,
        settle_fee=float(settle_fee),
        settle_date=settle_date,
        net_cash_delta=float(net_cash_delta),
        instrument_id=replay_session.instrument_id,
        session_id=session_id,
    )


@router.post("/api/replay-sessions/{session_id}/import", response_model=SessionImportResult)
def import_session_records(
    session_id: int,
    payload: SessionImportRequest,
    session: Session = Depends(get_session),
) -> SessionImportResult:
    replay_session = ensure_replay_session(session_id, session)

    if payload.replace:
        existing_reviews = list(session.exec(select(TradeReview).where(TradeReview.session_id == session_id)).all())
        for review in existing_reviews:
            session.delete(review)
        existing_trades = list(session.exec(select(Trade).where(Trade.session_id == session_id)).all())
        for trade in existing_trades:
            session.delete(trade)
        session.flush()

    ordered_trades = sorted(
        payload.trades,
        key=lambda item: (item.trade_date, item.export_id if item.export_id is not None else 0),
    )
    id_map: dict[str, int] = {}
    open_quantity = Decimal("0")
    if not payload.replace:
        existing = list(
            session.exec(select(Trade).where(Trade.session_id == session_id).order_by(Trade.trade_date, Trade.id)).all()
        )
        open_quantity = Decimal(str(calculate_fifo_position(existing).quantity))

    for item in ordered_trades:
        side = item.side.lower().strip()
        if side in {"买入", "buy"}:
            side = "buy"
        elif side in {"卖出", "sell"}:
            side = "sell"
        else:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"unsupported trade side: {item.side}")
        if item.quantity <= 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="quantity must be greater than 0")
        if item.price < 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="price must not be negative")
        if item.fee < 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="fee must not be negative")

        if side == "buy":
            open_quantity += item.quantity
        else:
            if item.quantity > open_quantity:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"sell quantity exceeds position on {item.trade_date}",
                )
            open_quantity -= item.quantity

        price_rule = (item.price_rule or "").strip() or f"{side}_import"
        trade = Trade(
            session_id=replay_session.id,
            instrument_id=replay_session.instrument_id,
            trade_date=item.trade_date,
            side=side,
            quantity=item.quantity,
            price=item.price,
            price_rule=price_rule,
            fee=item.fee,
            note=item.note,
            emotion_score=item.emotion_score,
        )
        session.add(trade)
        session.flush()
        if item.export_id is not None:
            id_map[str(item.export_id)] = int(trade.id)

    imported_reviews = 0
    for review_item in payload.reviews:
        title = review_item.title.strip()
        if not title:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="review title is required")
        start_trade_id = map_export_id(id_map, review_item.start_export_id)
        end_trade_id = map_export_id(id_map, review_item.end_export_id)
        if start_trade_id is not None:
            validate_review_trade(session_id, start_trade_id, session)
        if end_trade_id is not None:
            validate_review_trade(session_id, end_trade_id, session)
        review = TradeReview(
            session_id=session_id,
            start_trade_id=start_trade_id,
            end_trade_id=end_trade_id,
            title=title,
            note=review_item.note,
            tags=review_item.tags,
            metrics_snapshot=review_item.metrics_snapshot,
        )
        session.add(review)
        imported_reviews += 1

    session.commit()
    return SessionImportResult(
        imported_trades=len(ordered_trades),
        imported_reviews=imported_reviews,
        id_map=id_map,
    )


def map_export_id(id_map: dict[str, int], export_id: int | None) -> int | None:
    if export_id is None:
        return None
    mapped = id_map.get(str(export_id))
    if mapped is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"review references missing trade export_id={export_id}",
        )
    return mapped


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
