import { useEffect, useMemo, useRef, useState } from "react";
import { dispose, init, type Chart, type KLineData } from "klinecharts";
import { showInfo } from "../../components/ToastProvider";
import type { ChartDisplaySettings, IndicatorSettings, KLineBar, KlinePeriod, TradeRecord } from "./types";
import { periodToChartSetting } from "./aggregateKlines";
import { resolveEffectiveSubCharts, type EffectiveSubCharts } from "./chartDisplay";
import { registerCustomIndicators } from "./registerCustomIndicators";

registerCustomIndicators();

type Props = {
  bars: KLineBar[];
  code: string;
  indicators: IndicatorSettings;
  chartDisplay: ChartDisplaySettings;
  period?: KlinePeriod;
  selectedDate?: string;
  recenterToken?: number;
  viewScrollDate?: string;
  viewScrollToken?: number;
  trades?: TradeRecord[];
  painPoint?: { date?: string; price?: number };
};

const candlePaneId = "candle_pane";
const indicatorPaneIds = ["volume-pane", "boll-pane", "kdj-pane", "macd-pane"];
const replayDayLineOverlayId = "replay-day-line";
const candleUpColor = "#d83a31";
const candleDownColor = "#15845f";
const candleNoChangeColor = "#68736e";
const mainPaneHeight = 360;
const volumePaneHeight = 118;
const bollPaneHeight = 126;
const oscillatorPaneHeight = 126;
const xAxisHeight = 36;
const earliestBarHintMessage = "已显示最早的K线";
const latestBarHintMessage = "已显示最新的K线";
const chartEdgeHintCooldownMs = 1500;
const chartEdgeDragThresholdPx = 6;

