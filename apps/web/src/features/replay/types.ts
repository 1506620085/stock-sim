export type Instrument = {
  id?: number | null;
  code: string;
  name: string;
  type: "股票" | "ETF";
  market: "上证" | "深证";
  exchange?: "SH" | "SZ" | "BJ" | "CN";
  symbol?: string;
  assetType?: "stock" | "etf";
  source?: "database" | "akshare";
  listDate?: string | null;
  isActive?: boolean;
};

export type KLineBar = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  amount?: number | null;
};

export type KlinePeriod = "day" | "week" | "month" | "quarter" | "year";

export type ChartDisplaySettings = {
  subChartCount: number;
  showVolume: boolean;
  showGrid: boolean;
  showCrosshair: boolean;
};

export type IndicatorSettings = {
  maFast: number;
  maMid: number;
  maSlow: number;
  showMa: boolean;
  showBoll: boolean;
  showVolume: boolean;
  showKdj: boolean;
  showMacd: boolean;
};

export type TradeSide = "buy" | "sell";

export type TradeRecord = {
  id: string | number;
  sessionId?: number;
  instrumentId?: number;
  code: string;
  side: TradeSide;
  date: string;
  index: number;
  price: number;
  quantity: number;
  fee: number;
  note: string;
  priceRule?: string;
  emotionScore?: number | null;
};

export type ReplaySession = {
  id: number;
  instrumentId: number;
  name: string;
  startDate: string;
  currentDate: string;
  hideFuture: boolean;
  adjustType: string;
  indicatorConfig: IndicatorSettings;
};

export type TradeReview = {
  id: number;
  sessionId: number;
  startTradeId: number | null;
  endTradeId: number | null;
  title: string;
  note: string;
  tags: string[];
  metricsSnapshot: Record<string, unknown>;
  createdAt: string;
};
