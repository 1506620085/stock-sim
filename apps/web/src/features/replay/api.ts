import type { Instrument, KLineBar } from "./types";

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

async function extractMessage(response: Response) {
  try {
    const data = await response.json();
    return data?.detail || response.statusText || "请求失败";
  } catch {
    return response.statusText || "请求失败";
  }
}
