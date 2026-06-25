import { useEffect, useMemo, useRef, useState } from "react";
import { dispose, init, type Chart, type KLineData } from "klinecharts";
import type { IndicatorSettings, KLineBar, TradeRecord } from "./types";

type Props = {
  bars: KLineBar[];
  code: string;
  indicators: IndicatorSettings;
  selectedDate?: string;
  trades?: TradeRecord[];
  painPoint?: { date?: string; price?: number };
};

const candlePaneId = "candle_pane";
const indicatorPaneIds = ["volume-pane", "kdj-pane", "macd-pane"];
const mainPaneHeight = 360;
const volumePaneHeight = 118;
const oscillatorPaneHeight = 126;
const xAxisHeight = 36;

export function KLineChartPanel({ bars, code, indicators, selectedDate, trades = [], painPoint }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<Chart | null>(null);
  const [activeTrade, setActiveTrade] = useState<TradeRecord | null>(null);

  const chartData = useMemo<KLineData[]>(
    () =>
      bars.map((bar) => ({
        timestamp: new Date(`${bar.date}T00:00:00`).getTime(),
        open: round(bar.open),
        high: round(bar.high),
        low: round(bar.low),
        close: round(bar.close),
        volume: bar.volume,
      })),
    [bars],
  );
  const selectedIndex = selectedDate ? bars.findIndex((bar) => bar.date === selectedDate) : -1;
  const selectedLineLeft = selectedIndex >= 0 && bars.length > 0 ? `${((selectedIndex + 0.5) / bars.length) * 100}%` : undefined;
  const chartHeight = useMemo(() => getChartHeight(indicators), [indicators]);
  const visibleTradeOverlays = useMemo(() => getTradeOverlays(bars, trades), [bars, trades]);
  const painMarker = useMemo(() => getPainMarker(bars, painPoint), [bars, painPoint]);

  useEffect(() => {
    if (!containerRef.current || chartRef.current) return;

    const chart = init(containerRef.current, {
      styles: {
        candle: {
          bar: {
            upColor: "#d83a31",
            downColor: "#15845f",
            noChangeColor: "#68736e",
            upBorderColor: "#d83a31",
            downBorderColor: "#15845f",
            noChangeBorderColor: "#68736e",
            upWickColor: "#d83a31",
            downWickColor: "#15845f",
            noChangeWickColor: "#68736e",
          },
        },
        grid: {
          horizontal: { color: "#edf1ee" },
          vertical: { color: "#f5f7f6" },
        },
      },
    });

    if (!chart) return;

    chartRef.current = chart;

    const resizeObserver = new ResizeObserver(() => chart.resize());
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      dispose(chart);
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    chart.setSymbol({ ticker: code, pricePrecision: 2, volumePrecision: 0 });
    chart.setPeriod({ type: "day", span: 1 });
    chart.setDataLoader({
      getBars: ({ callback }) => {
        callback(chartData, { backward: false, forward: false });
      },
    });
    chart.resetData();
    syncIndicators(chart, indicators);
    chart.resize();

    if (selectedDate) {
      const timestamp = new Date(`${selectedDate}T00:00:00`).getTime();
      chart.scrollToTimestamp(timestamp, 0);
    } else {
      chart.scrollToRealTime(0);
    }
  }, [chartData, code, indicators, selectedDate]);

  return (
    <div className="kline-chart-wrap">
      <div className="kline-chart" ref={containerRef} style={{ height: chartHeight }} />
      <div className="trade-overlay-layer" style={{ height: mainPaneHeight }}>
        {visibleTradeOverlays.regions.map((region) => (
          <div
            className={`holding-region ${region.pnlPercent >= 0 ? "profit" : "loss"}`}
            key={region.id}
            style={{ left: `${region.left}%`, width: `${region.width}%` }}
          >
            <span>{formatPercent(region.pnlPercent)}</span>
          </div>
        ))}

        {visibleTradeOverlays.markers.map((marker) => (
          <button
            className={`trade-marker ${marker.trade.side}`}
            key={marker.trade.id}
            onClick={() => setActiveTrade(marker.trade)}
            style={{ left: `${marker.left}%`, top: marker.top }}
            title={marker.trade.side === "buy" ? "买入" : "卖出"}
            type="button"
          >
            <strong>{marker.trade.side === "buy" ? "B" : "S"}</strong>
            <span>{marker.trade.side === "buy" ? "买入" : "卖出"}</span>
          </button>
        ))}

        {painMarker ? (
          <div className="pain-point-marker" style={{ left: `${painMarker.left}%`, top: painMarker.top }}>
            最差低点
          </div>
        ) : null}

        {activeTrade ? (
          <div className="trade-note-popover">
            <div className="section-header">
              <h2>
                {activeTrade.date} {activeTrade.side === "buy" ? "买入" : "卖出"}
              </h2>
              <button onClick={() => setActiveTrade(null)} type="button">
                关闭
              </button>
            </div>
            <p>
              {formatPrice(activeTrade.price)} / {activeTrade.quantity.toLocaleString("zh-CN")} 份
            </p>
            <div>{activeTrade.note || "未填写笔记"}</div>
          </div>
        ) : null}
      </div>
      {selectedLineLeft && (
        <div className="replay-date-line" style={{ left: selectedLineLeft }} aria-hidden="true">
          <span>复盘日</span>
        </div>
      )}
    </div>
  );
}

