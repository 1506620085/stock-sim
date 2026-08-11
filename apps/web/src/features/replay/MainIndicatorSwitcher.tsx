/**
 * MainIndicatorSwitcher
 * 主图指标切换：左上角「MA▼」按钮、指标选择模态框、参数设置对话框。
 */
import { useEffect, useState, type Dispatch, type MouseEvent, type SetStateAction } from "react";
import { ColorPicker } from "antd";
import type { Color } from "antd/es/color-picker";
import { Settings } from "lucide-react";
import { AppDialogShell } from "../../components/AppDialog";
import { AppSwitch } from "../../components/AppSwitch";
import {
  BBI_PERIOD_MAX,
  BBI_PERIOD_MIN,
  BOLL_PERIOD_MAX,
  BOLL_PERIOD_MIN,
  DKX_MA_PERIOD_MAX,
  DKX_MA_PERIOD_MIN,
  ENE_BAND_MAX,
  ENE_BAND_MIN,
  ENE_PERIOD_MAX,
  ENE_PERIOD_MIN,
  EXPMA_PERIOD_MAX,
  EXPMA_PERIOD_MIN,
  MAIN_INDICATOR_OPTIONS,
  MA_PERIOD_MAX,
  MA_PERIOD_MIN,
  defaultMainIndicatorParams,
  mainIndicatorShortName,
  type MaLineConfig,
  type MainIndicatorId,
  type MainIndicatorParams,
  type MainIndicatorState,
} from "./mainIndicators";

type Props = {
  value: MainIndicatorState;
  onChange: (next: MainIndicatorState) => void;
};

