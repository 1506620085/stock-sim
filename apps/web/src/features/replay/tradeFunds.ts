import { calculateTradeFee, type FeeSettings } from "../calculators/calculations";
import type { TradeRecord } from "./types";

export const DEFAULT_STARTING_CASH = 100_000;
export const SHARES_PER_LOT = 100;

export function calculateAvailableCash(trades: TradeRecord[], startingCash = DEFAULT_STARTING_CASH) {
  return trades.reduce((cash, trade) => {
    const gross = trade.price * trade.quantity;
    return trade.side === "buy" ? cash - gross - trade.fee : cash + gross - trade.fee;
  }, startingCash);
}

/** 按标的 FIFO 计算未平仓持仓成本（含买入费用摊入） */
export function calculateOpenPositionBookCost(trades: TradeRecord[]) {
  const groups = new Map<string, TradeRecord[]>();
  for (const trade of trades) {
    const key = String(trade.instrumentId ?? trade.code ?? trade.sessionId ?? "unknown");
    const list = groups.get(key);
    if (list) list.push(trade);
    else groups.set(key, [trade]);
  }

  let totalCost = 0;
  for (const group of groups.values()) {
    const lots: { quantity: number; unitCost: number }[] = [];
    const ordered = [...group].sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return Number(a.id) - Number(b.id);
    });
    for (const trade of ordered) {
      if (trade.side === "buy") {
        lots.push({
          quantity: trade.quantity,
          unitCost: (trade.price * trade.quantity + trade.fee) / trade.quantity,
        });
        continue;
      }
      let remaining = trade.quantity;
      for (const lot of lots) {
        if (remaining <= 0) break;
        if (lot.quantity <= 0) continue;
        const matched = Math.min(lot.quantity, remaining);
        lot.quantity -= matched;
        remaining -= matched;
      }
    }
    totalCost += lots.reduce((sum, lot) => sum + lot.quantity * lot.unitCost, 0);
  }
  return totalCost;
}

/** 现有资产：可用资金 + 持仓账面成本 */
export function calculateAccountEquity(trades: TradeRecord[], startingCash = DEFAULT_STARTING_CASH) {
  return calculateAvailableCash(trades, startingCash) + calculateOpenPositionBookCost(trades);
}

export function normalizeTradeQuantity(raw: number) {
  if (!Number.isFinite(raw) || raw <= 0) {
    return 0;
  }
  return Math.floor(raw / SHARES_PER_LOT) * SHARES_PER_LOT;
}

export function calculateMaxBuyableShares(cash: number, price: number, settings: FeeSettings) {
  if (price <= 0 || cash <= 0) return 0;

  let maxLots = Math.floor(cash / price / SHARES_PER_LOT);
  while (maxLots > 0) {
    const quantity = maxLots * SHARES_PER_LOT;
    const totalCost = quantity * price + calculateTradeFee("buy", price, quantity, settings);
    if (totalCost <= cash + 1e-6) {
      return quantity;
    }
    maxLots -= 1;
  }

  return 0;
}

export function calculateTradeAmount(side: "buy" | "sell", price: number, quantity: number, fee: number) {
  const gross = price * quantity;
  return side === "buy" ? gross + fee : gross - fee;
}

export function formatCurrency(value: number) {
  return `￥${value.toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatShareCount(value: number) {
  return `${value.toLocaleString("zh-CN")} 股`;
}
