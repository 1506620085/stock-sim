import type { FeeSettings } from "../calculators/calculations";
import { calculateMaxBuyableShares, normalizeTradeQuantity, SHARES_PER_LOT } from "./tradeFunds";

export type QuickPositionMode = "fraction" | "fixedShares" | "fixedAmount";

export type QuickPositionPreset = {
  id: string;
  name: string;
  mode: QuickPositionMode;
  /** 1/N 仓的 N，默认 1 表示全仓 */
  denominator: number;
  /** 固定股数 */
  shares: number;
  /** 固定金额（元） */
  amount: number;
};

const STORAGE_KEY = "stock-sim.quick-positions";
export const QUICK_POSITION_MAX = 12;

export const DEFAULT_QUICK_POSITIONS: QuickPositionPreset[] = [
  { id: "qp-full", name: "全仓", mode: "fraction", denominator: 1, shares: 100, amount: 10000 },
  { id: "qp-half", name: "1/2仓", mode: "fraction", denominator: 2, shares: 100, amount: 10000 },
  { id: "qp-third", name: "1/3仓", mode: "fraction", denominator: 3, shares: 100, amount: 10000 },
  { id: "qp-quarter", name: "1/4仓", mode: "fraction", denominator: 4, shares: 100, amount: 10000 },
];

function normalizePreset(raw: unknown): QuickPositionPreset | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  if (typeof item.id !== "string" || typeof item.name !== "string") return null;
  if (item.mode !== "fraction" && item.mode !== "fixedShares" && item.mode !== "fixedAmount") return null;
  const denominator = typeof item.denominator === "number" && item.denominator > 0 ? Math.floor(item.denominator) : 1;
  const shares = typeof item.shares === "number" && item.shares > 0 ? item.shares : SHARES_PER_LOT;
  const amount = typeof item.amount === "number" && item.amount > 0 ? item.amount : 10000;
  return {
    id: item.id,
    name: item.name.trim() || "快捷仓位",
    mode: item.mode,
    denominator: Math.max(1, denominator),
    shares: Math.max(SHARES_PER_LOT, normalizeTradeQuantity(shares) || SHARES_PER_LOT),
    amount,
  };
}

export function loadQuickPositions(): QuickPositionPreset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_QUICK_POSITIONS.map((item) => ({ ...item }));
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return DEFAULT_QUICK_POSITIONS.map((item) => ({ ...item }));
    const items = parsed
      .map(normalizePreset)
      .filter((item): item is QuickPositionPreset => item != null)
      .slice(0, QUICK_POSITION_MAX);
    return items.length ? items : DEFAULT_QUICK_POSITIONS.map((item) => ({ ...item }));
  } catch {
    return DEFAULT_QUICK_POSITIONS.map((item) => ({ ...item }));
  }
}

export function saveQuickPositions(presets: QuickPositionPreset[]) {
  const next = presets
    .map(normalizePreset)
    .filter((item): item is QuickPositionPreset => item != null)
    .slice(0, QUICK_POSITION_MAX);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function createEmptyQuickPosition(): QuickPositionPreset {
  return {
    id: crypto.randomUUID(),
    name: "新仓位",
    mode: "fraction",
    denominator: 2,
    shares: SHARES_PER_LOT,
    amount: 10000,
  };
}

export type ResolveQuickPositionInput = {
  preset: QuickPositionPreset;
  maxTradeQuantity: number;
  availableCash: number;
  price: number;
  side: "buy" | "sell";
  feeSettings: FeeSettings | null;
};

/** 按可买/可卖上限与规则计算股数，结果为 100 股整数倍。 */
export function resolveQuickPositionQuantity(input: ResolveQuickPositionInput): number {
  const { preset, maxTradeQuantity, availableCash, price, side, feeSettings } = input;
  if (maxTradeQuantity <= 0) return 0;

  let raw = 0;
  if (preset.mode === "fraction") {
    const n = Math.max(1, Math.floor(preset.denominator) || 1);
    raw = maxTradeQuantity / n;
  } else if (preset.mode === "fixedShares") {
    raw = preset.shares;
  } else {
    if (price <= 0) return 0;
    if (side === "buy") {
      const budget = Math.min(preset.amount, availableCash);
      raw = feeSettings
        ? calculateMaxBuyableShares(budget, price, feeSettings)
        : normalizeTradeQuantity(budget / price);
    } else {
      raw = preset.amount / price;
    }
  }

  return Math.min(normalizeTradeQuantity(raw), maxTradeQuantity);
}
