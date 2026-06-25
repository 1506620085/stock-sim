import type { IndicatorSettings, Instrument, KLineBar, ReplaySession, TradeRecord, TradeReview, TradeSide } from "./types";

const API_BASE = import.meta.env.VITE_API_BASE_URL?.toString().replace(/\/$/, "") || "http://127.0.0.1:8000";

type InstrumentSearchItem = {
  id: number | null;
  code: string;
  exchange: "SH" | "SZ" | "BJ" | "CN";
  symbol: string;
  name: string;
  asset_type: "stock" | "etf";
  list_date: string | null;
  is_active: boolean;
  source?: "database" | "akshare";
};

type KlineDailyItem = {
  trade_date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  amount: number | null;
};

type ReplaySessionItem = {
  id: number;
  instrument_id: number;
  name: string;
  start_date: string;
  current_date: string;
  hide_future: boolean;
  adjust_type: string;
  indicator_config: IndicatorSettings;
};

type TradeItem = {
  id: number;
  session_id: number;
  instrument_id: number;
  trade_date: string;
  side: TradeSide;
  quantity: number;
  price: number;
  price_rule: string;
  fee: number;
  note: string | null;
  emotion_score: number | null;
};

type TradeReviewItem = {
  id: number;
  session_id: number;
  start_trade_id: number | null;
  end_trade_id: number | null;
  title: string;
  note: string | null;
  tags: string[];
  metrics_snapshot: Record<string, unknown>;
  created_at: string;
};

export async function searchInstruments(keyword: string): Promise<Instrument[]> {
  const response = await fetch(`${API_BASE}/api/instruments/search?keyword=${encodeURIComponent(keyword)}`);
  if (!response.ok) {
    throw new Error(await extractMessage(response));
  }

  const items = (await response.json()) as InstrumentSearchItem[];
  return items.map(toInstrument);
}

export async function createInstrument(instrument: Instrument): Promise<Instrument> {
  const response = await fetch(`${API_BASE}/api/instruments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code: instrument.code,
      exchange: instrument.exchange,
      symbol: instrument.symbol,
      name: instrument.name,
      asset_type: instrument.assetType,
      list_date: instrument.listDate,
      is_active: instrument.isActive ?? true,
    }),
  });
  if (!response.ok) {
    throw new Error(await extractMessage(response));
  }
  return toInstrument(await response.json());
}

export async function syncInstrumentKlines(instrumentId: number, options: { start?: string; end?: string; adjust?: string } = {}): Promise<{ rows_fetched: number; rows_written: number; latest_trade_date: string | null; synced_at: string }> {
  const url = new URL(`${API_BASE}/api/instruments/${instrumentId}/sync`);
  if (options.start) url.searchParams.set("start", options.start);
  if (options.end) url.searchParams.set("end", options.end);
  if (options.adjust) url.searchParams.set("adjust", options.adjust);

  const response = await fetch(url, { method: "POST" });
  if (!response.ok) {
    throw new Error(await extractMessage(response));
  }

  return response.json();
}

export async function loadInstrumentKlines(instrumentId: number, options: { start?: string; end?: string; adjust?: string } = {}): Promise<KLineBar[]> {
  const url = new URL(`${API_BASE}/api/instruments/${instrumentId}/klines`);
  if (options.start) url.searchParams.set("start", options.start);
  if (options.end) url.searchParams.set("end", options.end);
  if (options.adjust) url.searchParams.set("adjust", options.adjust);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(await extractMessage(response));
  }

  const items = (await response.json()) as KlineDailyItem[];
  return items.map((item) => ({
    date: item.trade_date,
    open: Number(item.open),
    high: Number(item.high),
    low: Number(item.low),
    close: Number(item.close),
    volume: Number(item.volume),
    amount: item.amount === null ? null : Number(item.amount),
  }));
}

export async function loadReplaySessions(instrumentId: number): Promise<ReplaySession[]> {
  const response = await fetch(`${API_BASE}/api/replay-sessions?instrument_id=${instrumentId}`);
  if (!response.ok) {
    throw new Error(await extractMessage(response));
  }

  const items = (await response.json()) as ReplaySessionItem[];
  return items.map(toReplaySession);
}

export async function createReplaySession(payload: {
  instrumentId: number;
  name: string;
  startDate: string;
  currentDate: string;
  hideFuture: boolean;
  adjustType: string;
  indicatorConfig: IndicatorSettings;
}): Promise<ReplaySession> {
  const response = await fetch(`${API_BASE}/api/replay-sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      instrument_id: payload.instrumentId,
      name: payload.name,
      start_date: payload.startDate,
      current_date: payload.currentDate,
      hide_future: payload.hideFuture,
      adjust_type: payload.adjustType,
      indicator_config: payload.indicatorConfig,
    }),
  });
  if (!response.ok) {
    throw new Error(await extractMessage(response));
  }

  return toReplaySession(await response.json());
}