export function MainIndicatorSwitcher({ value, onChange }: Props) {
  const [switchOpen, setSwitchOpen] = useState(false);
  const [paramsTarget, setParamsTarget] = useState<Exclude<MainIndicatorId, "none"> | null>(null);
  const [draftParams, setDraftParams] = useState<MainIndicatorParams>(() => structuredClone(value.params));

  useEffect(() => {
    if (!paramsTarget) return;
    setDraftParams(structuredClone(value.params));
  }, [paramsTarget, value.params]);

  function selectIndicator(id: MainIndicatorId) {
    onChange({ ...value, active: id });
    setSwitchOpen(false);
  }

  function openParams(event: MouseEvent, id: Exclude<MainIndicatorId, "none">) {
    event.stopPropagation();
    setSwitchOpen(false);
    setParamsTarget(id);
  }

  function restoreDefaults() {
    if (!paramsTarget) return;
    setDraftParams((prev) => ({
      ...prev,
      [paramsTarget]: structuredClone(defaultMainIndicatorParams[paramsTarget]),
    }));
  }

  function saveParams() {
    if (!paramsTarget) return;
    const nextParams = structuredClone(draftParams);
    if (paramsTarget === "BOLL") {
      const period = Number(nextParams.BOLL.period);
      nextParams.BOLL.period = Number.isFinite(period)
        ? Math.min(BOLL_PERIOD_MAX, Math.max(BOLL_PERIOD_MIN, Math.round(period)))
        : defaultMainIndicatorParams.BOLL.period;
    }
    if (paramsTarget === "BBI") {
      nextParams.BBI.periods = nextParams.BBI.periods.map((period, index) => {
        const n = Number(period);
        return Number.isFinite(n)
          ? Math.min(BBI_PERIOD_MAX, Math.max(BBI_PERIOD_MIN, Math.round(n)))
          : defaultMainIndicatorParams.BBI.periods[index];
      }) as [number, number, number, number];
    }
    if (paramsTarget === "EXPMA") {
      nextParams.EXPMA.periods = nextParams.EXPMA.periods.map((period, index) => {
        const n = Number(period);
        return Number.isFinite(n)
          ? Math.min(EXPMA_PERIOD_MAX, Math.max(EXPMA_PERIOD_MIN, Math.round(n)))
          : defaultMainIndicatorParams.EXPMA.periods[index];
      }) as [number, number];
    }
    if (paramsTarget === "ENE") {
      const clampEne = (value: number, min: number, max: number, fallback: number) =>
        Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;
      nextParams.ENE = {
        upperPercent: clampEne(
          Number(nextParams.ENE.upperPercent),
          ENE_BAND_MIN,
          ENE_BAND_MAX,
          defaultMainIndicatorParams.ENE.upperPercent,
        ),
        period: clampEne(
          Number(nextParams.ENE.period),
          ENE_PERIOD_MIN,
          ENE_PERIOD_MAX,
          defaultMainIndicatorParams.ENE.period,
        ),
        lowerPercent: clampEne(
          Number(nextParams.ENE.lowerPercent),
          ENE_BAND_MIN,
          ENE_BAND_MAX,
          defaultMainIndicatorParams.ENE.lowerPercent,
        ),
      };
    }
    if (paramsTarget === "DKX") {
      const maPeriod = Number(nextParams.DKX.maPeriod);
      nextParams.DKX.maPeriod = Number.isFinite(maPeriod)
        ? Math.min(DKX_MA_PERIOD_MAX, Math.max(DKX_MA_PERIOD_MIN, Math.round(maPeriod)))
        : defaultMainIndicatorParams.DKX.maPeriod;
    }
    onChange({
      ...value,
      params: nextParams,
    });
    setParamsTarget(null);
  }

  const triggerLabel = `${mainIndicatorShortName(value.active)}▼`;
  const isMaParams = paramsTarget === "MA";
  const isBollParams = paramsTarget === "BOLL";
  const isBbiParams = paramsTarget === "BBI";
  const isExpmaParams = paramsTarget === "EXPMA";
  const isEneParams = paramsTarget === "ENE";
  const isDkxParams = paramsTarget === "DKX";
  const isSheetParams = isBollParams || isBbiParams || isExpmaParams || isEneParams || isDkxParams;
  const paramsTitle = paramsTarget
    ? isMaParams
      ? "主图MA参数设置"
      : isBollParams
        ? "BOLL参数设置"
        : isBbiParams
          ? "BBI参数设置"
          : isExpmaParams
            ? "EXPMA参数设置"
            : isEneParams
              ? "ENE参数设置"
              : isDkxParams
                ? "主图DKX参数设置"
                : `${MAIN_INDICATOR_OPTIONS.find((item) => item.id === paramsTarget)?.name ?? ""}参数`
    : "参数设置";

  return (
    <>
      <button
        aria-expanded={switchOpen}
        aria-haspopup="dialog"
        aria-label="切换主图指标"
        className="main-indicator-trigger"
        onClick={() => setSwitchOpen(true)}
        type="button"
      >
        {triggerLabel}
      </button>

      <AppDialogShell
        className="main-indicator-switch-dialog"
        closeOnBackdrop={false}
        onClose={() => setSwitchOpen(false)}
        open={switchOpen}
        showCloseButton
        title="指标切换"
      >
        <div className="main-indicator-grid" role="listbox" aria-label="主图指标">
          {MAIN_INDICATOR_OPTIONS.map((option) => {
            const active = value.active === option.id;
            return (
              <div className={`main-indicator-option${active ? " active" : ""}`} key={option.id}>
                <button
                  aria-selected={active}
                  className="main-indicator-option-main"
                  onClick={() => selectIndicator(option.id)}
                  role="option"
                  type="button"
                >
                  <span className="main-indicator-option-name">{option.name}</span>
                  <span className="main-indicator-option-code">{option.shortName}</span>
                </button>
                {option.id !== "none" ? (
                  <button
                    aria-label={`${option.name}参数设置`}
                    className="main-indicator-option-gear"
                    onClick={(event) => openParams(event, option.id as Exclude<MainIndicatorId, "none">)}
                    type="button"
                  >
                    <Settings aria-hidden="true" size={15} strokeWidth={2} />
                  </button>
                ) : (
                  <span className="main-indicator-option-gear-spacer" />
                )}
              </div>
            );
          })}
        </div>
      </AppDialogShell>

      <AppDialogShell
        className={`main-indicator-params-dialog${isMaParams ? " is-ma" : ""}${isSheetParams ? " is-sheet" : ""}`}
        headerActions={
          isSheetParams ? (
            <button className="ma-params-restore" onClick={restoreDefaults} type="button">
              恢复默认
            </button>
          ) : undefined
        }
        onClose={() => setParamsTarget(null)}
        open={Boolean(paramsTarget)}
        title={paramsTitle}
      >
        {paramsTarget ? (
          <>
            {isMaParams ? (
              <div className="ma-params-toolbar">
                <span className="ma-params-toolbar-hint">
                  均线设置（范围：{MA_PERIOD_MIN} ~ {MA_PERIOD_MAX}）
                </span>
                <button className="ma-params-restore" onClick={restoreDefaults} type="button">
                  恢复默认设置
                </button>
              </div>
            ) : null}
            <div
              className={`main-indicator-params-form${isMaParams ? " is-ma" : ""}${isSheetParams ? " is-sheet" : ""}`}
            >
              {renderParamsFields(paramsTarget, draftParams, setDraftParams)}
            </div>
            <div
              className={`app-dialog-actions main-indicator-params-actions${isSheetParams || isMaParams ? " is-sheet" : ""}`}
            >
              {!isMaParams && !isSheetParams ? (
                <button className="secondary-button" onClick={restoreDefaults} type="button">
                  恢复默认
                </button>
              ) : null}
              {!isSheetParams && !isMaParams ? (
                <button className="secondary-button" onClick={() => setParamsTarget(null)} type="button">
                  取消
                </button>
              ) : null}
              <button
                className={isSheetParams || isMaParams ? "indicator-params-save" : "primary-button"}
                onClick={saveParams}
                type="button"
              >
                {isSheetParams || isMaParams ? "保存设置" : "保存"}
              </button>
            </div>
          </>
        ) : null}
      </AppDialogShell>
    </>
  );
}

