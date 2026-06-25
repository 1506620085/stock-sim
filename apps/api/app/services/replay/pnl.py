from dataclasses import dataclass
from decimal import Decimal

from app.models import Trade


@dataclass(frozen=True)
class PnlSummary:
    quantity: Decimal
    cost: Decimal
    avg_cost: Decimal
    realized: Decimal


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
