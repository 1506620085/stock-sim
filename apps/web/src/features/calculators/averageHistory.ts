import type { AssetType, AverageLine } from "./calculations";

export type AverageHistorySession = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  assetType: AssetType;
  lines: AverageLine[];
};

const AVERAGE_HISTORY_KEY = "stock-sim.average-history";
export const AVERAGE_HISTORY_MAX = 50;

function normalizeLine(raw: unknown): AverageLine | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  if (typeof item.id !== "string") return null;
  return {
    id: item.id,
    price: typeof item.price === "number" ? item.price : null,
    quantity: typeof item.quantity === "number" ? item.quantity : null,
  };
}

function normalizeSession(raw: unknown): AverageHistorySession | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  if (typeof item.id !== "string" || typeof item.name !== "string") return null;
  if (typeof item.createdAt !== "string" || typeof item.updatedAt !== "string") return null;
  if (item.assetType !== "stock" && item.assetType !== "etf") return null;
  if (!Array.isArray(item.lines)) return null;

  const lines = item.lines.map(normalizeLine).filter((line): line is AverageLine => line != null);
  if (!lines.length) return null;

  return {
    id: item.id,
    name: item.name,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    assetType: item.assetType,
    lines,
  };
}

function sortByUpdatedAtDesc(list: AverageHistorySession[]) {
  return [...list].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
}

function trimToMax(list: AverageHistorySession[]) {
  return sortByUpdatedAtDesc(list).slice(0, AVERAGE_HISTORY_MAX);
}

export function loadAverageHistory(): AverageHistorySession[] {
  try {
    const raw = localStorage.getItem(AVERAGE_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return trimToMax(parsed.map(normalizeSession).filter((item): item is AverageHistorySession => item != null));
  } catch {
    return [];
  }
}

export function saveAverageHistory(list: AverageHistorySession[]) {
  localStorage.setItem(AVERAGE_HISTORY_KEY, JSON.stringify(trimToMax(list)));
}

export function upsertAverageHistory(session: AverageHistorySession): AverageHistorySession[] {
  const list = loadAverageHistory();
  const index = list.findIndex((item) => item.id === session.id);
  const next = [...list];
  if (index >= 0) {
    next[index] = session;
  } else {
    next.unshift(session);
  }
  const trimmed = trimToMax(next);
  saveAverageHistory(trimmed);
  return trimmed;
}

export function deleteAverageHistory(id: string): AverageHistorySession[] {
  const next = loadAverageHistory().filter((item) => item.id !== id);
  saveAverageHistory(next);
  return next;
}

export function renameAverageHistory(id: string, name: string): AverageHistorySession[] {
  const trimmedName = name.trim();
  if (!trimmedName) return loadAverageHistory();
  const list = loadAverageHistory();
  const index = list.findIndex((item) => item.id === id);
  if (index < 0) return list;
  const now = new Date().toISOString();
  const next = [...list];
  next[index] = { ...next[index], name: trimmedName, updatedAt: now };
  const trimmed = trimToMax(next);
  saveAverageHistory(trimmed);
  return trimmed;
}

export function defaultAverageHistoryName(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0");
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const h = pad(date.getHours());
  const min = pad(date.getMinutes());
  return `平均价 ${y}-${m}-${d} ${h}:${min}`;
}

export function formatAverageHistoryTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function countFilledAverageLines(lines: AverageLine[]) {
  return lines.filter((line) => (line.price ?? 0) > 0 && (line.quantity ?? 0) > 0).length;
}
