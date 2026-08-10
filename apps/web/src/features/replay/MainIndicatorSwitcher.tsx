/**
 * MainIndicatorSwitcher
 * 主图指标切换：左上角「MA▼」按钮、指标选择模态框、参数设置对话框。
 */
import { useEffect, useState, type Dispatch, type MouseEvent, type SetStateAction } from "react";
import { Settings } from "lucide-react";
import { AppDialogShell } from "../../components/AppDialog";
import { AppSwitch } from "../../components/AppSwitch";
import {
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
    onChange({
      ...value,
      params: structuredClone(draftParams),
    });
    setParamsTarget(null);
  }

  const triggerLabel = `${mainIndicatorShortName(value.active)}▼`;
  const isMaParams = paramsTarget === "MA";
  const paramsTitle = paramsTarget
    ? isMaParams
      ? "主图MA参数设置"
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
        className={`main-indicator-params-dialog${isMaParams ? " is-ma" : ""}`}
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
            <div className={`main-indicator-params-form${isMaParams ? " is-ma" : ""}`}>
              {renderParamsFields(paramsTarget, draftParams, setDraftParams)}
            </div>
            <div className="app-dialog-actions main-indicator-params-actions">
              {!isMaParams ? (
                <button className="secondary-button" onClick={restoreDefaults} type="button">
                  恢复默认
                </button>
              ) : null}
              <button className="secondary-button" onClick={() => setParamsTarget(null)} type="button">
                取消
              </button>
              <button className="primary-button" onClick={saveParams} type="button">
                保存
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
    return (
      <>
        <label className="app-dialog-field">
          <span>周期</span>
          <input
            max={250}
            min={2}
            onChange={(event) =>
              setParams((prev) => ({ ...prev, BOLL: { ...prev.BOLL, period: Number(event.target.value) } }))
            }
            type="number"
            value={params.BOLL.period}
          />
        </label>
        <label className="app-dialog-field">
          <span>标准差倍数</span>
          <input
            max={10}
            min={0.1}
            onChange={(event) =>
              setParams((prev) => ({ ...prev, BOLL: { ...prev.BOLL, multiplier: Number(event.target.value) } }))
            }
            step={0.1}
            type="number"
            value={params.BOLL.multiplier}
          />
        </label>
      </>
    );
  }

  if (id === "BBI") {
    return params.BBI.periods.map((period, index) => (
      <label className="app-dialog-field" key={`bbi-${index}`}>
        <span>周期 {index + 1}</span>
        <input
          max={250}
          min={2}
          onChange={(event) => {
            const next = [...params.BBI.periods] as [number, number, number, number];
            next[index] = Number(event.target.value);
            setParams((prev) => ({ ...prev, BBI: { periods: next } }));
          }}
          type="number"
          value={period}
        />
      </label>
    ));
  }

  if (id === "EXPMA") {
    return params.EXPMA.periods.map((period, index) => (
      <label className="app-dialog-field" key={`expma-${index}`}>
        <span>周期 {index + 1}</span>
        <input
          max={250}
          min={2}
          onChange={(event) => {
            const next = [...params.EXPMA.periods] as [number, number];
            next[index] = Number(event.target.value);
            setParams((prev) => ({ ...prev, EXPMA: { periods: next } }));
          }}
          type="number"
          value={period}
        />
      </label>
    ));
  }

  if (id === "ENE") {
    return (
      <>
        <label className="app-dialog-field">
          <span>周期</span>
          <input
            max={250}
            min={2}
            onChange={(event) =>
              setParams((prev) => ({ ...prev, ENE: { ...prev.ENE, period: Number(event.target.value) } }))
            }
            type="number"
            value={params.ENE.period}
          />
        </label>
        <label className="app-dialog-field">
          <span>上轨 (%)</span>
          <input
            max={50}
            min={0.1}
            onChange={(event) =>
              setParams((prev) => ({ ...prev, ENE: { ...prev.ENE, upperPercent: Number(event.target.value) } }))
            }
            step={0.1}
            type="number"
            value={params.ENE.upperPercent}
          />
        </label>
        <label className="app-dialog-field">
          <span>下轨 (%)</span>
          <input
            max={50}
            min={0.1}
            onChange={(event) =>
              setParams((prev) => ({ ...prev, ENE: { ...prev.ENE, lowerPercent: Number(event.target.value) } }))
            }
            step={0.1}
            type="number"
            value={params.ENE.lowerPercent}
          />
        </label>
      </>
    );
  }

  return (
    <>
      <label className="app-dialog-field">
        <span>DKX 周期</span>
        <input
          max={250}
          min={2}
          onChange={(event) =>
            setParams((prev) => ({ ...prev, DKX: { ...prev.DKX, midPeriod: Number(event.target.value) } }))
          }
          type="number"
          value={params.DKX.midPeriod}
        />
      </label>
      <label className="app-dialog-field">
        <span>MADKX 周期</span>
        <input
          max={250}
          min={2}
          onChange={(event) =>
            setParams((prev) => ({ ...prev, DKX: { ...prev.DKX, maPeriod: Number(event.target.value) } }))
          }
          type="number"
          value={params.DKX.maPeriod}
        />
      </label>
    </>
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
      <label className="ma-line-color" title="均线颜色">
        <span aria-hidden="true" className="ma-line-color-swatch" style={{ background: line.color }} />
        <input
          aria-label="均线颜色"
          disabled={!line.enabled}
          onChange={(event) => onChange({ ...line, color: event.target.value })}
          type="color"
          value={line.color}
        />
      </label>
      <AppSwitch
        aria-label="开启均线"
        checked={line.enabled}
        onChange={(checked) => onChange({ ...line, enabled: checked })}
      />
    </div>
  );
}
