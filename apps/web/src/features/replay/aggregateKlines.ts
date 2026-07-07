import type { KLineBar, KlinePeriod } from "./types";

export const KLINE_PERIOD_OPTIONS: { value: KlinePeriod; label: string }[] = [
  { value: "day", label: "日K" },
  { value: "week", label: "周K" },
  { value: "month", label: "月K" },
  { value: "quarter", label: "季K" },
  { value: "year", label: "年K" },
];

export function aggregateKlines(bars: KLineBar[], period: KlinePeriod): KLineBar[] {
  if (period === "day" || !bars.length) {
    return bars;
  }

  const groups = new Map<string, KLineBar[]>();
  const order: string[] = [];

  for (const bar of bars) {
    const key = periodKey(bar.date, period);
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key)!.push(bar);
  }

  return order.map((key) => {
    const chunk = groups.get(key)!;
    const first = chunk[0];
    const last = chunk[chunk.length - 1];
    return {
      date: last.date,
      open: first.open,
      high: Math.max(...chunk.map((item) => item.high)),
      low: Math.min(...chunk.map((item) => item.low)),
      close: last.close,
      volume: chunk.reduce((sum, item) => sum + item.volume, 0),
      amount: sumNullable(chunk.map((item) => item.amount)),
      turnoverRate: sumNullable(chunk.map((item) => item.turnoverRate)),
    };
  });
}

function sumNullable(values: Array<number | null | undefined>) {
  let total = 0;
  for (const value of values) {
    total += value ?? 0;
  }
  return total > 0 ? total : null;
}

export function resolveChartReplayDate(chartBars: KLineBar[], dailyDate?: string): string | undefined {
  if (!dailyDate || !chartBars.length) {
    return dailyDate;
  }
  const exactIndex = chartBars.findIndex((bar) => bar.date === dailyDate);
  if (exactIndex >= 0) {
    return chartBars[exactIndex].date;
  }
  const index = findBarIndexByDate(chartBars, dailyDate);
  return chartBars[index]?.date;
}

export function periodToChartSetting(period: KlinePeriod): {
  type: "day" | "week" | "month" | "year";
  span: number;
} {
  switch (period) {
    case "week":
      return { type: "week", span: 1 };
    case "month":
      return { type: "month", span: 1 };
    case "quarter":
      return { type: "month", span: 3 };
    case "year":
      return { type: "year", span: 1 };
    default:
      return { type: "day", span: 1 };
  }
}

export function findBarIndexByDate(bars: KLineBar[], date: string) {
  if (!bars.length) return 0;
  const exactIndex = bars.findIndex((bar) => bar.date === date);
  if (exactIndex >= 0) return exactIndex;

  const nextIndex = bars.findIndex((bar) => bar.date > date);
  if (nextIndex < 0) return bars.length - 1;
  return Math.max(0, nextIndex - 1);
}

function periodKey(date: string, period: KlinePeriod): string {
  const [year, month] = date.split("-").map(Number);

  switch (period) {
    case "week": {
      const { isoYear, isoWeek } = getIsoWeek(date);
      return `${isoYear}-W${String(isoWeek).padStart(2, "0")}`;
    }
    case "month":
      return `${year}-${String(month).padStart(2, "0")}`;
    case "quarter":
      return `${year}-Q${Math.ceil(month / 3)}`;
    case "year":
      return `${year}`;
    default:
      return date;
  }
}

function getIsoWeek(dateStr: string) {
  const date = new Date(`${dateStr}T12:00:00`);
  const day = date.getDay() || 7;
  date.setDate(date.getDate() + 4 - day);
  const isoYear = date.getFullYear();
  const yearStart = new Date(isoYear, 0, 1);
  const isoWeek = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + (yearStart.getDay() || 7) + 1) / 7);
  return { isoYear, isoWeek };
}