function syncIndicators(chart: Chart, indicators: IndicatorSettings) {
  chart.removeIndicator();
  chart.setPaneOptions({ id: candlePaneId, height: mainPaneHeight, minHeight: 300 });

  if (indicators.showMa) {
    chart.createIndicator({ name: "MA", calcParams: [indicators.maFast, indicators.maMid, indicators.maSlow] }, { isStack: true, pane: { id: candlePaneId } });
  }

  if (indicators.showBoll) {
    chart.createIndicator({ name: "BOLL", calcParams: [indicators.maSlow] }, { isStack: true, pane: { id: candlePaneId } });
  }

  if (indicators.showVolume) {
    chart.createIndicator("VOL", { pane: { id: indicatorPaneIds[0], height: volumePaneHeight, minHeight: 96 } });
  }

  if (indicators.showKdj) {
    chart.createIndicator("KDJ", { pane: { id: indicatorPaneIds[1], height: oscillatorPaneHeight, minHeight: 108 } });
  }

  if (indicators.showMacd) {
    chart.createIndicator("MACD", { pane: { id: indicatorPaneIds[2], height: oscillatorPaneHeight, minHeight: 108 } });
  }
}

function getChartHeight(indicators: IndicatorSettings) {
  return (
    mainPaneHeight +
    xAxisHeight +
    (indicators.showVolume ? volumePaneHeight : 0) +
    (indicators.showKdj ? oscillatorPaneHeight : 0) +
    (indicators.showMacd ? oscillatorPaneHeight : 0)
  );
}

function round(value: number) {
  return Number(value.toFixed(2));
}

function getTradeOverlays(bars: KLineBar[], trades: TradeRecord[]) {
  if (!bars.length) {
    return { markers: [], regions: [] };
  }

  const dateToIndex = new Map(bars.map((bar, index) => [bar.date, index]));
  const priceRange = getMainPanePriceRange(bars);
  const visibleTrades = trades
    .map((trade) => ({ trade, index: dateToIndex.get(trade.date) }))
    .filter((item): item is { trade: TradeRecord; index: number } => item.index !== undefined)
    .sort((a, b) => a.index - b.index);

  const markers = visibleTrades.map(({ trade, index }) => ({
    trade,
    left: ((index + 0.5) / bars.length) * 100,
    top: `${priceToTop(trade.price, priceRange)}px`,
  }));

  const regions = buildHoldingRegions(visibleTrades, bars, priceRange);
  return { markers, regions };
}

