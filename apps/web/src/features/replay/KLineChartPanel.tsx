import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { dispose, init, type Chart, type Crosshair, type KLineData } from "klinecharts";
import { showInfo } from "../../components/ToastProvider";
import { periodToChartSetting, findBarIndexByDate } from "./aggregateKlines";
import { resolveDirection } from "./marketQuote";
import { MainIndicatorSwitcher } from "./MainIndicatorSwitcher";
import type { MainIndicatorState } from "./mainIndicators";
import { getEnabledMaLines } from "./mainIndicators";
import { registerCustomIndicators } from "./registerCustomIndicators";
import { SubIndicatorSwitcherDialog, SubIndicatorTrigger } from "./SubIndicatorSwitcher";
import { getActiveSubSlots, getSubIndicatorCalcParams, type SubIndicatorId, type SubIndicatorState } from "./subIndicators";
import type { ChartDisplaySettings, IndicatorSettings, KLineBar, KlinePeriod, TradeRecord } from "./types";

registerCustomIndicators();

type Props = {
  bars: KLineBar[];
  code: string;
  indicators: IndicatorSettings;
  mainIndicator: MainIndicatorState;
  onMainIndicatorChange: (next: MainIndicatorState) => void;
  subIndicators: SubIndicatorState;
  onSubIndicatorsChange: (next: SubIndicatorState) => void;
  chartDisplay: ChartDisplaySettings;
  period?: KlinePeriod;
  selectedDate?: string;
  recenterToken?: number;
  viewScrollDate?: string;
  viewScrollToken?: number;
  trades?: TradeRecord[];
  /** 当前平均持仓成本；无持仓时传 null/undefined，不绘制成本线 */
  avgCost?: number | null;
  painPoint?: { date?: string; price?: number };
  onHoveredBarIndexChange?: (index: number | null) => void;
};

const candlePaneId = "candle_pane";
const crosshairDateBandPaneId = "crosshair-date-band";
const replayDayLineOverlayId = "replay-day-line";
/** B/S 标签固定尺寸（与 CSS 保持一致） */
const TRADE_MARKER_TAG_W = 22;
const TRADE_MARKER_TAG_H = 18;
/** 标签与 K 线锚点之间的固定虚线长度 */
const TRADE_MARKER_STEM_H = 18;
const TRADE_MARKER_STACK_GAP = 4;
const candleUpColor = "#d83a31";
const candleDownColor = "#15845f";
const candleNoChangeColor = "#68736e";
/** 指标柱/OHLC/圆点与主图一致：红涨绿跌 */
const indicatorRiseFallColors = {
  upColor: candleUpColor,
  downColor: candleDownColor,
  noChangeColor: candleNoChangeColor,
};
const indicatorRiseFallStyles = {
  ohlc: { ...indicatorRiseFallColors },
  bars: [{ ...indicatorRiseFallColors }],
  circles: [{ ...indicatorRiseFallColors }],
};
const chartPaneBackground = "#ffffff";

/** 成交量等大数：一律以「万」为单位（覆盖库默认 K/M/B） */
function formatChartBigNumber(value: string | number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return `${value}`;
  return `${+(numeric / 10_000).toFixed(2)}万`;
}

/** 桌面默认窗格高度；短视口按比例收缩 */
const BASE_MAIN_PANE_HEIGHT = 360;
const BASE_MAIN_PANE_MIN_HEIGHT = 300;
const BASE_VOLUME_PANE_HEIGHT = 118;
const BASE_BOLL_PANE_HEIGHT = 126;
const BASE_OSCILLATOR_PANE_HEIGHT = 126;
const BASE_VOLUME_PANE_MIN_HEIGHT = 96;
const BASE_OTHER_SUB_PANE_MIN_HEIGHT = 108;
const xAxisHeight = 36;
/** 主图与副图之间留给十字光标时间标签的高度 */
const crosshairDateBandHeight = 28;
const earliestBarHintMessage = "已显示最早的K线";
const latestBarHintMessage = "已显示最新的K线";
const chartEdgeHintCooldownMs = 1500;
const chartEdgeDragThresholdPx = 6;
/** 主图指标切换按钮与图例之间的间距 */
const mainIndicatorLegendGapPx = 6;
/** 测量前的兜底预留宽度 */
const mainIndicatorTriggerReservePx = 76;
/** 与 klinecharts 主图指标图例垂直度量对齐 */
const mainIndicatorTooltipOffsetTop = 6;
const mainIndicatorTooltipTitleMarginTop = 4;
const mainIndicatorTooltipTitleSize = 12;
const mainIndicatorTriggerInsetLeftPx = 4;
/** 副图切换按钮预留，避免挡住指标图例（与主图同口径，测量前兜底） */
const subIndicatorTriggerReservePx = 76;
const subIndicatorTriggerInsetLeftPx = 4;
const subIndicatorTriggerInsetTopPx = 4;
/** 鼠标靠近平均成本线多少像素内显示标签 */
const avgCostLabelHoverThresholdPx = 12;

type ChartPaneMetrics = {
  main: number;
  mainMin: number;
  volume: number;
  boll: number;
  oscillator: number;
  volumeMin: number;
  otherMin: number;
};

function resolveChartScale(viewportHeight: number) {
  if (viewportHeight >= 900) return 1;
  if (viewportHeight <= 640) return 0.7;
  return 0.7 + ((viewportHeight - 640) / (900 - 640)) * 0.3;
}

function resolveChartPaneMetrics(viewportHeight: number): ChartPaneMetrics {
  const scale = resolveChartScale(viewportHeight);
  const scaled = (value: number, min: number) => Math.max(min, Math.round(value * scale));
  return {
    main: scaled(BASE_MAIN_PANE_HEIGHT, 220),
    mainMin: scaled(BASE_MAIN_PANE_MIN_HEIGHT, 180),
    volume: scaled(BASE_VOLUME_PANE_HEIGHT, 88),
    boll: scaled(BASE_BOLL_PANE_HEIGHT, 96),
    oscillator: scaled(BASE_OSCILLATOR_PANE_HEIGHT, 96),
    volumeMin: scaled(BASE_VOLUME_PANE_MIN_HEIGHT, 72),
    otherMin: scaled(BASE_OTHER_SUB_PANE_MIN_HEIGHT, 84),
  };
}

function subPaneId(index: number) {
  return `sub-pane-${index}`;
}

function subPaneHeight(id: SubIndicatorId, metrics: ChartPaneMetrics) {
  if (id === "VOL") return metrics.volume;
  if (id === "BOLL" || id === "ENE") return metrics.boll;
  return metrics.oscillator;
}

function subPaneMinHeight(id: SubIndicatorId, metrics: ChartPaneMetrics) {
  return id === "VOL" ? metrics.volumeMin : metrics.otherMin;
}

