import type { Instrument, KLineBar } from "./types";

export const instruments: Instrument[] = [
  { code: "600519", name: "贵州茅台", type: "股票", market: "上证" },
  { code: "510300", name: "沪深300ETF", type: "ETF", market: "上证" },
  { code: "159915", name: "创业板ETF", type: "ETF", market: "深证" },
  { code: "000001", name: "平安银行", type: "股票", market: "深证" },
  { code: "513500", name: "标普500ETF", type: "ETF", market: "上证" },
];

function seededRandom(seed: number) {
  let value = seed % 2147483647;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

function generateBars(instrument: Instrument): KLineBar[] {
  const seed = instrument.code.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const rand = seededRandom(seed);
  const bars: KLineBar[] = [];
  let close = instrument.type === "ETF" ? 3 + rand() * 2 : 18 + rand() * 120;
  const date = new Date("2023-01-02T00:00:00");

  while (bars.length < 360) {
    const day = date.getDay();
    if (day !== 0 && day !== 6) {
      const trend = Math.sin(bars.length / 24) * 0.012 + Math.cos(bars.length / 51) * 0.008;
      const drift = (rand() - 0.48) * 0.045 + trend;
      const open = close * (1 + (rand() - 0.5) * 0.018);
      close = Math.max(0.5, open * (1 + drift));
      const high = Math.max(open, close) * (1 + rand() * 0.028);
      const low = Math.min(open, close) * (1 - rand() * 0.028);
      const volume = Math.round((instrument.type === "ETF" ? 1800000 : 600000) * (0.65 + rand()));

      bars.push({
        date: date.toISOString().slice(0, 10),
        open,
        high,
        low,
        close,
        volume,
      });
    }
    date.setDate(date.getDate() + 1);
  }

  return bars;
}

export const marketData = Object.fromEntries(instruments.map((instrument) => [instrument.code, generateBars(instrument)]));