export function KLineChartPanel({ bars, code, indicators, chartDisplay, period = "day", selectedDate, recenterToken = 0, viewScrollDate, viewScrollToken = 0, trades = [], painPoint }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<Chart | null>(null);
  const replayLabelLayerRef = useRef<HTMLDivElement | null>(null);
  const replayDayLabelRef = useRef<HTMLSpanElement | null>(null);
  const selectedDateRef = useRef(selectedDate);
  const [activeTrade, setActiveTrade] = useState<TradeRecord | null>(null);

  selectedDateRef.current = selectedDate;

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
  const effectiveSubCharts = useMemo(() => resolveEffectiveSubCharts(chartDisplay, indicators), [chartDisplay, indicators]);
  const chartHeight = useMemo(() => getChartHeight(effectiveSubCharts), [effectiveSubCharts]);
  const visibleTradeOverlays = useMemo(() => getTradeOverlays(bars, trades), [bars, trades]);
  const painMarker = useMemo(() => getPainMarker(bars, painPoint), [bars, painPoint]);

  useEffect(() => {
    if (!containerRef.current || chartRef.current) return;

    const chart = init(containerRef.current, {
      styles: buildChartStyles(chartDisplay),
    });

    if (!chart) return;

    chartRef.current = chart;
    applyChartScrollLimits(chart);

    let resizeFrame = 0;
    let pointerStartX = 0;
    let pointerActive = false;
    let lastEdgeHintAt = 0;

    const notifyEdgeScrollBlocked = (message: string) => {
      const now = Date.now();
      if (now - lastEdgeHintAt < chartEdgeHintCooldownMs) return;
      lastEdgeHintAt = now;
      showInfo(message);
    };

    const handleWheel = (event: WheelEvent) => {
      const currentChart = chartRef.current;
      if (!currentChart || Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;

      if (event.deltaX > 0 && isChartAtLatestBar(currentChart)) {
        notifyEdgeScrollBlocked(latestBarHintMessage);
        return;
      }

      if (event.deltaX < 0 && isChartAtEarliestBar(currentChart)) {
        notifyEdgeScrollBlocked(earliestBarHintMessage);
      }
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      pointerActive = true;
      pointerStartX = event.clientX;
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!pointerActive) return;
      const currentChart = chartRef.current;
      if (!currentChart) return;

      if (isChartAtLatestBar(currentChart) && event.clientX < pointerStartX - chartEdgeDragThresholdPx) {
        notifyEdgeScrollBlocked(latestBarHintMessage);
        return;
      }

      if (isChartAtEarliestBar(currentChart) && event.clientX > pointerStartX + chartEdgeDragThresholdPx) {
        notifyEdgeScrollBlocked(earliestBarHintMessage);
      }
    };

    const handlePointerEnd = () => {
      pointerActive = false;
    };

    const chartContainer = containerRef.current;
    chartContainer.addEventListener("wheel", handleWheel, { passive: true, capture: true });
    chartContainer.addEventListener("pointerdown", handlePointerDown);
    chartContainer.addEventListener("pointermove", handlePointerMove);
    chartContainer.addEventListener("pointerup", handlePointerEnd);
    chartContainer.addEventListener("pointercancel", handlePointerEnd);
    chartContainer.addEventListener("pointerleave", handlePointerEnd);

    const resizeObserver = new ResizeObserver(() => {
      if (resizeFrame) window.cancelAnimationFrame(resizeFrame);
      resizeFrame = window.requestAnimationFrame(() => {
        resizeFrame = 0;
        chart.resize();
        updateReplayDayLabel(chart, replayLabelLayerRef.current, replayDayLabelRef.current, selectedDateRef.current);
      });
    });
    resizeObserver.observe(containerRef.current);

    const handleViewChange = () => {
      window.requestAnimationFrame(() => {
        const currentChart = chartRef.current;
        if (!currentChart) return;
        updateReplayDayLabel(currentChart, replayLabelLayerRef.current, replayDayLabelRef.current, selectedDateRef.current);
      });
    };

    chart.subscribeAction("onScroll", handleViewChange);
    chart.subscribeAction("onZoom", handleViewChange);
    chart.subscribeAction("onVisibleRangeChange", handleViewChange);

    return () => {
      chart.unsubscribeAction("onScroll", handleViewChange);
      chart.unsubscribeAction("onZoom", handleViewChange);
      chart.unsubscribeAction("onVisibleRangeChange", handleViewChange);
      chartContainer.removeEventListener("wheel", handleWheel, true);
      chartContainer.removeEventListener("pointerdown", handlePointerDown);
      chartContainer.removeEventListener("pointermove", handlePointerMove);
      chartContainer.removeEventListener("pointerup", handlePointerEnd);
      chartContainer.removeEventListener("pointercancel", handlePointerEnd);
      chartContainer.removeEventListener("pointerleave", handlePointerEnd);
      resizeObserver.disconnect();
      dispose(chart);
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    chart.setSymbol({ ticker: code, pricePrecision: 2, volumePrecision: 0 });
    chart.setPeriod(periodToChartSetting(period));
    chart.setDataLoader({
      getBars: ({ callback }) => {
        callback(chartData, { backward: false, forward: false });
      },
    });
    chart.resetData();
    applyChartScrollLimits(chart);
    syncIndicators(chart, indicators, effectiveSubCharts);
    scheduleChartResize(chart);
    scrollChartToSelectedDate(chart, selectedDate);
    syncReplayDayOverlay(chart, selectedDate);
    updateReplayDayLabel(chart, replayLabelLayerRef.current, replayDayLabelRef.current, selectedDate);
  }, [chartData, code, indicators, effectiveSubCharts, period, selectedDate]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.setStyles(buildChartStyles(chartDisplay));
  }, [chartDisplay]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    syncReplayDayOverlay(chart, selectedDate);
    updateReplayDayLabel(chart, replayLabelLayerRef.current, replayDayLabelRef.current, selectedDate);
  }, [selectedDate]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !recenterToken) return;
    scrollChartToSelectedDate(chart, selectedDate);
    updateReplayDayLabel(chart, replayLabelLayerRef.current, replayDayLabelRef.current, selectedDate);
  }, [recenterToken, selectedDate]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !viewScrollToken || !viewScrollDate) return;
    scrollChartToSelectedDate(chart, viewScrollDate);
    updateReplayDayLabel(chart, replayLabelLayerRef.current, replayDayLabelRef.current, selectedDateRef.current);
  }, [viewScrollToken, viewScrollDate]);

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
      {selectedDate ? (
        <div className="replay-label-layer" ref={replayLabelLayerRef}>
          <span className="replay-date-label" ref={replayDayLabelRef}>
            复盘日
          </span>
        </div>
      ) : null}
    </div>
  );
}

