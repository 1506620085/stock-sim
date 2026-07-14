import type { JournalEntry, JournalEntryInput, JournalPeriodSummary } from "./types";

/** 实盘笔记暂用本地 mock，后续切回 API 时关闭此开关即可。 */
export const USE_JOURNAL_MOCK = true;

const now = () => new Date().toISOString();

const seedEntries: JournalEntry[] = [
  {
    id: 1,
    entryDate: "2026-07-10",
    side: "buy",
    symbolCode: null,
    symbolName: "贵州茅台",
    price: 1480.5,
    quantity: 100,
    reason: "回调至月线附近缩量企稳，按计划分批建仓；主要看消费复苏预期与估值性价比。",
    planNote: "跌破 1450 且放量则放弃本次买入计划。",
    emotionScore: null,
    emotionNote: null,
    resultNote: null,
    tags: ["回调买入", "分批", "纪律执行"],
    ruleIds: [],
    createdAt: "2026-07-10T09:35:00.000Z",
    updatedAt: "2026-07-10T09:35:00.000Z",
  },
  {
    id: 2,
    entryDate: "2026-07-11",
    side: "sell",
    symbolCode: null,
    symbolName: "宁德时代",
    price: 182.3,
    quantity: 200,
    reason: "冲高回落、成交放大，提前兑现部分利润；持仓周期偏长，不想回吐过多浮盈。",
    planNote: "保留底仓，反抽到 190 附近再评估。",
    emotionScore: null,
    emotionNote: null,
    resultNote: "卖后次日继续冲高，说明止盈偏早，但可接受。",
    tags: ["止盈", "做T"],
    ruleIds: [],
    createdAt: "2026-07-11T10:12:00.000Z",
    updatedAt: "2026-07-12T08:00:00.000Z",
  },
  {
    id: 3,
    entryDate: "2026-07-13",
    side: "watch",
    symbolCode: null,
    symbolName: "创业板ETF",
    price: null,
    quantity: null,
    reason: "观察成长风格是否真正切换。暂不进场，等待更明确的成交量与板块轮动确认。",
    planNote: "若连续 3 日站上短期均线可考虑试仓。",
    emotionScore: null,
    emotionNote: null,
    resultNote: null,
    tags: ["观察", "ETF"],
    ruleIds: [],
    createdAt: "2026-07-13T14:20:00.000Z",
    updatedAt: "2026-07-13T14:20:00.000Z",
  },
  {
    id: 4,
    entryDate: "2026-07-14",
    side: "buy",
    symbolCode: null,
    symbolName: "沪深300ETF",
    price: 3.862,
    quantity: 5000,
    reason: "宽基低吸，对冲个股波动；按月定投节奏补仓。",
    planNote: "单次不超过计划仓位的 10%。",
    emotionScore: null,
    emotionNote: null,
    resultNote: null,
    tags: ["定投", "宽基", "纪律执行"],
    ruleIds: [],
    createdAt: "2026-07-14T02:05:00.000Z",
    updatedAt: "2026-07-14T02:05:00.000Z",
  },
];

let mockEntries: JournalEntry[] = seedEntries.map((entry) => ({ ...entry, tags: [...entry.tags], ruleIds: [...entry.ruleIds] }));
let nextId = mockEntries.reduce((max, entry) => Math.max(max, entry.id), 0) + 1;

function delay<T>(value: T, ms = 120): Promise<T> {
  return new Promise((resolve) => {
    window.setTimeout(() => resolve(value), ms);
  });
}

export async function mockLoadJournalEntries(filters?: {
  side?: string;
  tag?: string;
  symbol?: string;
  emotionScore?: number;
}): Promise<JournalEntry[]> {
  let items = [...mockEntries];
  if (filters?.side) items = items.filter((entry) => entry.side === filters.side);
  if (filters?.tag) items = items.filter((entry) => entry.tags.includes(filters.tag!));
  if (filters?.emotionScore != null) items = items.filter((entry) => entry.emotionScore === filters.emotionScore);
  if (filters?.symbol) {
    const keyword = filters.symbol.trim().toLowerCase();
    items = items.filter((entry) => (entry.symbolName || "").toLowerCase().includes(keyword));
  }
  items.sort((a, b) => (a.entryDate === b.entryDate ? b.id - a.id : b.entryDate.localeCompare(a.entryDate)));
  return delay(items.map((entry) => ({ ...entry, tags: [...entry.tags], ruleIds: [...entry.ruleIds] })));
}

