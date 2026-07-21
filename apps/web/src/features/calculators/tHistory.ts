import type { AssetType, TLedgerEntryInput, TLedgerSide } from "./calculations";

export type THistorySession = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  assetType: AssetType;
  baseAvgCost: number | null;
  baseQuantity: number | null;
  finalPrice: number | null;
  tradeSide: "buy" | "sell";
  entries: TLedgerEntryInput[];
};

const T_HISTORY_KEY = "stock-sim.t-history";
export const T_HISTORY_MAX = 50;

function isLedgerSide(value: unknown): value is TLedgerSide {
  return value === "init" || value === "buy" || value === "sell";
}

function normalizeEntry(raw: unknown): TLedgerEntryInput | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  if (typeof item.id !== "string" || !isLedgerSide(item.side)) return null;
  if (typeof item.price !== "number" || typeof item.quantity !== "number") return null;
  return {
    id: item.id,
    side: item.side,
    price: item.price,
    quantity: item.quantity,
  };
}

function normalizeSession(raw: unknown): THistorySession | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  if (typeof item.id !== "string" || typeof item.name !== "string") return null;
  if (typeof item.createdAt !== "string" || typeof item.updatedAt !== "string") return null;
  if (item.assetType !== "stock" && item.assetType !== "etf") return null;
  if (item.tradeSide !== "buy" && item.tradeSide !== "sell") return null;
  if (!Array.isArray(item.entries)) return null;

  const entries = item.entries.map(normalizeEntry).filter((entry): entry is TLedgerEntryInput => entry != null);

  return {
    id: item.id,
    name: item.name,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    assetType: item.assetType,
    baseAvgCost: typeof item.baseAvgCost === "number" ? item.baseAvgCost : null,
    baseQuantity: typeof item.baseQuantity === "number" ? item.baseQuantity : null,
    finalPrice: typeof item.finalPrice === "number" ? item.finalPrice : null,
    tradeSide: item.tradeSide,
    entries,
  };
}

function sortByUpdatedAtDesc(list: THistorySession[]) {
  return [...list].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
}

function trimToMax(list: THistorySession[]) {
  const sorted = sortByUpdatedAtDesc(list);
  return sorted.slice(0, T_HISTORY_MAX);
}

export function loadTHistory(): THistorySession[] {
  try {
    const raw = localStorage.getItem(T_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return trimToMax(parsed.map(normalizeSession).filter((item): item is THistorySession => item != null));
  } catch {
    return [];
  }
}

export function saveTHistory(list: THistorySession[]) {
  localStorage.setItem(T_HISTORY_KEY, JSON.stringify(trimToMax(list)));
}

export function upsertTHistory(session: THistorySession): THistorySession[] {
  const list = loadTHistory();
  const index = list.findIndex((item) => item.id === session.id);
  const next = [...list];
  if (index >= 0) {
    next[index] = session;
  } else {
    next.unshift(session);
  }
  const trimmed = trimToMax(next);
  saveTHistory(trimmed);
  return trimmed;
}

export function deleteTHistory(id: string): THistorySession[] {
  const next = loadTHistory().filter((item) => item.id !== id);
  saveTHistory(next);
  return next;
}

export function renameTHistory(id: string, name: string): THistorySession[] {
  const trimmedName = name.trim();
  if (!trimmedName) return loadTHistory();
  const list = loadTHistory();
  const index = list.findIndex((item) => item.id === id);
  if (index < 0) return list;
  const now = new Date().toISOString();
  const next = [...list];
  next[index] = { ...next[index], name: trimmedName, updatedAt: now };
  const trimmed = trimToMax(next);
  saveTHistory(trimmed);
  return trimmed;
}

export function defaultTHistoryName(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0");
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const h = pad(date.getHours());
  const min = pad(date.getMinutes());
  return `做T ${y}-${m}-${d} ${h}:${min}`;
}

export function formatTHistoryTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
