from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Mapping

from app.models import ReplaySession, Trade


@dataclass(frozen=True)
class PnlSummary:
    quantity: Decimal
    cost: Decimal
    avg_cost: Decimal
    realized: Decimal


@dataclass(frozen=True)
class ClosedTradePnl:
    trade_date: date
    pnl: Decimal
    cost: Decimal

    @property
    def return_rate(self) -> Decimal:
        if self.cost <= 0:
            return Decimal("0")
        return self.pnl / self.cost * Decimal("100")


BarQuote = tuple[Decimal, Decimal, Decimal, Decimal]  # open, high, low, close
BarsByInstrumentAdjust = Mapping[tuple[int, str], Mapping[date, BarQuote]]


def calculate_fifo_position(trades: list[Trade]) -> PnlSummary:
    lots: list[dict[str, Decimal]] = []
    realized = Decimal("0")

    for trade in sorted(trades, key=lambda item: (item.trade_date, item.id or 0, item.created_at)):
        quantity = Decimal(trade.quantity)
        price = Decimal(trade.price)
        fee = Decimal(trade.fee)

        if trade.side == "buy":
            unit_cost = (price * quantity + fee) / quantity
            lots.append({"quantity": quantity, "unit_cost": unit_cost})
            continue

        remaining = quantity
        sell_proceeds = price * quantity - fee
        consumed_cost = Decimal("0")

        for lot in lots:
            if remaining <= 0:
                break
            if lot["quantity"] <= 0:
                continue
            matched = min(lot["quantity"], remaining)
            consumed_cost += matched * lot["unit_cost"]
            lot["quantity"] -= matched
            remaining -= matched

        realized += sell_proceeds - consumed_cost

    quantity = sum((lot["quantity"] for lot in lots), Decimal("0"))
    cost = sum((lot["quantity"] * lot["unit_cost"] for lot in lots), Decimal("0"))
    avg_cost = cost / quantity if quantity > 0 else Decimal("0")
    return PnlSummary(quantity=quantity, cost=cost, avg_cost=avg_cost, realized=realized)


def calculate_closed_trade_pnls(trades: list[Trade]) -> list[Decimal]:
    """按 FIFO 返回每笔卖出的已实现盈亏（一笔卖出 = 一次平仓样本）。"""
    return [item.pnl for item in calculate_closed_trade_details(trades)]


def calculate_closed_trade_details(trades: list[Trade]) -> list[ClosedTradePnl]:
    """按 FIFO 返回每笔卖出的已实现盈亏与对应成本。"""
    lots: list[dict[str, Decimal]] = []
    closed: list[ClosedTradePnl] = []

    for trade in sorted(trades, key=lambda item: (item.trade_date, item.id or 0, item.created_at)):
        quantity = Decimal(trade.quantity)
        price = Decimal(trade.price)
        fee = Decimal(trade.fee)

        if trade.side == "buy":
            unit_cost = (price * quantity + fee) / quantity
            lots.append({"quantity": quantity, "unit_cost": unit_cost})
            continue

        remaining = quantity
        sell_proceeds = price * quantity - fee
        consumed_cost = Decimal("0")
        matched_total = Decimal("0")

        for lot in lots:
            if remaining <= 0:
                break
            if lot["quantity"] <= 0:
                continue
            matched = min(lot["quantity"], remaining)
            consumed_cost += matched * lot["unit_cost"]
            lot["quantity"] -= matched
            remaining -= matched
            matched_total += matched

        # 无对应买入可匹配时不计入平仓样本
        if matched_total <= 0:
            continue
        closed.append(
            ClosedTradePnl(
                trade_date=trade.trade_date,
                pnl=sell_proceeds - consumed_cost,
                cost=consumed_cost,
            )
        )

    return closed


def resolve_mark_price(bar: BarQuote, basis: str) -> Decimal:
    open_, high, low, close = bar
    if basis == "high":
        return high
    if basis == "low":
        return low
    if basis == "open":
        return open_
    if basis == "mid":
        return (high + low) / Decimal("2")
    return close


def calculate_mtm_equity_curve(
    trades: list[Trade],
    sessions_by_id: Mapping[int, ReplaySession],
    bars_by_key: BarsByInstrumentAdjust,
    mark_basis: str = "low",
) -> list[float]:
    """
    持仓期盯市权益偏移曲线（现金从 0 起步）。
    每日：先成交，再按估值口径对未平仓持仓市值计价；返回值供前端加上初始资产后算最大回撤。
    """
    if not trades:
        return []

    ordered = sorted(trades, key=lambda item: (item.trade_date, item.id or 0, item.created_at))
    trades_by_date: dict[date, list[Trade]] = {}
    for trade in ordered:
        trades_by_date.setdefault(trade.trade_date, []).append(trade)

    start_day = ordered[0].trade_date
    end_day = ordered[-1].trade_date
    for trade in ordered:
        session = sessions_by_id.get(trade.session_id)
        if session and session.current_date > end_day:
            end_day = session.current_date

    involved_keys: set[tuple[int, str]] = set()
    for trade in ordered:
        session = sessions_by_id.get(trade.session_id)
        adjust = session.adjust_type if session else "qfq"
        involved_keys.add((trade.instrument_id, adjust))

    timeline: set[date] = set(trades_by_date)
    for key in involved_keys:
        for bar_day in bars_by_key.get(key, {}):
            if start_day <= bar_day <= end_day:
                timeline.add(bar_day)

    if not timeline:
        return []

    cash = Decimal("0")
    lots_by_instrument: dict[int, list[dict[str, Decimal]]] = {}
    adjust_by_instrument: dict[int, str] = {}
    last_mark_by_instrument: dict[int, Decimal] = {}
    curve: list[float] = []

    for day in sorted(timeline):
        for trade in trades_by_date.get(day, []):
            session = sessions_by_id.get(trade.session_id)
            adjust_by_instrument[trade.instrument_id] = session.adjust_type if session else "qfq"
            quantity = Decimal(trade.quantity)
            price = Decimal(trade.price)
            fee = Decimal(trade.fee)
            lots = lots_by_instrument.setdefault(trade.instrument_id, [])

            if trade.side == "buy":
                cash -= price * quantity + fee
                unit_cost = (price * quantity + fee) / quantity
                lots.append({"quantity": quantity, "unit_cost": unit_cost})
                continue

            cash += price * quantity - fee
            remaining = quantity
            for lot in lots:
                if remaining <= 0:
                    break
                if lot["quantity"] <= 0:
                    continue
                matched = min(lot["quantity"], remaining)
                lot["quantity"] -= matched
                remaining -= matched

        market_value = Decimal("0")
        for instrument_id, lots in lots_by_instrument.items():
            open_qty = sum((lot["quantity"] for lot in lots if lot["quantity"] > 0), Decimal("0"))
            if open_qty <= 0:
                continue
            adjust = adjust_by_instrument.get(instrument_id, "qfq")
            bar = bars_by_key.get((instrument_id, adjust), {}).get(day)
            if bar is not None:
                mark = resolve_mark_price(bar, mark_basis)
                last_mark_by_instrument[instrument_id] = mark
            else:
                mark = last_mark_by_instrument.get(instrument_id)
            if mark is None:
                cost = sum((lot["quantity"] * lot["unit_cost"] for lot in lots if lot["quantity"] > 0), Decimal("0"))
                mark = cost / open_qty if open_qty > 0 else Decimal("0")
            market_value += open_qty * mark

        curve.append(float(cash + market_value))

    return curve
