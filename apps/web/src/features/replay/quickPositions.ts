import type { FeeSettings } from "../calculators/calculations";
import { calculateMaxBuyableShares, normalizeTradeQuantity, SHARES_PER_LOT } from "./tradeFunds";

export type QuickPositionMode = "fraction" | "fixedShares" | "fixedAmount";

export type QuickPositionPreset = {
  id: string;
  /** 展示名，由 mode + 参数自动生成 */
  name: string;
  mode: QuickPositionMode;
  /** 1/N 仓的 N，1 表示全仓 */
  denominator: number;
  /** 固定股数 */
  shares: number;
  /** 固定金额（元） */
  amount: number;
};

const STORAGE_KEY = "stock-sim.quick-positions";
export const QUICK_POSITION_MAX = 12;

export function formatQuickPositionLabel(preset: Pick<QuickPositionPreset, "mode" | "denominator" | "shares" | "amount">): string {
  if (preset.mode === "fraction") {
    const n = Math.max(1, Math.floor(preset.denominator) || 1);
    return n <= 1 ? "全仓" : `1/${n}仓`;
  }
  if (preset.mode === "fixedShares") {
    return `${Math.floor(preset.shares).toLocaleString("zh-CN")}股`;
  }
  const amount = preset.amount;
  const text = Number.isInteger(amount)
    ? amount.toLocaleString("zh-CN")
    : amount.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
  return `${text}元`;
}

export const DEFAULT_QUICK_POSITIONS: QuickPositionPreset[] = (
  [
    { id: "qp-full", mode: "fraction", denominator: 1, shares: 100, amount: 10000 },
    { id: "qp-half", mode: "fraction", denominator: 2, shares: 100, amount: 10000 },
    { id: "qp-third", mode: "fraction", denominator: 3, shares: 100, amount: 10000 },
    { id: "qp-quarter", mode: "fraction", denominator: 4, shares: 100, amount: 10000 },
  ] as const
).map((item) => ({ ...item, name: formatQuickPositionLabel(item) }));

function normalizePreset(raw: unknown): QuickPositionPreset | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  if (typeof item.id !== "string") return null;
  if (item.mode !== "fraction" && item.mode !== "fixedShares" && item.mode !== "fixedAmount") return null;
  const mode: QuickPositionMode = item.mode;
  const denominator = typeof item.denominator === "number" && item.denominator > 0 ? Math.floor(item.denominator) : 1;
  const shares = typeof item.shares === "number" && item.shares > 0 ? item.shares : SHARES_PER_LOT;
  const amount = typeof item.amount === "number" && item.amount > 0 ? item.amount : 10000;
  const preset = {
    id: item.id,
    mode,
    denominator: Math.max(1, denominator),
    shares: Math.max(SHARES_PER_LOT, normalizeTradeQuantity(shares) || SHARES_PER_LOT),
    amount,
  };
  return {
    ...preset,
    name: formatQuickPositionLabel(preset),
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

export function createEmptyQuickPositionDraft(): { id: string; mode: QuickPositionMode; valueText: string } {
  return {
    id: crypto.randomUUID(),
    mode: "fraction",
    valueText: "",
  };
}

export function presetToDraft(preset: QuickPositionPreset): { id: string; mode: QuickPositionMode; valueText: string } {
  if (preset.mode === "fraction") {
    return { id: preset.id, mode: "fraction", valueText: String(preset.denominator) };
  }
  if (preset.mode === "fixedShares") {
    return { id: preset.id, mode: "fixedShares", valueText: String(preset.shares) };
  }
  return {
    id: preset.id,
    mode: "fixedAmount",
    valueText: Number.isInteger(preset.amount) ? String(preset.amount) : String(preset.amount),
  };
}

export function draftToPreset(draft: {
  id: string;
  mode: QuickPositionMode;
  valueText: string;
}): QuickPositionPreset | null {
  const text = draft.valueText.trim();
  if (!text) return null;

  if (draft.mode === "fraction") {
    const n = Math.floor(Number(text));
    if (!Number.isFinite(n) || n < 1) return null;
    const preset = { id: draft.id, mode: "fraction" as const, denominator: n, shares: SHARES_PER_LOT, amount: 10000 };
    return { ...preset, name: formatQuickPositionLabel(preset) };
  }

  if (draft.mode === "fixedShares") {
    const shares = normalizeTradeQuantity(Number(text));
    if (shares < SHARES_PER_LOT) return null;
    const preset = { id: draft.id, mode: "fixedShares" as const, denominator: 1, shares, amount: 10000 };
    return { ...preset, name: formatQuickPositionLabel(preset) };
  }

  const amount = Number(text);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const preset = { id: draft.id, mode: "fixedAmount" as const, denominator: 1, shares: SHARES_PER_LOT, amount };
  return { ...preset, name: formatQuickPositionLabel(preset) };
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
