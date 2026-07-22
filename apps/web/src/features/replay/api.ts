import { API_BASE, apiFetch, apiJson, buildApiUrl } from "../../api/client";
import type { IndicatorSettings, Instrument, KLineBar, ReplaySession, TradeRecord, TradeReview, TradeSide } from "./types";

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
  turnover_rate: number | null;
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
  fee_template_id: number | null;
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
  const items = await apiJson<InstrumentSearchItem[]>(`${API_BASE}/api/instruments/search?keyword=${encodeURIComponent(keyword)}`);
  return items.map(toInstrument);
}

export async function createInstrument(instrument: Instrument): Promise<Instrument> {
  const item = await apiJson<InstrumentSearchItem>(`${API_BASE}/api/instruments`, {
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
  return toInstrument(item);
}

export async function syncInstrumentKlines(instrumentId: number, options: { start?: string; end?: string; adjust?: string } = {}): Promise<{ rows_fetched: number; rows_written: number; latest_trade_date: string | null; synced_at: string }> {
  return apiJson(
    buildApiUrl(`/api/instruments/${instrumentId}/sync`, {
      start: options.start,
      end: options.end,
      adjust: options.adjust,
    }),
    { method: "POST" },
  );
}

export async function loadInstrumentKlines(instrumentId: number, options: { start?: string; end?: string; adjust?: string } = {}): Promise<KLineBar[]> {
  const items = await apiJson<KlineDailyItem[]>(
    buildApiUrl(`/api/instruments/${instrumentId}/klines`, {
      start: options.start,
      end: options.end,
      adjust: options.adjust,
    }),
  );
  return items.map((item) => ({
    date: item.trade_date,
    open: Number(item.open),
    high: Number(item.high),
    low: Number(item.low),
    close: Number(item.close),
    volume: Number(item.volume),
    amount: item.amount === null ? null : Number(item.amount),
    turnoverRate: item.turnover_rate === null ? null : Number(item.turnover_rate),
  }));
}

export async function loadReplaySessions(instrumentId: number): Promise<ReplaySession[]> {
  const items = await apiJson<ReplaySessionItem[]>(`${API_BASE}/api/replay-sessions?instrument_id=${instrumentId}`);
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
  feeTemplateId?: number | null;
}): Promise<ReplaySession> {
  const item = await apiJson<ReplaySessionItem>(`${API_BASE}/api/replay-sessions`, {
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
      fee_template_id: payload.feeTemplateId ?? null,
    }),
  });
  return toReplaySession(item);
}

export async function updateReplaySession(
  sessionId: number,
  payload: Partial<{
    currentDate: string;
    hideFuture: boolean;
    adjustType: string;
    indicatorConfig: IndicatorSettings;
    feeTemplateId: number | null;
  }>,
): Promise<ReplaySession> {
  const body: Record<string, unknown> = {};
  if (payload.currentDate !== undefined) body.current_date = payload.currentDate;
  if (payload.hideFuture !== undefined) body.hide_future = payload.hideFuture;
  if (payload.adjustType !== undefined) body.adjust_type = payload.adjustType;
  if (payload.indicatorConfig !== undefined) body.indicator_config = payload.indicatorConfig;
  if (payload.feeTemplateId !== undefined) body.fee_template_id = payload.feeTemplateId;

  const item = await apiJson<ReplaySessionItem>(`${API_BASE}/api/replay-sessions/${sessionId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }, { silent: true });
  return toReplaySession(item);
}

export async function loadAllTrades(): Promise<TradeRecord[]> {
  const items = await apiJson<TradeItem[]>(`${API_BASE}/api/trades`);
  return items.map((item) => toTradeRecord(item, ""));
}

export async function resetAccount(clearTrades: boolean): Promise<{ clearedTrades: number; clearedReviews: number }> {
  const result = await apiJson<{ cleared_trades: number; cleared_reviews: number }>(`${API_BASE}/api/account/reset`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clear_trades: clearTrades }),
  });
  return {
    clearedTrades: Number(result.cleared_trades ?? 0),
    clearedReviews: Number(result.cleared_reviews ?? 0),
  };
}

export async function loadSessionTrades(sessionId: number, code: string): Promise<TradeRecord[]> {
  const items = await apiJson<TradeItem[]>(`${API_BASE}/api/replay-sessions/${sessionId}/trades`, undefined, { silent: true });
  return items.map((item) => toTradeRecord(item, code));
}

export async function importSessionRecords(
  sessionId: number,
  payload: {
    replace?: boolean;
    trades: Array<{
      exportId: number | null;
      tradeDate: string;
      side: TradeSide;
      price: number;
      quantity: number;
      fee: number;
      priceRule: string;
      emotionScore: number | null;
      note: string | null;
    }>;
    reviews: Array<{
      title: string;
      note: string | null;
      tags: string[];
      metricsSnapshot: Record<string, unknown>;
      startExportId: number | null;
      endExportId: number | null;
    }>;
  },
): Promise<{ importedTrades: number; importedReviews: number }> {
  const result = await apiJson<{ imported_trades: number; imported_reviews: number }>(
    `${API_BASE}/api/replay-sessions/${sessionId}/import`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        replace: payload.replace ?? true,
        trades: payload.trades.map((trade) => ({
          export_id: trade.exportId,
          trade_date: trade.tradeDate,
          side: trade.side,
          price: trade.price,
          quantity: trade.quantity,
          fee: trade.fee,
          price_rule: trade.priceRule,
          emotion_score: trade.emotionScore,
          note: trade.note,
        })),
        reviews: payload.reviews.map((review) => ({
          title: review.title,
          note: review.note,
          tags: review.tags,
          metrics_snapshot: review.metricsSnapshot,
          start_export_id: review.startExportId,
          end_export_id: review.endExportId,
        })),
      }),
    },
  );
  return {
    importedTrades: Number(result.imported_trades ?? 0),
    importedReviews: Number(result.imported_reviews ?? 0),
  };
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
    priceRule?: string;
  },
): Promise<TradeRecord> {
  const item = await apiJson<TradeItem>(`${API_BASE}/api/replay-sessions/${sessionId}/trades`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      side: payload.side,
      quantity: payload.quantity,
      fee: payload.fee,
      note: payload.note,
      emotion_score: payload.emotionScore ?? null,
      price_rule: payload.priceRule ?? null,
    }),
  });
  return toTradeRecord(item, code);
}

type WatchlistItemResponse = {
  id: number;
  instrument_id: number;
  sort_order: number;
  created_at: string;
};

export async function loadWatchlist(): Promise<WatchlistItemResponse[]> {
  return apiJson(`${API_BASE}/api/watchlist`);
}

export async function addWatchlistItem(instrumentId: number): Promise<WatchlistItemResponse> {
  return apiJson(`${API_BASE}/api/watchlist`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ instrument_id: instrumentId, sort_order: 0 }),
  });
}

export async function loadTradeReviews(sessionId: number): Promise<TradeReview[]> {
  const items = await apiJson<TradeReviewItem[]>(`${API_BASE}/api/replay-sessions/${sessionId}/reviews`, undefined, { silent: true });
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
  const item = await apiJson<TradeReviewItem>(`${API_BASE}/api/replay-sessions/${sessionId}/reviews`, {
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
  return toTradeReview(item);
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
    feeTemplateId: item.fee_template_id,
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