function renderParamsFields(
  id: Exclude<MainIndicatorId, "none">,
  params: MainIndicatorParams,
  setParams: Dispatch<SetStateAction<MainIndicatorParams>>,
) {
  if (id === "MA") {
    return (
      <div className="ma-line-list">
        {params.MA.lines.map((line, index) => (
          <MaLineRow
            key={`ma-${index}`}
            line={line}
            onChange={(next) => {
              setParams((prev) => {
                const lines = [...prev.MA.lines];
                lines[index] = next;
                return { ...prev, MA: { lines } };
              });
            }}
          />
        ))}
      </div>
    );
  }

  if (id === "BOLL") {
    const period = params.BOLL.period;
    return (
      <div className="indicator-params-panel">
        <div className="indicator-param-row">
          <span className="indicator-param-label">布林线</span>
          <input
            aria-label="布林线周期"
            className="indicator-param-period"
            max={BOLL_PERIOD_MAX}
            min={BOLL_PERIOD_MIN}
            onChange={(event) =>
              setParams((prev) => ({
                ...prev,
                BOLL: { ...prev.BOLL, period: Number(event.target.value) },
              }))
            }
            type="number"
            value={period}
          />
          <span className="indicator-param-unit">日</span>
          <span className="indicator-param-range">
            范围：{BOLL_PERIOD_MIN} ~ {BOLL_PERIOD_MAX}
          </span>
        </div>
        <p className="indicator-param-hint">
          设置说明：BOLL（{Number.isFinite(period) ? period : "—"}）中的
          {Number.isFinite(period) ? period : "—"}
          代表布林线的参数
        </p>
      </div>
    );
  }

  if (id === "BBI") {
    const periods = params.BBI.periods;
    const periodText = periods.map((period) => (Number.isFinite(period) ? String(period) : "—")).join(", ");
    return (
      <div className="indicator-params-panel">
        {periods.map((period, index) => (
          <div className="indicator-param-row" key={`bbi-${index}`}>
            <span className="indicator-param-label">BBI多空指标</span>
            <input
              aria-label={`BBI周期${index + 1}`}
              className="indicator-param-period"
              max={BBI_PERIOD_MAX}
              min={BBI_PERIOD_MIN}
              onChange={(event) => {
                const next = [...params.BBI.periods] as [number, number, number, number];
                next[index] = Number(event.target.value);
                setParams((prev) => ({ ...prev, BBI: { periods: next } }));
              }}
              type="number"
              value={period}
            />
            <span className="indicator-param-unit">日</span>
            <span className="indicator-param-range">
              范围：{BBI_PERIOD_MIN} ~ {BBI_PERIOD_MAX}
            </span>
          </div>
        ))}
        <p className="indicator-param-hint">
          设置说明：BBI多空指标中的{periodText}
          分别代表计算BBI数值所需用到的不同日期的简单移动平均线的参数
        </p>
      </div>
    );
  }

  if (id === "EXPMA") {
    const labels = ["短期指数平均线", "长期指数平均线"] as const;
    return (
      <div className="indicator-params-panel">
        {params.EXPMA.periods.map((period, index) => (
          <div className="indicator-param-row" key={`expma-${index}`}>
            <span className="indicator-param-label">{labels[index]}</span>
            <input
              aria-label={labels[index]}
              className="indicator-param-period"
              max={EXPMA_PERIOD_MAX}
              min={EXPMA_PERIOD_MIN}
              onChange={(event) => {
                const next = [...params.EXPMA.periods] as [number, number];
                next[index] = Number(event.target.value);
                setParams((prev) => ({ ...prev, EXPMA: { periods: next } }));
              }}
              type="number"
              value={period}
            />
            <span className="indicator-param-unit">日</span>
            <span className="indicator-param-range">
              范围：{EXPMA_PERIOD_MIN} ~ {EXPMA_PERIOD_MAX}
            </span>
          </div>
        ))}
        <p className="indicator-param-hint">设置说明：参数代表计算指数平均线的天数</p>
      </div>
    );
  }

  if (id === "ENE") {
    const { upperPercent, period, lowerPercent } = params.ENE;
    const fmt = (value: number) => (Number.isFinite(value) ? String(value) : "—");
    return (
      <div className="indicator-params-panel">
        <div className="indicator-param-row">
          <span className="indicator-param-label">上轨线 (UPPER)</span>
          <input
            aria-label="上轨线"
            className="indicator-param-period"
            max={ENE_BAND_MAX}
            min={ENE_BAND_MIN}
            onChange={(event) =>
              setParams((prev) => ({
                ...prev,
                ENE: { ...prev.ENE, upperPercent: Number(event.target.value) },
              }))
            }
            type="number"
            value={upperPercent}
          />
          <span className="indicator-param-unit">%</span>
          <span className="indicator-param-range">
            范围：{ENE_BAND_MIN} ~ {ENE_BAND_MAX}
          </span>
        </div>
        <div className="indicator-param-row">
          <span className="indicator-param-label">日移动平均线</span>
          <input
            aria-label="日移动平均线"
            className="indicator-param-period"
            max={ENE_PERIOD_MAX}
            min={ENE_PERIOD_MIN}
            onChange={(event) =>
              setParams((prev) => ({
                ...prev,
                ENE: { ...prev.ENE, period: Number(event.target.value) },
              }))
            }
            type="number"
            value={period}
          />
          <span className="indicator-param-unit">日</span>
          <span className="indicator-param-range">
            范围：{ENE_PERIOD_MIN} ~ {ENE_PERIOD_MAX}
          </span>
        </div>
        <div className="indicator-param-row">
          <span className="indicator-param-label">下轨线 (LOWER)</span>
          <input
            aria-label="下轨线"
            className="indicator-param-period"
            max={ENE_BAND_MAX}
            min={ENE_BAND_MIN}
            onChange={(event) =>
              setParams((prev) => ({
                ...prev,
                ENE: { ...prev.ENE, lowerPercent: Number(event.target.value) },
              }))
            }
            type="number"
            value={lowerPercent}
          />
          <span className="indicator-param-unit">%</span>
          <span className="indicator-param-range">
            范围：{ENE_BAND_MIN} ~ {ENE_BAND_MAX}
          </span>
        </div>
        <p className="indicator-param-hint">
          设置说明：ENE ({fmt(upperPercent)}, {fmt(period)}, {fmt(lowerPercent)}) 中的
          {fmt(upperPercent)}、{fmt(period)}、{fmt(lowerPercent)}
          分别代表上轨线UPPER、中轨线ENE移动平均线、下轨线LOWER的参数
        </p>
      </div>
    );
  }

  return (
    <div className="indicator-params-panel">
      <div className="indicator-param-row">
        <span className="indicator-param-label">日均线</span>
        <input
          aria-label="DKX日均线"
          className="indicator-param-period"
          max={DKX_MA_PERIOD_MAX}
          min={DKX_MA_PERIOD_MIN}
          onChange={(event) =>
            setParams((prev) => ({
              ...prev,
              DKX: { ...prev.DKX, maPeriod: Number(event.target.value) },
            }))
          }
          type="number"
          value={params.DKX.maPeriod}
        />
        <span className="indicator-param-unit">日</span>
        <span className="indicator-param-range">
          范围：{DKX_MA_PERIOD_MIN} ~ {DKX_MA_PERIOD_MAX}
        </span>
      </div>
      <p className="indicator-param-hint">设置说明：参数代表计算移动平均线的天数</p>
    </div>
  );
}