type SubPaneLayout = {
  index: number;
  indicatorId: SubIndicatorId;
  left: number;
  top: number;
  width: number;
  height: number;
};

type TradeOverlaySpec = {
  markers: Array<{ trade: TradeRecord; trades: TradeRecord[]; dataIndex: number; anchorPrice: number }>;
  regions: Array<{ id: string; startIndex: number; endIndex: number; pnlPercent: number }>;
  avgCost?: number;
  painPoint?: { dataIndex: number; price: number };
};

type TradeOverlayLayout = {
  pane: { left: number; top: number; width: number; height: number } | null;
  markers: Array<{ trade: TradeRecord; trades: TradeRecord[]; x: number; y: number; side: "buy" | "sell" }>;
  regions: Array<{ id: string; left: number; width: number; pnlPercent: number }>;
  avgCost: { y: number; label: string } | null;
  painPoint: { x: number; y: number } | null;
};

/** 复盘日引导线：在 K 线实体与影线处留空，避免挡住上下影线 */
type ReplayDayGuide = {
  x: number;
  segments: Array<{ top: number; height: number }>;
};

const emptyTradeOverlayLayout: TradeOverlayLayout = {
  pane: null,
  markers: [],
  regions: [],
  avgCost: null,
  painPoint: null,
};
/** 影线周围额外留白（像素） */
const replayDayGuideCandleGapPx = 6;