function getPainMarker(bars: KLineBar[], painPoint?: { date?: string; price?: number }) {
  if (!painPoint?.date || painPoint.price === undefined || !bars.length) return null;
  const index = bars.findIndex((bar) => bar.date === painPoint.date);
  if (index < 0) return null;
  const priceRange = getMainPanePriceRange(bars);
  return {
    left: ((index + 0.5) / bars.length) * 100,
    top: `${priceToTop(painPoint.price, priceRange) + 28}px`,
  };
}

function buildHoldingRegions(
  indexedTrades: Array<{ trade: TradeRecord; index: number }>,
  bars: KLineBar[],
  priceRange: { min: number; max: number },
) {
  const lots: Array<{ trade: TradeRecord; index: number; remaining: number; unitCost: number }> = [];
  const regions: Array<{ id: string; left: number; width: number; pnlPercent: number }> = [];

  for (const item of indexedTrades) {
    const { trade, index } = item;
    if (trade.side === "buy") {
      lots.push({
        trade,
        index,
        remaining: trade.quantity,
        unitCost: (trade.price * trade.quantity + trade.fee) / trade.quantity,
      });
      continue;
    }

    let remainingSell = trade.quantity;
    for (const lot of lots) {
      if (remainingSell <= 0) break;
      if (lot.remaining <= 0) continue;

      const matched = Math.min(lot.remaining, remainingSell);
      regions.push(makeRegion(lot.trade, lot.index, trade, index, lot.unitCost, bars.length));
      lot.remaining -= matched;
      remainingSell -= matched;
    }
  }

  const lastVisibleIndex = bars.length - 1;
  const lastLow = bars[lastVisibleIndex]?.low ?? priceRange.min;
  for (const lot of lots) {
    if (lot.remaining <= 0) continue;
    const openPnlPercent = ((lastLow - lot.unitCost) / lot.unitCost) * 100;
    regions.push(makeOpenRegion(lot.trade, lot.index, lastVisibleIndex, openPnlPercent, bars.length));
  }

  return regions;
}

function makeRegion(
  buyTrade: TradeRecord,
  buyIndex: number,
  sellTrade: TradeRecord,
  sellIndex: number,
  unitCost: number,
  totalBars: number,
) {
  const left = ((buyIndex + 0.5) / totalBars) * 100;
  const right = ((sellIndex + 0.5) / totalBars) * 100;
  const pnlPercent = ((sellTrade.price - unitCost) / unitCost) * 100;
  return {
    id: `${buyTrade.id}-${sellTrade.id}`,
    left,
    width: Math.max(1, right - left),
    pnlPercent,
  };
}

function makeOpenRegion(buyTrade: TradeRecord, buyIndex: number, endIndex: number, pnlPercent: number, totalBars: number) {
  const left = ((buyIndex + 0.5) / totalBars) * 100;
  const right = ((endIndex + 0.5) / totalBars) * 100;
  return {
    id: `${buyTrade.id}-open`,
    left,
    width: Math.max(1, right - left),
    pnlPercent,
  };
}

function getMainPanePriceRange(bars: KLineBar[]) {
  const high = Math.max(...bars.map((bar) => bar.high));
  const low = Math.min(...bars.map((bar) => bar.low));
  const padding = Math.max((high - low) * 0.08, high * 0.002);
  return { min: low - padding, max: high + padding };
}

function priceToTop(price: number, range: { min: number; max: number }) {
  const ratio = (range.max - price) / Math.max(range.max - range.min, 0.0001);
  return Math.min(Math.max(ratio * mainPaneHeight - 17, 6), mainPaneHeight - 40);
}

function formatPercent(value: number) {
  const prefix = value >= 0 ? "+" : "";
  return `${prefix}${value.toFixed(1)}%`;
}

function formatPrice(value: number) {
  return value.toLocaleString("zh-CN", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });
}