export async function updateReplaySession(
  sessionId: number,
  payload: Partial<{
    currentDate: string;
    hideFuture: boolean;
    adjustType: string;
    indicatorConfig: IndicatorSettings;
  }>,
): Promise<ReplaySession> {
  const body: Record<string, unknown> = {};
  if (payload.currentDate !== undefined) body.current_date = payload.currentDate;
  if (payload.hideFuture !== undefined) body.hide_future = payload.hideFuture;
  if (payload.adjustType !== undefined) body.adjust_type = payload.adjustType;
  if (payload.indicatorConfig !== undefined) body.indicator_config = payload.indicatorConfig;

  const response = await fetch(`${API_BASE}/api/replay-sessions/${sessionId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(await extractMessage(response));
  }

  return toReplaySession(await response.json());
}

export async function loadSessionTrades(sessionId: number, code: string): Promise<TradeRecord[]> {
  const response = await fetch(`${API_BASE}/api/replay-sessions/${sessionId}/trades`);
  if (!response.ok) {
    throw new Error(await extractMessage(response));
  }

  const items = (await response.json()) as TradeItem[];
  return items.map((item) => toTradeRecord(item, code));
}

export async function createSessionTrade(
  sessionId: number,
  code: string,
  payload: {
    side: TradeSide;
    quantity: number;
    fee: number;
    note: string;
    emotionScore?: number | null;
  },
): Promise<TradeRecord> {
  const response = await fetch(`${API_BASE}/api/replay-sessions/${sessionId}/trades`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      side: payload.side,
      quantity: payload.quantity,
      fee: payload.fee,
      note: payload.note,
      emotion_score: payload.emotionScore ?? null,
    }),
  });
  if (!response.ok) {
    throw new Error(await extractMessage(response));
  }

  return toTradeRecord(await response.json(), code);
}

export async function loadTradeReviews(sessionId: number): Promise<TradeReview[]> {
  const response = await fetch(`${API_BASE}/api/replay-sessions/${sessionId}/reviews`);
  if (!response.ok) {
    throw new Error(await extractMessage(response));
  }

  const items = (await response.json()) as TradeReviewItem[];
  return items.map(toTradeReview);
}

export async function createTradeReview(
  sessionId: number,
  payload: {
    startTradeId: number | null;
    endTradeId: number | null;
    title: string;
    note: string;
    tags: string[];
    metricsSnapshot: Record<string, unknown>;
  },
): Promise<TradeReview> {
  const response = await fetch(`${API_BASE}/api/replay-sessions/${sessionId}/reviews`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      start_trade_id: payload.startTradeId,
      end_trade_id: payload.endTradeId,
      title: payload.title,
      note: payload.note,
      tags: payload.tags,
      metrics_snapshot: payload.metricsSnapshot,
    }),
  });
  if (!response.ok) {
    throw new Error(await extractMessage(response));
  }

  return toTradeReview(await response.json());
}

function toInstrument(item: InstrumentSearchItem): Instrument {
  return {
    id: item.id,
    code: item.code,
    name: item.name,
    type: item.asset_type === "etf" ? "ETF" : "股票",
    market: item.exchange === "SZ" ? "深证" : "上证",
    exchange: item.exchange,
    symbol: item.symbol,
    assetType: item.asset_type,
    source: item.source ?? "database",
    listDate: item.list_date,
    isActive: item.is_active,
  };
}

function toReplaySession(item: ReplaySessionItem): ReplaySession {
  return {
    id: item.id,
    instrumentId: item.instrument_id,
    name: item.name,
    startDate: item.start_date,
    currentDate: item.current_date,
    hideFuture: item.hide_future,
    adjustType: item.adjust_type,
    indicatorConfig: item.indicator_config,
  };
}

function toTradeRecord(item: TradeItem, code: string): TradeRecord {
  return {
    id: item.id,
    sessionId: item.session_id,
    instrumentId: item.instrument_id,
    code,
    side: item.side,
    date: item.trade_date,
    index: 0,
    price: Number(item.price),
    quantity: Number(item.quantity),
    fee: Number(item.fee),
    note: item.note ?? "",
    priceRule: item.price_rule,
    emotionScore: item.emotion_score,
  };
}

function toTradeReview(item: TradeReviewItem): TradeReview {
  return {
    id: item.id,
    sessionId: item.session_id,
    startTradeId: item.start_trade_id,
    endTradeId: item.end_trade_id,
    title: item.title,
    note: item.note ?? "",
    tags: item.tags,
    metricsSnapshot: item.metrics_snapshot,
    createdAt: item.created_at,
  };
}

async function extractMessage(response: Response) {
  try {
    const data = await response.json();
    return data?.detail || response.statusText || "请求失败";
  } catch {
    return response.statusText || "请求失败";
  }
}