export function KLineChartPanel({
  bars,
  code,
  indicators,
  mainIndicator,
  onMainIndicatorChange,
  subIndicators,
  onSubIndicatorsChange,
  chartDisplay,
  period = "day",
  selectedDate,
  recenterToken = 0,
  viewScrollDate,
  viewScrollToken = 0,
  trades = [],
  avgCost = null,
  painPoint,
  onHoveredBarIndexChange,
}: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<Chart | null>(null);
  const switcherAnchorRef = useRef<HTMLDivElement | null>(null);
  const replayLabelLayerRef = useRef<HTMLDivElement | null>(null);
  const replayDayLabelRef = useRef<HTMLSpanElement | null>(null);
  const crosshairDateLayerRef = useRef<HTMLDivElement | null>(null);
  const crosshairDateLabelRef = useRef<HTMLSpanElement | null>(null);
  const selectedDateRef = useRef(selectedDate);
  const barsRef = useRef(bars);
  const periodRef = useRef(period);
  const hoveredBarIndexRef = useRef<number | null>(null);
  const onHoveredBarIndexChangeRef = useRef(onHoveredBarIndexChange);
  const subIndicatorsRef = useRef(subIndicators);
  const [legendOffsetLeft, setLegendOffsetLeft] = useState(mainIndicatorTriggerReservePx);
  const [subLegendOffsetLeft, setSubLegendOffsetLeft] = useState(subIndicatorTriggerReservePx);
  const [activeTrades, setActiveTrades] = useState<TradeRecord[] | null>(null);
  const [avgCostLabelVisible, setAvgCostLabelVisible] = useState(false);
  const [subPaneLayouts, setSubPaneLayouts] = useState<SubPaneLayout[]>([]);
  const [subSwitchOpenRequest, setSubSwitchOpenRequest] = useState<{ token: number; focusSlot?: number }>({
    token: 0,
  });
  const [viewportHeight, setViewportHeight] = useState(() =>
    typeof window === "undefined" ? 900 : window.innerHeight,
  );

  selectedDateRef.current = selectedDate;
  barsRef.current = bars;
  periodRef.current = period;
  onHoveredBarIndexChangeRef.current = onHoveredBarIndexChange;
  subIndicatorsRef.current = subIndicators;

  useEffect(() => {
    const onResize = () => setViewportHeight(window.innerHeight);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

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
  const activeSubSlots = useMemo(() => getActiveSubSlots(subIndicators), [subIndicators]);
  const paneMetrics = useMemo(() => resolveChartPaneMetrics(viewportHeight), [viewportHeight]);
  const chartHeight = useMemo(() => getChartHeight(activeSubSlots, paneMetrics), [activeSubSlots, paneMetrics]);
  const tradeOverlaySpec = useMemo(
    () =>
      buildTradeOverlaySpec(
        bars,
        trades,
        chartDisplay.showAvgCostLine ? avgCost : null,
        painPoint,
      ),
    [avgCost, bars, chartDisplay.showAvgCostLine, trades, painPoint],
  );
  const tradeOverlaySpecRef = useRef(tradeOverlaySpec);
  const [tradeOverlayLayout, setTradeOverlayLayout] = useState<TradeOverlayLayout>(emptyTradeOverlayLayout);
  const [replayDayGuide, setReplayDayGuide] = useState<ReplayDayGuide | null>(null);

  tradeOverlaySpecRef.current = tradeOverlaySpec;

  useLayoutEffect(() => {
    const anchor = switcherAnchorRef.current;
    const trigger = anchor?.querySelector("button");
    const paneLeft = tradeOverlayLayout.pane?.left ?? 0;
    if (!anchor || !trigger) return;
    // offsetLeft 相对主图 pane，需去掉 pane.left
    const next = Math.ceil(anchor.offsetLeft - paneLeft + trigger.offsetWidth + mainIndicatorLegendGapPx);
    setLegendOffsetLeft((prev) => (prev === next ? prev : next));
  }, [mainIndicator.active, tradeOverlayLayout.pane?.left]);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || !subPaneLayouts.length) return;
    let next = 0;
    wrap.querySelectorAll<HTMLElement>(".sub-indicator-switcher-anchor").forEach((anchor) => {
      const trigger = anchor.querySelector("button");
      if (!trigger) return;
      // 与主图一致：按钮左侧 inset + 按钮宽 + 与图例间距
      next = Math.max(next, subIndicatorTriggerInsetLeftPx + trigger.offsetWidth + mainIndicatorLegendGapPx);
    });
    if (next <= 0) return;
    setSubLegendOffsetLeft((prev) => (prev === next ? prev : next));
  }, [subPaneLayouts, activeSubSlots]);

  const mainIndicatorSwitcherPosition = useMemo(() => {
    const paneTop = tradeOverlayLayout.pane?.top ?? 0;
    const paneLeft = tradeOverlayLayout.pane?.left ?? 0;
    // 锚点对齐图例文字顶边，高度=字号；按钮用 flex 在该文字行内上下居中
    const textTop = paneTop + mainIndicatorTooltipOffsetTop + mainIndicatorTooltipTitleMarginTop;
    return {
      top: textTop,
      left: paneLeft + mainIndicatorTriggerInsetLeftPx,
      height: mainIndicatorTooltipTitleSize,
    };
  }, [tradeOverlayLayout.pane?.left, tradeOverlayLayout.pane?.top]);

  const syncTradeOverlayLayout = () => {
    const chart = chartRef.current;
    if (!chart) return;
    setTradeOverlayLayout(computeTradeOverlayLayout(chart, tradeOverlaySpecRef.current));
    setReplayDayGuide(computeReplayDayGuide(chart, barsRef.current, selectedDateRef.current));
    setSubPaneLayouts(computeSubPaneLayouts(chart, getActiveSubSlots(subIndicatorsRef.current)));
  };

  useEffect(() => {
    if (!containerRef.current || chartRef.current) return;

    const chart = init(containerRef.current, {
      styles: buildChartStyles(chartDisplay, bars, legendOffsetLeft, subLegendOffsetLeft),
      formatter: {
        formatBigNumber: formatChartBigNumber,
      },
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

    const resizeObserver = new ResizeObserver(() => {
      if (resizeFrame) window.cancelAnimationFrame(resizeFrame);
      resizeFrame = window.requestAnimationFrame(() => {
        resizeFrame = 0;
        chart.resize();
        updateReplayDayLabel(chart, replayLabelLayerRef.current, replayDayLabelRef.current, selectedDateRef.current);
        updateCrosshairDateLabel(
          chart,
          crosshairDateLayerRef.current,
          crosshairDateLabelRef.current,
          barsRef.current,
          hoveredBarIndexRef.current,
          periodRef.current,
        );
        syncTradeOverlayLayout();
      });
    });
    resizeObserver.observe(containerRef.current);

    const handleViewChange = () => {
      window.requestAnimationFrame(() => {
        const currentChart = chartRef.current;
        if (!currentChart) return;
        updateReplayDayLabel(currentChart, replayLabelLayerRef.current, replayDayLabelRef.current, selectedDateRef.current);
        updateCrosshairDateLabel(
          currentChart,
          crosshairDateLayerRef.current,
          crosshairDateLabelRef.current,
          barsRef.current,
          hoveredBarIndexRef.current,
          periodRef.current,
        );
        setTradeOverlayLayout(computeTradeOverlayLayout(currentChart, tradeOverlaySpecRef.current));
        setReplayDayGuide(computeReplayDayGuide(currentChart, barsRef.current, selectedDateRef.current));
      });
    };

    chart.subscribeAction("onScroll", handleViewChange);
    chart.subscribeAction("onZoom", handleViewChange);
    chart.subscribeAction("onVisibleRangeChange", handleViewChange);

    const resolveHoveredBarIndex = (crosshair: Crosshair): number | null => {
      const direct = crosshair.dataIndex ?? crosshair.realDataIndex;
      if (typeof direct === "number" && Number.isFinite(direct) && direct >= 0) {
        return Math.floor(direct);
      }

      // klinecharts 10 beta：onCrosshairChange 实际只回传 {x,y,paneId}，dataIndex 只存在内部 store
      const chart = chartRef.current;
      if (!chart || typeof crosshair.x !== "number") return null;

      const converted = chart.convertFromPixel([{ x: crosshair.x, y: crosshair.y ?? 0 }], {
        paneId: crosshair.paneId,
      });
      const point = Array.isArray(converted) ? converted[0] : converted;
      const index = point?.dataIndex;
      if (typeof index === "number" && Number.isFinite(index) && index >= 0) {
        return Math.floor(index);
      }
      return null;
    };

    const syncHoveredBar = (index: number | null) => {
      hoveredBarIndexRef.current = index;
      onHoveredBarIndexChangeRef.current?.(index);
      const currentChart = chartRef.current;
      if (!currentChart) return;
      updateCrosshairDateLabel(
        currentChart,
        crosshairDateLayerRef.current,
        crosshairDateLabelRef.current,
        barsRef.current,
        index,
        periodRef.current,
      );
    };

    const handleCrosshairChange = (data: unknown) => {
      const crosshair = (data ?? {}) as Crosshair;
      syncHoveredBar(resolveHoveredBarIndex(crosshair));
    };

    const handleChartPointerLeave = () => {
      pointerActive = false;
      syncHoveredBar(null);
    };

    // 挂在 wrap 上：覆盖层/指标切换器不在 canvas 容器内，避免误触发 pointerleave 清空行情
    const chartWrap = wrapRef.current;
    chartWrap?.addEventListener("pointerleave", handleChartPointerLeave);
    chart.subscribeAction("onCrosshairChange", handleCrosshairChange);

    return () => {
      chart.unsubscribeAction("onCrosshairChange", handleCrosshairChange);
      chart.unsubscribeAction("onScroll", handleViewChange);
      chart.unsubscribeAction("onZoom", handleViewChange);
      chart.unsubscribeAction("onVisibleRangeChange", handleViewChange);
      chartContainer.removeEventListener("wheel", handleWheel, true);
      chartContainer.removeEventListener("pointerdown", handlePointerDown);
      chartContainer.removeEventListener("pointermove", handlePointerMove);
      chartContainer.removeEventListener("pointerup", handlePointerEnd);
      chartContainer.removeEventListener("pointercancel", handlePointerEnd);
      chartWrap?.removeEventListener("pointerleave", handleChartPointerLeave);
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
    chart.setStyles(buildChartStyles(chartDisplay, bars, legendOffsetLeft, subLegendOffsetLeft));
    syncIndicators(chart, indicators, activeSubSlots, mainIndicator, subIndicators, paneMetrics);
    scheduleChartResize(chart);
    scrollChartToSelectedDate(chart, selectedDate);
    syncReplayDayOverlay(chart, selectedDate);
    updateReplayDayLabel(chart, replayLabelLayerRef.current, replayDayLabelRef.current, selectedDate);
    updateCrosshairDateLabel(
      chart,
      crosshairDateLayerRef.current,
      crosshairDateLabelRef.current,
      bars,
      hoveredBarIndexRef.current,
      period,
    );
    syncTradeOverlayLayout();
  }, [chartData, code, indicators, activeSubSlots, mainIndicator, subIndicators, period, selectedDate, legendOffsetLeft, subLegendOffsetLeft, paneMetrics, chartDisplay, bars]);

  useEffect(() => {
    syncTradeOverlayLayout();
  }, [tradeOverlaySpec]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.setStyles(buildChartStyles(chartDisplay, bars, legendOffsetLeft, subLegendOffsetLeft));
  }, [chartDisplay, bars, legendOffsetLeft, subLegendOffsetLeft]);

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

  const barsRangeKey = `${bars.length}:${bars[0]?.date ?? ""}:${bars[bars.length - 1]?.date ?? ""}`;
  useEffect(() => {
    hoveredBarIndexRef.current = null;
    onHoveredBarIndexChangeRef.current?.(null);
    const chart = chartRef.current;
    if (!chart) return;
    updateCrosshairDateLabel(
      chart,
      crosshairDateLayerRef.current,
      crosshairDateLabelRef.current,
      bars,
      null,
      period,
    );
  }, [selectedDate, barsRangeKey, period]);

  useEffect(() => {
    if (!tradeOverlayLayout.avgCost) {
      setAvgCostLabelVisible(false);
    }
  }, [tradeOverlayLayout.avgCost]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    const updateAvgCostLabelVisibility = (clientX: number, clientY: number) => {
      const avg = tradeOverlayLayout.avgCost;
      const pane = tradeOverlayLayout.pane;
      if (!avg || !pane) {
        setAvgCostLabelVisible(false);
        return;
      }
      const rect = wrap.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const inPane =
        x >= pane.left &&
        x <= pane.left + pane.width &&
        y >= pane.top &&
        y <= pane.top + pane.height;
      const nearLine = Math.abs(y - (pane.top + avg.y)) <= avgCostLabelHoverThresholdPx;
      setAvgCostLabelVisible(inPane && nearLine);
    };

    const handleMouseMove = (event: MouseEvent) => {
      updateAvgCostLabelVisibility(event.clientX, event.clientY);
    };
    const handleMouseLeave = () => setAvgCostLabelVisible(false);

    wrap.addEventListener("mousemove", handleMouseMove);
    wrap.addEventListener("mouseleave", handleMouseLeave);
    return () => {
      wrap.removeEventListener("mousemove", handleMouseMove);
      wrap.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, [tradeOverlayLayout.avgCost, tradeOverlayLayout.pane]);

  function openSubIndicatorSwitch(focusSlot?: number) {
    setSubSwitchOpenRequest((prev) => ({ token: prev.token + 1, focusSlot }));
  }

  return (
    <div className="kline-chart-wrap" ref={wrapRef}>
      <div
        className="main-indicator-switcher-anchor"
        ref={switcherAnchorRef}
        style={{
          top: `${mainIndicatorSwitcherPosition.top}px`,
          left: `${mainIndicatorSwitcherPosition.left}px`,
          height: `${mainIndicatorSwitcherPosition.height}px`,
        }}
      >
        <MainIndicatorSwitcher onChange={onMainIndicatorChange} value={mainIndicator} />
      </div>
      {subPaneLayouts.map((pane) => (
        <div
          className="main-indicator-switcher-anchor sub-indicator-switcher-anchor"
          key={`sub-trigger-${pane.index}-${pane.indicatorId}`}
          style={{
            top: `${pane.top + subIndicatorTriggerInsetTopPx}px`,
            left: `${pane.left + subIndicatorTriggerInsetLeftPx}px`,
          }}
        >
          <SubIndicatorTrigger indicatorId={pane.indicatorId} onClick={() => openSubIndicatorSwitch(pane.index)} />
        </div>
      ))}
      <SubIndicatorSwitcherDialog
        onChange={onSubIndicatorsChange}
        openRequest={subSwitchOpenRequest}
        value={subIndicators}
      />
      <div className="kline-chart" ref={containerRef} style={{ height: chartHeight }} />
      <div
        className="trade-overlay-layer"
        style={
          tradeOverlayLayout.pane
            ? {
                left: `${tradeOverlayLayout.pane.left}px`,
                top: `${tradeOverlayLayout.pane.top}px`,
                width: `${tradeOverlayLayout.pane.width}px`,
                height: `${tradeOverlayLayout.pane.height}px`,
              }
            : { display: "none" }
        }
      >
        {replayDayGuide
          ? replayDayGuide.segments.map((segment, index) => (
              <div
                aria-hidden="true"
                className="replay-day-guide-segment"
                key={`replay-day-guide-${index}`}
                style={{
                  left: `${replayDayGuide.x}px`,
                  top: `${segment.top}px`,
                  height: `${segment.height}px`,
                }}
              />
            ))
          : null}

        {tradeOverlayLayout.regions.map((region) => (
          <div
            className={`holding-region ${region.pnlPercent >= 0 ? "profit" : "loss"}`}
            key={region.id}
            style={{ left: `${region.left}px`, width: `${region.width}px` }}
          >
            <span>{formatPercent(region.pnlPercent)}</span>
          </div>
        ))}

        {tradeOverlayLayout.avgCost ? (
          <>
            <div aria-hidden="true" className="avg-cost-line" style={{ top: `${tradeOverlayLayout.avgCost.y}px` }} />
            <div
              aria-hidden={!avgCostLabelVisible}
              className={`avg-cost-label${avgCostLabelVisible ? " is-visible" : ""}`}
              style={{ top: `${tradeOverlayLayout.avgCost.y}px` }}
            >
              {tradeOverlayLayout.avgCost.label}
            </div>
          </>
        ) : null}

        {tradeOverlayLayout.markers.map((marker) => {
          const totalQty = marker.trades.reduce((sum, trade) => sum + trade.quantity, 0);
          const sideLabel = marker.side === "buy" ? "买入" : "卖出";
          const title =
            marker.trades.length > 1
              ? `${sideLabel} ${marker.trades.length} 笔 / 共 ${totalQty.toLocaleString("zh-CN")} 股`
              : `${sideLabel} ${formatPrice(marker.trade.price)} / ${marker.trade.quantity.toLocaleString("zh-CN")} 股`;
          return (
            <div
              className={`trade-marker-wrap ${marker.side}`}
              key={`${marker.side}-${marker.trade.id}`}
              style={{ left: `${marker.x}px`, top: `${marker.y}px` }}
            >
              {marker.side === "sell" ? (
                <>
                  <button
                    aria-label="卖出标记"
                    className="trade-marker-tag sell"
                    onClick={() => setActiveTrades(marker.trades)}
                    title={title}
                    type="button"
                  >
                    S
                  </button>
                  <span aria-hidden="true" className="trade-marker-stem sell" />
                </>
              ) : (
                <>
                  <span aria-hidden="true" className="trade-marker-stem buy" />
                  <button
                    aria-label="买入标记"
                    className="trade-marker-tag buy"
                    onClick={() => setActiveTrades(marker.trades)}
                    title={title}
                    type="button"
                  >
                    B
                  </button>
                </>
              )}
            </div>
          );
        })}

        {tradeOverlayLayout.painPoint ? (
          <div
            className="trade-marker-wrap pain"
            style={{ left: `${tradeOverlayLayout.painPoint.x}px`, top: `${tradeOverlayLayout.painPoint.y}px` }}
            title="最差低点"
          >
            <span aria-hidden="true" className="trade-marker-stem pain" />
            <span aria-label="最差低点" className="trade-marker-tag pain">
              L
            </span>
          </div>
        ) : null}

        {activeTrades && activeTrades.length > 0 ? (
          <div className="trade-note-popover">
            <div className="section-header">
              <h2>
                {activeTrades[0].date} {activeTrades[0].side === "buy" ? "买入" : "卖出"}
                {activeTrades.length > 1 ? ` · ${activeTrades.length} 笔` : ""}
              </h2>
              <button onClick={() => setActiveTrades(null)} type="button">
                关闭
              </button>
            </div>
            {activeTrades.length === 1 ? (
              <>
                <p>
                  {formatPrice(activeTrades[0].price)} / {activeTrades[0].quantity.toLocaleString("zh-CN")} 份
                </p>
                <div>{activeTrades[0].note || "未填写笔记"}</div>
              </>
            ) : (
              <div className="trade-note-popover-list">
                {activeTrades.map((trade) => (
                  <div className="trade-note-popover-item" key={trade.id}>
                    <p>
                      {formatPrice(trade.price)} / {trade.quantity.toLocaleString("zh-CN")} 份
                    </p>
                    <div>{trade.note || "未填写笔记"}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </div>
      {selectedDate ? (
        <div className="replay-label-layer" ref={replayLabelLayerRef}>
          <span aria-label="复盘日" className="trade-marker-tag replay" ref={replayDayLabelRef}>
            R
          </span>
        </div>
      ) : null}
      <div className="crosshair-date-label-layer" ref={crosshairDateLayerRef}>
        <span className="crosshair-range-date is-start" data-role="range-start" />
        <span className="crosshair-date-label" ref={crosshairDateLabelRef} />
        <span className="crosshair-range-date is-end" data-role="range-end" />
      </div>
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

function syncReplayDayOverlay(chart: Chart, _selectedDate?: string) {
  // 复盘日改用 DOM 分段引导线（影线处留空），不再绘制贯穿 K 线的竖线
  chart.removeOverlay({ id: replayDayLineOverlayId });
}

function computeReplayDayGuide(chart: Chart, bars: KLineBar[], selectedDate?: string): ReplayDayGuide | null {
  if (!selectedDate || !bars.length) return null;

  const dataIndex = resolveTradeBarIndex(bars, selectedDate);
  if (dataIndex === undefined) return null;

  const bar = bars[dataIndex];
  if (!bar) return null;

  const paneId = resolveCandlePaneId(chart);
  const mainSize = chart.getSize(paneId, "main");
  if (!mainSize || mainSize.height <= 0) return null;

  const highPoint = convertChartPoint(chart, paneId, dataIndex, bar.high);
  const lowPoint = convertChartPoint(chart, paneId, dataIndex, bar.low);
  if (!highPoint || !lowPoint || !Number.isFinite(highPoint.y) || !Number.isFinite(lowPoint.y)) {
    return null;
  }

  const x = highPoint.x;
  const candleTop = Math.min(highPoint.y, lowPoint.y) - replayDayGuideCandleGapPx;
  const candleBottom = Math.max(highPoint.y, lowPoint.y) + replayDayGuideCandleGapPx;
  const segments: Array<{ top: number; height: number }> = [];

  if (candleTop > 0) {
    segments.push({ top: 0, height: candleTop });
  }
  if (candleBottom < mainSize.height) {
    segments.push({ top: candleBottom, height: mainSize.height - candleBottom });
  }

  if (!segments.length) return null;
  return { x, segments };
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
  label.style.transform = "translateX(-50%)";

  // 与 B/S 一致：贴边时钳制在可视区内，不因越界隐藏
  const labelHalfWidth = (label.offsetWidth || TRADE_MARKER_TAG_W) / 2;
  label.style.left = `${clampLabelCenterLeft(left, mainSize.width, labelHalfWidth)}px`;
}

function updateCrosshairDateLabel(
  chart: Chart,
  labelLayer: HTMLDivElement | null,
  label: HTMLSpanElement | null,
  bars: KLineBar[],
  dataIndex: number | null,
  period: KlinePeriod,
) {
  if (!labelLayer || !label) return;

  const dedicatedBand = resolveDedicatedDateBandRect(chart);
  const rangeStartEl = labelLayer.querySelector<HTMLElement>("[data-role='range-start']");
  const rangeEndEl = labelLayer.querySelector<HTMLElement>("[data-role='range-end']");
  const bar = dataIndex !== null ? bars[dataIndex] : undefined;
  const left = dataIndex !== null ? getBarLabelLeft(chart, dataIndex) : null;

  // 有副图时：常驻白色时间条，副图整体下移，不挡指标
  if (dedicatedBand) {
    labelLayer.style.display = "block";
    labelLayer.style.left = `${dedicatedBand.left}px`;
    labelLayer.style.top = `${dedicatedBand.top}px`;
    labelLayer.style.width = `${dedicatedBand.width}px`;
    labelLayer.style.height = `${dedicatedBand.height}px`;
    labelLayer.style.background = chartPaneBackground;

    const yAxisWidth = chart.getSize(crosshairDateBandPaneId, "yAxis")?.width ?? 0;
    syncVisibleRangeDateLabels(chart, bars, period, rangeStartEl, rangeEndEl, {
      endRightInset: yAxisWidth + 8,
    });

    if (!bar || left === null) {
      label.textContent = "";
      label.style.visibility = "hidden";
      return;
    }

    label.textContent = formatCrosshairBarTime(bar.date, period);
    label.style.visibility = "visible";
    label.style.top = "";
    label.style.transform = "";

    // 贴边时钳制在可视区内，避免最左/最右 K 线时间标签被隐藏
    const paneWidth = dedicatedBand.width - yAxisWidth;
    const labelHalfWidth = label.offsetWidth / 2;
    label.style.left = `${clampLabelCenterLeft(left, paneWidth, labelHalfWidth)}px`;
    return;
  }

  // 无副图时：仅悬停显示时间标签，贴在主图底边
  if (rangeStartEl) rangeStartEl.style.visibility = "hidden";
  if (rangeEndEl) rangeEndEl.style.visibility = "hidden";

  if (!bar || left === null) {
    labelLayer.style.display = "none";
    label.textContent = "";
    label.style.visibility = "hidden";
    return;
  }

  const paneId = resolveCandlePaneId(chart);
  const mainSize = chart.getSize(paneId, "main");
  if (!mainSize) {
    labelLayer.style.display = "none";
    return;
  }

  labelLayer.style.display = "block";
  labelLayer.style.left = `${mainSize.left}px`;
  labelLayer.style.top = `${mainSize.top + mainSize.height - crosshairDateBandHeight}px`;
  labelLayer.style.width = `${mainSize.width}px`;
  labelLayer.style.height = `${crosshairDateBandHeight}px`;
  labelLayer.style.background = "transparent";

  label.textContent = formatCrosshairBarTime(bar.date, period);
  label.style.visibility = "visible";
  label.style.top = "";
  label.style.transform = "";

  const labelHalfWidth = label.offsetWidth / 2;
  label.style.left = `${clampLabelCenterLeft(left, mainSize.width, labelHalfWidth)}px`;
}

function syncVisibleRangeDateLabels(
  chart: Chart,
  bars: KLineBar[],
  period: KlinePeriod,
  startEl: HTMLElement | null,
  endEl: HTMLElement | null,
  layout: { endRightInset: number },
) {
  if (!startEl || !endEl || !bars.length) {
    if (startEl) startEl.style.visibility = "hidden";
    if (endEl) endEl.style.visibility = "hidden";
    return;
  }

  const { fromIndex, toIndex } = resolveVisibleBarIndexRange(chart, bars.length);
  const startBar = bars[fromIndex];
  const endBar = bars[toIndex];
  if (!startBar || !endBar) {
    startEl.style.visibility = "hidden";
    endEl.style.visibility = "hidden";
    return;
  }

  startEl.textContent = formatCrosshairBarTime(startBar.date, period);
  startEl.style.visibility = "visible";
  startEl.style.top = "";

  endEl.textContent = formatCrosshairBarTime(endBar.date, period);
  endEl.style.visibility = "visible";
  endEl.style.top = "";
  endEl.style.right = `${layout.endRightInset}px`;
}

function resolveVisibleBarIndexRange(chart: Chart, barCount: number) {
  const range = chart.getVisibleRange();
  const fromIndex = Math.min(barCount - 1, Math.max(0, Math.floor(range.realFrom)));
  const toIndex = Math.min(barCount - 1, Math.max(fromIndex, Math.ceil(range.realTo) - 1));
  return { fromIndex, toIndex };
}

function resolveDedicatedDateBandRect(chart: Chart) {
  // 优先用整行 root（含右侧 Y 轴区域），避免时间条旁露出默认刻度
  const rootSize = chart.getSize(crosshairDateBandPaneId, "root");
  if (rootSize && rootSize.height > 0) {
    return {
      left: rootSize.left,
      top: rootSize.top,
      width: rootSize.width,
      height: rootSize.height,
    };
  }

  const bandSize = chart.getSize(crosshairDateBandPaneId, "main");
  if (!bandSize || bandSize.height <= 0) return null;

  const yAxisSize = chart.getSize(crosshairDateBandPaneId, "yAxis");
  const width = yAxisSize ? Math.max(bandSize.width, yAxisSize.left + yAxisSize.width - bandSize.left) : bandSize.width;
  return {
    left: bandSize.left,
    top: bandSize.top,
    width,
    height: bandSize.height,
  };
}

function formatCrosshairBarTime(date: string, period: KlinePeriod) {
  if (period === "year") return date.slice(0, 4);
  if (period === "month") return date.slice(0, 7);
  if (period === "quarter") {
    const [year, month] = date.split("-").map(Number);
    return `${year}-Q${Math.ceil(month / 3)}`;
  }
  return date;
}

/** 十字光标时间标签中心点钳制到绘图区内，贴边时贴紧左右，文案仍随 K 线更新 */
function clampLabelCenterLeft(left: number, paneWidth: number, labelHalfWidth: number): number {
  if (paneWidth <= 0) return left;
  if (labelHalfWidth <= 0) {
    return Math.min(Math.max(left, 0), paneWidth);
  }
  const min = labelHalfWidth;
  const max = Math.max(min, paneWidth - labelHalfWidth);
  return Math.min(Math.max(left, min), max);
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

function getBarLabelLeft(chart: Chart, dataIndex: number): number | null {
  const paneId = resolveCandlePaneId(chart);
  const result = chart.convertToPixel({ dataIndex }, { paneId });
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

function buildLastPriceMarkStyle(lastBar?: KLineBar, prevClose?: number) {
  if (!lastBar || prevClose === undefined) {
    return {
      upColor: candleUpColor,
      downColor: candleDownColor,
      noChangeColor: candleNoChangeColor,
    };
  }

  const direction = resolveDirection(lastBar.close - prevClose);
  const markColor = direction === "up" ? candleUpColor : direction === "down" ? candleDownColor : candleNoChangeColor;

  return {
    upColor: lastBar.close >= lastBar.open ? markColor : candleUpColor,
    downColor: lastBar.close < lastBar.open ? markColor : candleDownColor,
    noChangeColor: markColor,
  };
}

function buildChartStyles(
  display: ChartDisplaySettings,
  bars: KLineBar[] = [],
  legendOffsetLeft = mainIndicatorTriggerReservePx,
  subLegendOffsetLeft = subIndicatorTriggerReservePx,
) {
  const lastIndex = bars.length - 1;
  const lastBar = bars[lastIndex];
  const prevClose = bars[lastIndex - 1]?.close ?? lastBar?.open;

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
      priceMark: {
        show: true,
        last: buildLastPriceMarkStyle(lastBar, prevClose),
      },
      tooltip: {
        showRule: "none" as const,
        // 主图叠加指标图例的起点，紧挨切换按钮右侧
        offsetLeft: legendOffsetLeft,
        offsetTop: mainIndicatorTooltipOffsetTop,
        title: {
          show: false,
        },
      },
    },
    indicator: {
      // 与主图 K 线一致：红涨绿跌（覆盖库默认的绿涨红跌）
      ...indicatorRiseFallStyles,
      tooltip: {
        // 副图指标图例起点：与主图同一套「按钮宽 + 间距」口径
        offsetLeft: subLegendOffsetLeft,
        title: {
          marginLeft: 4,
          marginTop: mainIndicatorTooltipTitleMarginTop,
          size: mainIndicatorTooltipTitleSize,
        },
        legend: {
          marginLeft: 6,
          marginTop: mainIndicatorTooltipTitleMarginTop,
          size: mainIndicatorTooltipTitleSize,
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
      vertical: {
        show: display.showCrosshair,
        line: {
          show: true,
          style: "dashed" as const,
          size: 1,
          dashedValue: [4, 3],
          color: "rgba(23, 32, 28, 0.45)",
        },
      },
    },
  };
}

function syncIndicators(
  chart: Chart,
  indicators: IndicatorSettings,
  subSlots: SubIndicatorId[],
  mainIndicator: MainIndicatorState,
  subIndicators: SubIndicatorState,
  paneMetrics: ChartPaneMetrics,
) {
  chart.removeIndicator();
  chart.setPaneOptions({ id: candlePaneId, height: paneMetrics.main, minHeight: paneMetrics.mainMin });
  createMainPaneIndicator(chart, mainIndicator);

  if (subSlots.length) {
    // 主图与副图之间插入空白窗格，专供十字光标时间，避免挡住副图指标
    chart.createIndicator(
      {
        name: "DATE_BAND",
        shortName: "",
        styles: {
          tooltip: { showRule: "none" },
          lastValueMark: { show: false },
        },
      },
      {
        pane: {
          id: crosshairDateBandPaneId,
          height: crosshairDateBandHeight,
          minHeight: crosshairDateBandHeight,
          dragEnabled: false,
        },
        // 空白时间条不需要 Y 轴，否则右侧会出现默认刻度（如 6.0000）
        yAxis: {
          needWidget: false,
          createTicks: () => [],
        },
      },
    );
  }

  subSlots.forEach((id, index) => {
    const pane = {
      id: subPaneId(index),
      height: subPaneHeight(id, paneMetrics),
      minHeight: subPaneMinHeight(id, paneMetrics),
    };
    const calcParams = getSubIndicatorCalcParams(subIndicators.params, id);

    if (id === "VOL") {
      createChartIndicator(
        chart,
        {
          name: "VOL",
          calcParams: calcParams ?? [5, 10, 20],
          shouldFormatBigNumber: true,
        },
        { pane },
      );
      return;
    }

    if (id === "BOLL") {
      createChartIndicator(
        chart,
        {
          name: "BOLL",
          calcParams: calcParams ?? [indicators.maSlow, 2],
          precision: 3,
        },
        { pane },
      );
      return;
    }

    if (id === "ENE") {
      createChartIndicator(
        chart,
        {
          name: "ENE",
          calcParams: calcParams ?? [10, 11, 9],
          precision: 3,
        },
        { pane },
      );
      return;
    }

    if (id === "PVT" || !calcParams) {
      createChartIndicator(chart, id, { pane });
      return;
    }

    createChartIndicator(chart, { name: id, calcParams }, { pane });
  });
}

/** 创建指标时强制挂上红涨绿跌，避免沿用库默认绿涨红跌 */
function createChartIndicator(
  chart: Chart,
  indicator: string | (Record<string, unknown> & { name: string }),
  options?: Parameters<Chart["createIndicator"]>[1],
) {
  if (typeof indicator === "string") {
    return chart.createIndicator({ name: indicator, styles: { ...indicatorRiseFallStyles } }, options);
  }
  const prevStyles = (indicator.styles ?? {}) as Record<string, unknown>;
  return chart.createIndicator(
    {
      ...indicator,
      styles: {
        ...indicatorRiseFallStyles,
        ...prevStyles,
      },
    } as Parameters<Chart["createIndicator"]>[0],
    options,
  );
}

function createMainPaneIndicator(chart: Chart, mainIndicator: MainIndicatorState) {
  const { active, params } = mainIndicator;
  if (active === "none") return;

  const stackOptions = { isStack: true, pane: { id: candlePaneId } } as const;

  if (active === "MA") {
    const lines = getEnabledMaLines(params.MA);
    if (!lines.length) return;
    createChartIndicator(
      chart,
      {
        name: "MA",
        calcParams: lines.map((line) => line.period),
        styles: {
          lines: lines.map((line) => ({ color: line.color })),
        },
      },
      stackOptions,
    );
    return;
  }
  if (active === "BOLL") {
    createChartIndicator(
      chart,
      { name: "BOLL", calcParams: [params.BOLL.period, params.BOLL.multiplier], precision: 3 },
      stackOptions,
    );
    return;
  }
  if (active === "BBI") {
    createChartIndicator(chart, { name: "BBI", calcParams: [...params.BBI.periods], precision: 3 }, stackOptions);
    return;
  }
  if (active === "EXPMA") {
    createChartIndicator(chart, { name: "EXPMA", calcParams: [...params.EXPMA.periods], precision: 3 }, stackOptions);
    return;
  }
  if (active === "ENE") {
    createChartIndicator(
      chart,
      {
        name: "ENE",
        calcParams: [params.ENE.period, params.ENE.upperPercent, params.ENE.lowerPercent],
        precision: 3,
      },
      stackOptions,
    );
    return;
  }
  createChartIndicator(
    chart,
    { name: "DKX", calcParams: [params.DKX.midPeriod, params.DKX.maPeriod], precision: 3 },
    stackOptions,
  );
}

function getChartHeight(subSlots: SubIndicatorId[], paneMetrics: ChartPaneMetrics) {
  return (
    paneMetrics.main +
    xAxisHeight +
    (subSlots.length ? crosshairDateBandHeight : 0) +
    subSlots.reduce((sum, id) => sum + subPaneHeight(id, paneMetrics), 0)
  );
}

function computeSubPaneLayouts(chart: Chart, subSlots: SubIndicatorId[]): SubPaneLayout[] {
  return subSlots.flatMap((indicatorId, index) => {
    const size = chart.getSize(subPaneId(index), "main");
    if (!size) return [];
    return [
      {
        index,
        indicatorId,
        left: size.left,
        top: size.top,
        width: size.width,
        height: size.height,
      },
    ];
  });
}

function round(value: number) {
  return Number(value.toFixed(2));
}

function buildTradeOverlaySpec(
  bars: KLineBar[],
  trades: TradeRecord[],
  avgCost?: number | null,
  painPoint?: { date?: string; price?: number },
): TradeOverlaySpec {
  if (!bars.length) {
    return { markers: [], regions: [] };
  }

  const indexedTrades = trades
    .map((trade) => ({ trade, index: resolveTradeBarIndex(bars, trade.date) }))
    .filter((item): item is { trade: TradeRecord; index: number } => item.index !== undefined)
    .sort((a, b) => a.index - b.index || Number(a.trade.id) - Number(b.trade.id));

  // S 锚点取当日最高，B 锚点取当日最低；同日同向只保留一个标记
  const markerMap = new Map<string, { trade: TradeRecord; trades: TradeRecord[]; dataIndex: number; anchorPrice: number }>();
  for (const { trade, index } of indexedTrades) {
    const key = `${index}:${trade.side}`;
    const existing = markerMap.get(key);
    if (existing) {
      existing.trades.push(trade);
      continue;
    }
    const bar = bars[index];
    markerMap.set(key, {
      trade,
      trades: [trade],
      dataIndex: index,
      anchorPrice: trade.side === "buy" ? bar.low : bar.high,
    });
  }
  const markers = [...markerMap.values()];

  const regions = buildHoldingRegions(indexedTrades, bars);
  const painIndex = painPoint?.date ? resolveTradeBarIndex(bars, painPoint.date) : undefined;
  const resolvedAvgCost =
    avgCost != null && Number.isFinite(avgCost) && avgCost > 0 ? avgCost : undefined;

  return {
    markers,
    regions,
    avgCost: resolvedAvgCost,
    painPoint:
      painIndex !== undefined && painPoint?.price !== undefined
        ? { dataIndex: painIndex, price: painPoint.price }
        : undefined,
  };
}

function resolveTradeBarIndex(bars: KLineBar[], date: string) {
  const exactIndex = bars.findIndex((bar) => bar.date === date);
  if (exactIndex >= 0) return exactIndex;
  const fallbackIndex = findBarIndexByDate(bars, date);
  return fallbackIndex >= 0 && fallbackIndex < bars.length ? fallbackIndex : undefined;
}

function computeTradeOverlayLayout(chart: Chart, spec: TradeOverlaySpec): TradeOverlayLayout {
  const paneId = resolveCandlePaneId(chart);
  const mainSize = chart.getSize(paneId, "main");
  if (!mainSize) {
    return emptyTradeOverlayLayout;
  }

  const pane = {
    left: mainSize.left,
    top: mainSize.top,
    width: mainSize.width,
    height: mainSize.height,
  };

  const buyDays = new Set(
    spec.markers.filter((marker) => marker.trade.side === "buy").map((marker) => marker.dataIndex),
  );
  const markers = spec.markers
    .map((marker) => {
      const point = convertChartPoint(chart, paneId, marker.dataIndex, marker.anchorPrice);
      if (!point || !Number.isFinite(point.y)) return null;

      const side = marker.trade.side;
      // S 在 K 线上方，B 在下方；同日同向仅一个标记，不再堆叠
      let y = side === "sell" ? point.y - TRADE_MARKER_STEM_H - TRADE_MARKER_TAG_H : point.y;
      const maxY = Math.max(0, pane.height - TRADE_MARKER_TAG_H - TRADE_MARKER_STEM_H);
      y = Math.min(Math.max(0, y), maxY);

      return {
        trade: marker.trade,
        trades: marker.trades,
        x: point.x,
        y,
        side,
      };
    })
    .filter(
      (item): item is { trade: TradeRecord; trades: TradeRecord[]; x: number; y: number; side: "buy" | "sell" } =>
        item !== null,
    );

  const regions = spec.regions
    .map((region) => {
      const start = convertChartPoint(chart, paneId, region.startIndex);
      const end = convertChartPoint(chart, paneId, region.endIndex);
      if (!start || !end) return null;
      const left = Math.min(start.x, end.x);
      const right = Math.max(start.x, end.x);
      const width = Math.max(right - left, 2);
      return {
        id: region.id,
        left,
        width,
        pnlPercent: region.pnlPercent,
      };
    })
    .filter((item): item is { id: string; left: number; width: number; pnlPercent: number } => item !== null);

  let avgCostLayout: { y: number; label: string } | null = null;
  if (spec.avgCost != null) {
    // 取可见区间中点换算 y，保证与当前价格轴刻度对齐
    const dataList = chart.getDataList();
    const midIndex = dataList.length ? Math.floor(dataList.length / 2) : 0;
    const point = convertChartPoint(chart, paneId, midIndex, spec.avgCost);
    if (point && Number.isFinite(point.y)) {
      avgCostLayout = {
        y: Math.min(Math.max(0, point.y), pane.height),
        label: `平均成本：${formatPrice(spec.avgCost)}`,
      };
    }
  }

  let painLayout: { x: number; y: number } | null = null;
  if (spec.painPoint) {
    const point = convertChartPoint(chart, paneId, spec.painPoint.dataIndex, spec.painPoint.price);
    if (point) {
      // 与同日 B 错开：有 B 时 L 下移一格
      const hasBuy = buyDays.has(spec.painPoint.dataIndex);
      let baseY = point.y;
      if (hasBuy) {
        const firstBuy = spec.markers.find(
          (marker) => marker.dataIndex === spec.painPoint!.dataIndex && marker.trade.side === "buy",
        );
        const buyPoint = firstBuy
          ? convertChartPoint(chart, paneId, firstBuy.dataIndex, firstBuy.anchorPrice)
          : null;
        if (buyPoint && Number.isFinite(buyPoint.y)) {
          baseY = buyPoint.y;
        }
      }
      let y = baseY + (hasBuy ? TRADE_MARKER_TAG_H + TRADE_MARKER_STACK_GAP : 0);
      const maxY = Math.max(0, pane.height - TRADE_MARKER_TAG_H - TRADE_MARKER_STEM_H);
      y = Math.min(Math.max(0, y), maxY);
      painLayout = { x: point.x, y };
    }
  }

  return { pane, markers, regions, avgCost: avgCostLayout, painPoint: painLayout };
}

function convertChartPoint(chart: Chart, paneId: string, dataIndex: number, value?: number) {
  const dataList = chart.getDataList();
  if (dataIndex < 0 || dataIndex >= dataList.length) return null;

  const point: { dataIndex: number; timestamp: number; value?: number } = {
    dataIndex,
    timestamp: dataList[dataIndex].timestamp,
  };
  if (value !== undefined) {
    point.value = value;
  }

  const result = chart.convertToPixel(point, { paneId });
  const coord = (Array.isArray(result) ? result[0] : result) as { x?: number; y?: number };
  if (coord.x === undefined || !Number.isFinite(coord.x)) {
    return null;
  }

  return {
    x: coord.x,
    y: coord.y !== undefined && Number.isFinite(coord.y) ? coord.y : 0,
  };
}

function buildHoldingRegions(indexedTrades: Array<{ trade: TradeRecord; index: number }>, bars: KLineBar[]) {
  const lots: Array<{ trade: TradeRecord; index: number; remaining: number; unitCost: number }> = [];
  const regions: Array<{ id: string; startIndex: number; endIndex: number; pnlPercent: number }> = [];

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
      regions.push(makeRegion(lot.trade, lot.index, trade, index, lot.unitCost));
      lot.remaining -= matched;
      remainingSell -= matched;
    }
  }

  const lastIndex = bars.length - 1;
  const lastLow = bars[lastIndex]?.low ?? 0;
  for (const lot of lots) {
    if (lot.remaining <= 0) continue;
    const openPnlPercent = ((lastLow - lot.unitCost) / lot.unitCost) * 100;
    regions.push(makeOpenRegion(lot.trade, lot.index, lastIndex, openPnlPercent));
  }

  return regions;
}

function makeRegion(
  buyTrade: TradeRecord,
  buyIndex: number,
  sellTrade: TradeRecord,
  sellIndex: number,
  unitCost: number,
) {
  const pnlPercent = ((sellTrade.price - unitCost) / unitCost) * 100;
  return {
    id: `${buyTrade.id}-${sellTrade.id}`,
    startIndex: buyIndex,
    endIndex: sellIndex,
    pnlPercent,
  };
}

function makeOpenRegion(buyTrade: TradeRecord, buyIndex: number, endIndex: number, pnlPercent: number) {
  return {
    id: `${buyTrade.id}-open`,
    startIndex: buyIndex,
    endIndex,
    pnlPercent,
  };
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