export async function mockCreateJournalEntry(input: JournalEntryInput): Promise<JournalEntry> {
  const timestamp = now();
  const entry: JournalEntry = {
    id: nextId++,
    entryDate: input.entryDate,
    side: input.side,
    symbolCode: input.symbolCode ?? null,
    symbolName: input.symbolName ?? null,
    price: input.price ?? null,
    quantity: input.quantity ?? null,
    reason: input.reason,
    planNote: input.planNote ?? null,
    emotionScore: input.emotionScore ?? null,
    emotionNote: input.emotionNote ?? null,
    resultNote: input.resultNote ?? null,
    tags: [...(input.tags ?? [])],
    ruleIds: [...(input.ruleIds ?? [])],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  mockEntries = [entry, ...mockEntries];
  return delay({ ...entry, tags: [...entry.tags], ruleIds: [...entry.ruleIds] });
}

export async function mockUpdateJournalEntry(id: number, input: Partial<JournalEntryInput>): Promise<JournalEntry> {
  const index = mockEntries.findIndex((entry) => entry.id === id);
  if (index < 0) throw new Error("笔记不存在");
  const current = mockEntries[index];
  const next: JournalEntry = {
    ...current,
    entryDate: input.entryDate ?? current.entryDate,
    side: input.side ?? current.side,
    symbolCode: input.symbolCode !== undefined ? input.symbolCode : current.symbolCode,
    symbolName: input.symbolName !== undefined ? input.symbolName : current.symbolName,
    price: input.price !== undefined ? input.price : current.price,
    quantity: input.quantity !== undefined ? input.quantity : current.quantity,
    reason: input.reason ?? current.reason,
    planNote: input.planNote !== undefined ? input.planNote : current.planNote,
    emotionScore: input.emotionScore !== undefined ? input.emotionScore : current.emotionScore,
    emotionNote: input.emotionNote !== undefined ? input.emotionNote : current.emotionNote,
    resultNote: input.resultNote !== undefined ? input.resultNote : current.resultNote,
    tags: input.tags !== undefined ? [...input.tags] : [...current.tags],
    ruleIds: input.ruleIds !== undefined ? [...input.ruleIds] : [...current.ruleIds],
    updatedAt: now(),
  };
  mockEntries = mockEntries.map((entry) => (entry.id === id ? next : entry));
  return delay({ ...next, tags: [...next.tags], ruleIds: [...next.ruleIds] });
}

export async function mockDeleteJournalEntry(id: number): Promise<void> {
  mockEntries = mockEntries.filter((entry) => entry.id !== id);
  await delay(undefined);
}

export async function mockLoadJournalPeriodSummary(startDate: string, endDate: string): Promise<JournalPeriodSummary> {
  const entries = mockEntries
    .filter((entry) => entry.entryDate >= startDate && entry.entryDate <= endDate)
    .sort((a, b) => (a.entryDate === b.entryDate ? b.id - a.id : b.entryDate.localeCompare(a.entryDate)));

  const sideMap = new Map<string, number>();
  const tagMap = new Map<string, number>();
  const emotions: number[] = [];
  let ruleRefCount = 0;

  for (const entry of entries) {
    sideMap.set(entry.side, (sideMap.get(entry.side) ?? 0) + 1);
    for (const tag of entry.tags) tagMap.set(tag, (tagMap.get(tag) ?? 0) + 1);
    if (entry.emotionScore != null) emotions.push(entry.emotionScore);
    ruleRefCount += entry.ruleIds.length;
  }

  return delay({
    startDate,
    endDate,
    entryCount: entries.length,
    sideStats: Array.from(sideMap.entries()).map(([side, count]) => ({ side, count })),
    tagStats: Array.from(tagMap.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20),
    emotionAvg: emotions.length ? emotions.reduce((sum, value) => sum + value, 0) / emotions.length : null,
    emotionCount: emotions.length,
    ruleRefCount,
    entries: entries.map((entry) => ({ ...entry, tags: [...entry.tags], ruleIds: [...entry.ruleIds] })),
  });
}
