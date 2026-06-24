export type Instrument = {
  code: string;
  name: string;
  type: "股票" | "ETF";
  market: "上证" | "深证";
};

export type KLineBar = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
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
  id: string;
  code: string;
  side: TradeSide;
  date: string;
  index: number;
  price: number;
  quantity: number;
  fee: number;
  note: string;
};