function scheduleChartResize(chart: Chart) {
  window.requestAnimationFrame(() => {
    chart.resize();
  });
}

function applyChartScrollLimits(chart: Chart) {
  chart.setMaxOffsetLeftDistance(0);
  chart.setMaxOffsetRightDistance(0);
}

function isChartAtEarliestBar(chart: Chart) {
  const dataList = chart.getDataList();
  if (!dataList.length) return true;
  return chart.getVisibleRange().realFrom <= 0;
}

function isChartAtLatestBar(chart: Chart) {
  const dataList = chart.getDataList();
  if (!dataList.length) return true;
  return chart.getVisibleRange().realTo >= dataList.length;
}

function scrollChartToSelectedDate(chart: Chart, selectedDate?: string) {
  if (selectedDate) {
    const timestamp = new Date(`${selectedDate}T00:00:00`).getTime();
    chart.scrollToTimestamp(timestamp, 0);
    return;
  }
  chart.scrollToRealTime(0);
}

function syncReplayDayOverlay(chart: Chart, selectedDate?: string) {
  if (!selectedDate) {
    chart.removeOverlay({ id: replayDayLineOverlayId });
    return;
  }

  const paneId = resolveCandlePaneId(chart);
  const timestamp = new Date(`${selectedDate}T00:00:00`).getTime();
  const existing = chart.getOverlays({ id: replayDayLineOverlayId });
  if (existing.length) {
    chart.overrideOverlay({
      id: replayDayLineOverlayId,
      paneId,
      points: [{ timestamp }],
      visible: true,
    });
    return;
  }

  chart.createOverlay({
    id: replayDayLineOverlayId,
    name: "verticalStraightLine",
    paneId,
    lock: true,
    visible: true,
    points: [{ timestamp }],
    styles: {
      line: {
        color: "rgba(23, 32, 28, 0.62)",
        size: 1,
        style: "solid",
        dashedValue: [2, 2],
      },
    },
  });
}

function updateReplayDayLabel(
  chart: Chart,
  labelLayer: HTMLDivElement | null,
  label: HTMLSpanElement | null,
  selectedDate?: string,
) {
  if (!labelLayer || !label) return;

  if (!selectedDate) {
    labelLayer.style.display = "none";
    return;
  }

  const paneId = resolveCandlePaneId(chart);
  const mainSize = chart.getSize(paneId, "main");
  const left = getReplayDayLabelLeft(chart, selectedDate);
  if (left === null || !mainSize) {
    labelLayer.style.display = "none";
    return;
  }

  labelLayer.style.display = "block";
  labelLayer.style.left = `${mainSize.left}px`;
  labelLayer.style.top = `${mainSize.top}px`;
  labelLayer.style.width = `${mainSize.width}px`;
  labelLayer.style.height = `${mainSize.height}px`;
  label.style.left = `${left}px`;
  label.style.transform = "translateX(-50%)";

  const labelHalfWidth = label.offsetWidth / 2;
  if (!isReplayDayLabelInPane(left, mainSize.width, labelHalfWidth)) {
    labelLayer.style.display = "none";
  }
}

function isReplayDayLabelInPane(left: number, paneWidth: number, labelHalfWidth: number): boolean {
  if (paneWidth <= 0) return false;
  if (labelHalfWidth <= 0) {
    return left >= 0 && left <= paneWidth;
  }
  return left - labelHalfWidth >= 0 && left + labelHalfWidth <= paneWidth;
}