function MaLineRow({ line, onChange }: { line: MaLineConfig; onChange: (next: MaLineConfig) => void }) {
  return (
    <div className={`ma-line-row${line.enabled ? "" : " is-disabled"}`}>
      <input
        aria-label="均线周期"
        className="ma-line-period"
        disabled={!line.enabled}
        max={MA_PERIOD_MAX}
        min={MA_PERIOD_MIN}
        onChange={(event) => onChange({ ...line, period: Number(event.target.value) })}
        type="number"
        value={line.period}
      />
      <span className="ma-line-label">日均线</span>
      <MaColorPicker
        disabled={!line.enabled}
        onChange={(color) => onChange({ ...line, color })}
        value={line.color}
      />
      <AppSwitch
        aria-label="开启均线"
        checked={line.enabled}
        onChange={(checked) => onChange({ ...line, enabled: checked })}
      />
    </div>
  );
}

function MaColorPicker({
  value,
  disabled = false,
  onChange,
}: {
  value: string;
  disabled?: boolean;
  onChange: (hex: string) => void;
}) {
  return (
    <ColorPicker
      arrow={false}
      className="ma-line-color-picker"
      classNames={{ popup: { root: "ma-color-picker-popup" } }}
      defaultFormat="hex"
      disabled={disabled}
      disabledAlpha
      getPopupContainer={() => document.body}
      onChange={(color: Color) => onChange(color.toHexString().toUpperCase())}
      placement="bottomLeft"
      size="small"
      value={value}
    >
      <button aria-label="均线颜色" className="ma-line-color" disabled={disabled} type="button">
        <span aria-hidden="true" className="ma-line-color-swatch" style={{ background: value }} />
      </button>
    </ColorPicker>
  );
}
