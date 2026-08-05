import type { StatsSummary } from "./api";

export type TagOccurrence = StatsSummary["tag_stats"][number];

export type AggregatedTagStat = {
  tag: string;
  count: number;
  share: number;
  lastSeen: string | null;
  totalPnl: number;
  color: string;
  occurrences: TagOccurrence[];
};

/** Soft, distinguishable palette aligned with the app (teal / green / sand / coral). */
export const TAG_CHART_COLORS = [
  "#176c8f",
  "#2a9d8f",
  "#4a7c59",
  "#c4a35a",
  "#d4785a",
  "#6b8cae",
  "#5a8f7b",
  "#b07d62",
  "#7a9e9f",
  "#8b6b61",
  "#3d7a8c",
  "#9a7b4f",
];

export function aggregateTagStats(items: TagOccurrence[]): AggregatedTagStat[] {
  const map = new Map<string, TagOccurrence[]>();
  for (const item of items) {
    const key = item.tag.trim();
    if (!key) continue;
    const list = map.get(key) ?? [];
    list.push(item);
    map.set(key, list);
  }

  const total = [...map.values()].reduce((sum, list) => sum + list.length, 0);
  const aggregated: AggregatedTagStat[] = [...map.entries()].map(([tag, occurrences], index) => {
    const count = occurrences.length;
    const lastSeen = pickLatestDate(occurrences);
    const totalPnl = occurrences.reduce((sum, item) => sum + (item.pnl || 0), 0);
    return {
      tag,
      count,
      share: total > 0 ? (count / total) * 100 : 0,
      lastSeen,
      totalPnl,
      color: TAG_CHART_COLORS[index % TAG_CHART_COLORS.length],
      occurrences: [...occurrences].sort((a, b) => compareDateDesc(pickOccurrenceDate(a), pickOccurrenceDate(b))),
    };
  });

  return aggregated.sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, "zh-CN"));
}

function pickOccurrenceDate(item: TagOccurrence): string | null {
  return item.created_at || item.end_date || item.start_date || null;
}

function pickLatestDate(items: TagOccurrence[]): string | null {
  let best: string | null = null;
  for (const item of items) {
    const value = pickOccurrenceDate(item);
    if (!value) continue;
    if (!best || compareDateDesc(value, best) < 0) best = value;
  }
  return best;
}

/** Newer first: negative if a > b chronologically. */
function compareDateDesc(a: string | null, b: string | null): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return b.localeCompare(a);
}

export function formatTagDate(value: string | null | undefined): string {
  if (!value) return "—";
  const day = value.slice(0, 10);
  return day || value;
}

export function formatTagSource(item: TagOccurrence): string {
  const stock = [item.symbol_name, item.symbol_code].filter(Boolean).join(" ") || "未知标的";
  if (item.start_date && item.end_date) {
    return item.start_date === item.end_date
      ? `${stock} · ${item.start_date}`
      : `${stock} · ${item.start_date} ~ ${item.end_date}`;
  }
  if (item.start_date || item.end_date) {
    return `${stock} · ${item.start_date ?? "?"} ~ ${item.end_date ?? "?"}`;
  }
  return `${stock} · 区间未知`;
}

/** Flat occurrence list: optional tag filter, newest publish time first. */
export function listTagOccurrences(items: TagOccurrence[], filterTag?: string | null): TagOccurrence[] {
  const filtered = filterTag
    ? items.filter((item) => item.tag.trim() === filterTag)
    : items.filter((item) => item.tag.trim());

  return [...filtered].sort((a, b) => compareDateDesc(pickOccurrenceDate(a), pickOccurrenceDate(b)));
}

export function fuzzyMatchTag(tag: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const target = tag.toLowerCase();
  if (target.includes(q)) return true;
  // simple subsequence fuzzy: all query chars appear in order
  let i = 0;
  for (const ch of target) {
    if (ch === q[i]) i += 1;
    if (i >= q.length) return true;
  }
  return false;
}
