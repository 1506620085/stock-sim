import { useEffect, useMemo, useRef } from "react";
import { dispose, init, type Chart, type KLineData } from "klinecharts";
import type { IndicatorSettings, KLineBar } from "./types";

type Props = {
  bars: KLineBar[];
  code: string;
  indicators: IndicatorSettings;
  selectedDate?: string;
};

const candlePaneId = "candle_pane";
const indicatorPaneIds = ["volume-pane", "kdj-pane", "macd-pane"];
const mainPaneHeight = 360;
const volumePaneHeight = 118;
const oscillatorPaneHeight = 126;
const xAxisHeight = 36;

export function KLineChartPanel({ bars, code, indicators, selectedDate }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<Chart | null>(null);

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
