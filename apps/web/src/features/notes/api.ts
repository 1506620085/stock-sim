import { API_BASE, apiFetch, apiJson, buildApiUrl } from "../../api/client";
import {
  mockCreateJournalEntry,
  mockDeleteJournalEntry,
  mockLoadJournalEntries,
  mockLoadJournalPeriodSummary,
  mockUpdateJournalEntry,
  USE_JOURNAL_MOCK,
} from "./mockJournal";
import {
  mockCreateTradingRule,
  mockDeleteTradingRule,
  mockLoadTradingRules,
  mockReorderTradingRules,
  mockUpdateTradingRule,
  USE_RULES_MOCK,
} from "./mockRules";
import type {
  JournalEntry,
  JournalEntryInput,
  JournalPeriodSummary,
  JournalSide,
  TradingRule,
  TradingRuleInput,
  TradingRuleReorderItem,
} from "./types";

type JournalEntryItem = {
  id: number;
  entry_date: string;
  side: JournalSide;
  symbol_code: string | null;
  symbol_name: string | null;
  price: number | null;
  quantity: number | null;
  reason: string;
  plan_note: string | null;
  emotion_score: number | null;
  emotion_note: string | null;
  result_note: string | null;
  tags: string[];
  rule_ids: number[];
  created_at: string;
  updated_at: string;
};

type TradingRuleItem = {
  id: number;
  title: string;
  body: string;
  category: TradingRule["category"];
  status: TradingRule["status"];
  tags: string[];
  parent_id: number | null;
  node_type: TradingRule["nodeType"];
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type PeriodSummaryItem = {
  start_date: string;
  end_date: string;
  entry_count: number;
  side_stats: Array<{ side: string; count: number }>;
  tag_stats: Array<{ tag: string; count: number }>;
  emotion_avg: number | null;
  emotion_count: number;
  rule_ref_count: number;
  entries: JournalEntryItem[];
};

function toJournalEntry(item: JournalEntryItem): JournalEntry {
  return {
    id: item.id,
    entryDate: item.entry_date,
    side: item.side,
    symbolCode: item.symbol_code,
    symbolName: item.symbol_name,
    price: item.price,
    quantity: item.quantity,
    reason: item.reason,
    planNote: item.plan_note,
    emotionScore: item.emotion_score,
    emotionNote: item.emotion_note,
    resultNote: item.result_note,
    tags: item.tags ?? [],
    ruleIds: item.rule_ids ?? [],
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  };
}

function toTradingRule(item: TradingRuleItem): TradingRule {
  return {
    id: item.id,
    title: item.title,
    body: item.body ?? "",
    category: item.category,
    status: item.status,
    tags: item.tags ?? [],
    parentId: item.parent_id ?? null,
    nodeType: item.node_type ?? "doc",
    sortOrder: item.sort_order ?? 0,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
  };
}

function toJournalPayload(input: JournalEntryInput) {
  return {
    entry_date: input.entryDate,
    side: input.side,
    symbol_code: input.symbolCode ?? null,
    symbol_name: input.symbolName ?? null,
    price: input.price ?? null,
    quantity: input.quantity ?? null,
    reason: input.reason,
    plan_note: input.planNote ?? null,
    emotion_score: input.emotionScore ?? null,
    emotion_note: input.emotionNote ?? null,
    result_note: input.resultNote ?? null,
    tags: input.tags ?? [],
    rule_ids: input.ruleIds ?? [],
  };
}

function toRulePayload(input: TradingRuleInput) {
  return {
    title: input.title,
    body: input.body ?? "",
    category: input.category ?? "other",
    status: input.status ?? "active",
    tags: input.tags ?? [],
    parent_id: input.parentId ?? null,
    node_type: input.nodeType ?? "doc",
    ...(input.sortOrder !== undefined ? { sort_order: input.sortOrder } : {}),
  };
}

export async function loadJournalEntries(filters?: {
  side?: string;
  tag?: string;
  symbol?: string;
  emotionScore?: number;
}): Promise<JournalEntry[]> {
  if (USE_JOURNAL_MOCK) return mockLoadJournalEntries(filters);

  const items = await apiJson<JournalEntryItem[]>(
    buildApiUrl("/api/notes/journal-entries", {
      side: filters?.side,
      tag: filters?.tag,
      symbol: filters?.symbol,
      emotion_score: filters?.emotionScore != null ? String(filters.emotionScore) : undefined,
    }),
  );
  return items.map(toJournalEntry);
}

export async function createJournalEntry(input: JournalEntryInput): Promise<JournalEntry> {
  if (USE_JOURNAL_MOCK) return mockCreateJournalEntry(input);

  const item = await apiJson<JournalEntryItem>(`${API_BASE}/api/notes/journal-entries`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(toJournalPayload(input)),
  });
  return toJournalEntry(item);
}

