import { useEffect, useRef, useState, type FormEvent } from "react";
import { RefreshCcw, Settings } from "lucide-react";
import { AppSelect } from "../../components/AppSelect";
import { KLINE_PERIOD_OPTIONS } from "./aggregateKlines";
import { ReplayDatePicker } from "./ReplayDatePicker";
import type { ChartDisplaySettings, IndicatorSettings, KlinePeriod } from "./types";

type Props = {
  klinePeriod: KlinePeriod;
  disabled?: boolean;
  displaySettings: ChartDisplaySettings;
  indicators: IndicatorSettings;
  replayDate: string;
  availableDates: string[];
  onPeriodChange: (period: KlinePeriod) => void;
  onReplayDateChange: (date: string) => void;
  onReplayDateSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onDisplaySettingsChange: <K extends keyof ChartDisplaySettings>(key: K, value: ChartDisplaySettings[K]) => void;
  onIndicatorChange: <K extends keyof IndicatorSettings>(key: K, value: IndicatorSettings[K]) => void;
  onResetIndicators: () => void;
};

export function ChartToolbar({
  klinePeriod,
  disabled = false,
  displaySettings,
  indicators,
  replayDate,
  availableDates,
  onPeriodChange,
  onReplayDateChange,
  onReplayDateSubmit,
  onDisplaySettingsChange,
  onIndicatorChange,
  onResetIndicators,
}: Props) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!settingsOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!settingsRef.current?.contains(event.target as Node)) {
        setSettingsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSettingsOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [settingsOpen]);

  return (
    <div className="chart-toolbar-pro">
      <div className="chart-toolbar-leading">
        <div className="chart-period-tabs" role="tablist" aria-label="K 线周期">
          {KLINE_PERIOD_OPTIONS.map((option) => {
            const active = klinePeriod === option.value;
            return (
              <button
                key={option.value}
                aria-selected={active}
                className={`chart-period-tab${active ? " active" : ""}`}
                disabled={disabled}
                onClick={() => onPeriodChange(option.value)}
                role="tab"
                type="button"
              >
                {option.label}
              </button>
            );
          })}
        </div>

        <div className="chart-settings-anchor" ref={settingsRef}>
          <button
            aria-expanded={settingsOpen}
            aria-label="图表设置"
            className="chart-settings-trigger"
            onClick={() => setSettingsOpen((open) => !open)}
            type="button"
          >
            <Settings aria-hidden="true" size={18} strokeWidth={2} />
          </button>

          {settingsOpen ? (
            <div className="chart-settings-popover" role="dialog" aria-label="图表设置">
              <div className="chart-settings-popover-header">
                <p className="chart-settings-title">图表设置</p>
                <button className="chart-settings-reset" onClick={onResetIndicators} type="button">
                  <RefreshCcw aria-hidden="true" size={13} strokeWidth={2} />
                  重置
                </button>
              </div>

              <label className="chart-settings-field">
                <span>副图数量</span>
                <AppSelect
                  onChange={(value) => onDisplaySettingsChange("subChartCount", Number(value))}
                  options={[0, 1, 2, 3, 4].map((count) => ({
                    label: String(count),
                    value: count,
                  }))}
                  value={displaySettings.subChartCount}
                />
              </label>

              <SettingToggle
                checked={displaySettings.showVolume}
                label="显示成交量"
                onChange={(checked) => onDisplaySettingsChange("showVolume", checked)}
              />
              <SettingToggle
                checked={displaySettings.showGrid}
                label="网格线"
                onChange={(checked) => onDisplaySettingsChange("showGrid", checked)}
              />
              <SettingToggle
                checked={displaySettings.showCrosshair}
                label="十字光标"
                onChange={(checked) => onDisplaySettingsChange("showCrosshair", checked)}
              />

              <div className="chart-settings-divider" />

              <p className="chart-settings-subtitle">指标设置</p>

              <div className="chart-settings-ma-grid">
                <label className="chart-settings-ma-field">
                  <span>MA1</span>
                  <input
                    max={250}
                    min={2}
                    onChange={(event) => onIndicatorChange("maFast", Number(event.target.value))}
                    type="number"
                    value={indicators.maFast}
                  />
                </label>
                <label className="chart-settings-ma-field">
                  <span>MA2</span>
                  <input
                    max={250}
                    min={2}
                    onChange={(event) => onIndicatorChange("maMid", Number(event.target.value))}
                    type="number"
                    value={indicators.maMid}
                  />
                </label>
                <label className="chart-settings-ma-field">
                  <span>MA3</span>
                  <input
                    max={250}
                    min={2}
                    onChange={(event) => onIndicatorChange("maSlow", Number(event.target.value))}
                    type="number"
                    value={indicators.maSlow}
                  />
                </label>
              </div>

              <SettingToggle checked={indicators.showMa} label="MA" onChange={(checked) => onIndicatorChange("showMa", checked)} />
              <SettingToggle checked={indicators.showBoll} label="BOLL" onChange={(checked) => onIndicatorChange("showBoll", checked)} />
              <SettingToggle checked={indicators.showKdj} label="KDJ" onChange={(checked) => onIndicatorChange("showKdj", checked)} />
              <SettingToggle checked={indicators.showMacd} label="MACD" onChange={(checked) => onIndicatorChange("showMacd", checked)} />
            </div>
          ) : null}
        </div>
      </div>

      <div className="chart-toolbar-actions">
        <form className="jump-date-form chart-toolbar-jump" onSubmit={onReplayDateSubmit}>
          <ReplayDatePicker
            availableDates={availableDates}
            disabled={disabled}
            onChange={onReplayDateChange}
            value={replayDate}
          />
          <button disabled={disabled || !replayDate} type="submit">
            跳转
          </button>
        </form>
      </div>
    </div>
  );
}

function SettingToggle({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="chart-settings-toggle">
      <span>{label}</span>
      <input checked={checked} onChange={(event) => onChange(event.target.checked)} type="checkbox" />
    </label>
  );
}
