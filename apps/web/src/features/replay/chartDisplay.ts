import type { ChartDisplaySettings, IndicatorSettings } from "./types";

export const defaultChartDisplaySettings: ChartDisplaySettings = {
  subChartCount: 3,
  showVolume: true,
  showGrid: true,
  showCrosshair: true,
};

export type EffectiveSubCharts = Pick<IndicatorSettings, "showVolume" | "showBoll" | "showKdj" | "showMacd">;

export function resolveEffectiveSubCharts(
  display: ChartDisplaySettings,
  indicators: IndicatorSettings,
): EffectiveSubCharts {
  const candidates: Array<{ key: keyof EffectiveSubCharts; enabled: boolean }> = [
    { key: "showVolume", enabled: display.showVolume },
    { key: "showBoll", enabled: indicators.showBoll },
    { key: "showKdj", enabled: indicators.showKdj },
    { key: "showMacd", enabled: indicators.showMacd },
  ];

  const selected = new Set(
    candidates
      .filter((item) => item.enabled)
      .slice(0, Math.max(0, Math.min(4, display.subChartCount)))
      .map((item) => item.key),
  );

  return {
    showVolume: selected.has("showVolume"),
    showBoll: selected.has("showBoll"),
    showKdj: selected.has("showKdj"),
    showMacd: selected.has("showMacd"),
  };
}