function getReplayDayLabelLeft(chart: Chart, selectedDate: string): number | null {
  const paneId = resolveCandlePaneId(chart);
  const timestamp = new Date(`${selectedDate}T00:00:00`).getTime();
  const dataList = chart.getDataList();
  const dataIndex = dataList.findIndex((item) => item.timestamp === timestamp);
  const point = dataIndex >= 0 ? { dataIndex, timestamp } : { timestamp };

  const result = chart.convertToPixel(point, { paneId });
  const coord = (Array.isArray(result) ? result[0] : result) as { x?: number };
  if (coord.x === undefined || !Number.isFinite(coord.x)) {
    return null;
  }

  return coord.x;
}

function resolveCandlePaneId(chart: Chart): string {
  const options = chart.getPaneOptions();
  const panes = Array.isArray(options) ? options : options ? [options] : [];
  const matched = panes.find((pane) => pane.id === candlePaneId);
  if (matched?.id) return matched.id;
  const candle = panes.find((pane) => pane.id === "candle" || pane.id?.includes("candle"));
  return candle?.id ?? candlePaneId;
}

function buildChartStyles(display: ChartDisplaySettings) {
  return {
    candle: {
      bar: {
        upColor: candleUpColor,
        downColor: candleDownColor,
        noChangeColor: candleNoChangeColor,
        upBorderColor: candleUpColor,
        downBorderColor: candleDownColor,
        noChangeBorderColor: candleNoChangeColor,
        upWickColor: candleUpColor,
        downWickColor: candleDownColor,
        noChangeWickColor: candleNoChangeColor,
      },
      tooltip: {
        title: {
          show: false,
        },
      },
    },
    grid: {
      horizontal: {
        show: display.showGrid,
        color: "#edf1ee",
      },
      vertical: {
        show: display.showGrid,
        color: "#f5f7f6",
      },
    },
    crosshair: {
      show: display.showCrosshair,
      horizontal: { show: display.showCrosshair },
      vertical: { show: display.showCrosshair },
    },
  };
}

function syncIndicators(chart: Chart, indicators: IndicatorSettings, subCharts: EffectiveSubCharts) {
  chart.removeIndicator();
  chart.setPaneOptions({ id: candlePaneId, height: mainPaneHeight, minHeight: 300 });

  if (indicators.showMa) {
    chart.createIndicator({ name: "MA", calcParams: [indicators.maFast, indicators.maMid, indicators.maSlow] }, { isStack: true, pane: { id: candlePaneId } });
  }

  if (subCharts.showVolume) {
    chart.createIndicator(
      {
        name: "VOL",
        styles: {
          bars: [
            {
              upColor: candleUpColor,
              downColor: candleDownColor,
              noChangeColor: candleNoChangeColor,
            },
          ],
        },
      },
      { pane: { id: indicatorPaneIds[0], height: volumePaneHeight, minHeight: 96 } },
    );
  }

  if (subCharts.showBoll) {
    chart.createIndicator(
      { name: "BOLL", calcParams: [indicators.maSlow, 2], precision: 3 },
      { pane: { id: indicatorPaneIds[1], height: bollPaneHeight, minHeight: 108 } },
    );
  }

  if (subCharts.showKdj) {
    chart.createIndicator("KDJ", { pane: { id: indicatorPaneIds[2], height: oscillatorPaneHeight, minHeight: 108 } });
  }

  if (subCharts.showMacd) {
    chart.createIndicator("MACD", { pane: { id: indicatorPaneIds[3], height: oscillatorPaneHeight, minHeight: 108 } });
  }
}

function getChartHeight(subCharts: EffectiveSubCharts) {
  return (
    mainPaneHeight +
    xAxisHeight +
    (subCharts.showVolume ? volumePaneHeight : 0) +
    (subCharts.showBoll ? bollPaneHeight : 0) +
    (subCharts.showKdj ? oscillatorPaneHeight : 0) +
    (subCharts.showMacd ? oscillatorPaneHeight : 0)
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