export async function updateJournalEntry(id: number, input: Partial<JournalEntryInput>): Promise<JournalEntry> {
  if (USE_JOURNAL_MOCK) return mockUpdateJournalEntry(id, input);

  const body: Record<string, unknown> = {};
  if (input.entryDate !== undefined) body.entry_date = input.entryDate;
  if (input.side !== undefined) body.side = input.side;
  if (input.symbolCode !== undefined) body.symbol_code = input.symbolCode;
  if (input.symbolName !== undefined) body.symbol_name = input.symbolName;
  if (input.price !== undefined) body.price = input.price;
  if (input.quantity !== undefined) body.quantity = input.quantity;
  if (input.reason !== undefined) body.reason = input.reason;
  if (input.planNote !== undefined) body.plan_note = input.planNote;
  if (input.emotionScore !== undefined) body.emotion_score = input.emotionScore;
  if (input.emotionNote !== undefined) body.emotion_note = input.emotionNote;
  if (input.resultNote !== undefined) body.result_note = input.resultNote;
  if (input.tags !== undefined) body.tags = input.tags;
  if (input.ruleIds !== undefined) body.rule_ids = input.ruleIds;

  const item = await apiJson<JournalEntryItem>(`${API_BASE}/api/notes/journal-entries/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return toJournalEntry(item);
}

export async function deleteJournalEntry(id: number): Promise<void> {
  if (USE_JOURNAL_MOCK) return mockDeleteJournalEntry(id);
  await apiFetch(`${API_BASE}/api/notes/journal-entries/${id}`, { method: "DELETE" });
}

export async function loadTradingRules(filters?: {
  status?: string;
  category?: string;
  nodeType?: string;
}): Promise<TradingRule[]> {
  if (USE_RULES_MOCK) return mockLoadTradingRules(filters);

  const items = await apiJson<TradingRuleItem[]>(
    buildApiUrl("/api/notes/trading-rules", {
      status: filters?.status,
      category: filters?.category,
      node_type: filters?.nodeType,
    }),
  );
  return items.map(toTradingRule);
}

export async function createTradingRule(input: TradingRuleInput): Promise<TradingRule> {
  if (USE_RULES_MOCK) return mockCreateTradingRule(input);

  const item = await apiJson<TradingRuleItem>(`${API_BASE}/api/notes/trading-rules`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(toRulePayload(input)),
  });
  return toTradingRule(item);
}

export async function updateTradingRule(id: number, input: Partial<TradingRuleInput>): Promise<TradingRule> {
  if (USE_RULES_MOCK) return mockUpdateTradingRule(id, input);

  const body: Record<string, unknown> = {};
  if (input.title !== undefined) body.title = input.title;
  if (input.body !== undefined) body.body = input.body;
  if (input.category !== undefined) body.category = input.category;
  if (input.status !== undefined) body.status = input.status;
  if (input.tags !== undefined) body.tags = input.tags;
  if (input.parentId !== undefined) body.parent_id = input.parentId;
  if (input.nodeType !== undefined) body.node_type = input.nodeType;
  if (input.sortOrder !== undefined) body.sort_order = input.sortOrder;

  const item = await apiJson<TradingRuleItem>(`${API_BASE}/api/notes/trading-rules/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return toTradingRule(item);
}

export async function reorderTradingRules(items: TradingRuleReorderItem[]): Promise<TradingRule[]> {
  if (USE_RULES_MOCK) return mockReorderTradingRules(items);

  const response = await apiJson<TradingRuleItem[]>(`${API_BASE}/api/notes/trading-rules/reorder`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      items: items.map((item) => ({
        id: item.id,
        parent_id: item.parentId,
        sort_order: item.sortOrder,
      })),
    }),
  });
  return response.map(toTradingRule);
}

export async function deleteTradingRule(id: number): Promise<void> {
  if (USE_RULES_MOCK) return mockDeleteTradingRule(id);
  await apiFetch(`${API_BASE}/api/notes/trading-rules/${id}`, { method: "DELETE" });
}

export async function loadJournalPeriodSummary(startDate: string, endDate: string): Promise<JournalPeriodSummary> {
  if (USE_JOURNAL_MOCK) return mockLoadJournalPeriodSummary(startDate, endDate);

  const item = await apiJson<PeriodSummaryItem>(
    buildApiUrl("/api/notes/journal-period-summary", {
      start_date: startDate,
      end_date: endDate,
    }),
  );
  return {
    startDate: item.start_date,
    endDate: item.end_date,
    entryCount: item.entry_count,
    sideStats: item.side_stats ?? [],
    tagStats: item.tag_stats ?? [],
    emotionAvg: item.emotion_avg,
    emotionCount: item.emotion_count,
    ruleRefCount: item.rule_ref_count,
    entries: (item.entries ?? []).map(toJournalEntry),
  };
}
