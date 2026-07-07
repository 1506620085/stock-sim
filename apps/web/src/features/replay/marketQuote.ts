import type { KLineBar } from "./types";

export type QuoteDirection = "up" | "down" | "flat";

export type MarketQuote = {
  price: number;
  change: number;
  changePercent: number;
  direction: QuoteDirection;
  open: number;
  high: number;
  low: number;
  turnoverRate: number | null;
  volume: number;
  amount: number | null;
};

export function buildMarketQuote(bars: KLineBar[], index: number): MarketQuote | null {
  const bar = bars[index];
  if (!bar) return null;

  const prevClose = bars[index - 1]?.close ?? bar.open;
  const change = bar.close - prevClose;
  const changePercent = prevClose !== 0 ? (change / prevClose) * 100 : 0;

  return {
    price: bar.close,
    change,
    changePercent,
    direction: resolveDirection(change),
    open: bar.open,
    high: bar.high,
    low: bar.low,
    turnoverRate: bar.turnoverRate ?? null,
    volume: bar.volume,
    amount: bar.amount ?? null,
  };
}

export function resolveDirection(change: number): QuoteDirection {
  if (change > 0) return "up";
  if (change < 0) return "down";
  return "flat";
}

export function formatQuotePrice(value: number) {
  return value.toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatQuoteChange(value: number) {
  const prefix = value > 0 ? "+" : value < 0 ? "" : "";
  return `${prefix}${value.toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatQuotePercent(value: number) {
  const prefix = value > 0 ? "+" : value < 0 ? "" : "";
  return `${prefix}${value.toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}

export function formatCompactNumber(value: number | null | undefined, unit = "") {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  const abs = Math.abs(value);
  if (abs >= 100_000_000) {
    return `${(value / 100_000_000).toLocaleString("zh-CN", { maximumFractionDigits: 2 })}亿${unit}`;
  }
  if (abs >= 10_000) {
    return `${(value / 10_000).toLocaleString("zh-CN", { maximumFractionDigits: 2 })}万${unit}`;
  }
  return `${value.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}${unit}`;
}

export function formatTurnoverRate(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return `${value.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}%`;
}
