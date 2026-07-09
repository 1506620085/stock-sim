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
