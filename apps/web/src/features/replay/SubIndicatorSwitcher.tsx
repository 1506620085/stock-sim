/**
 * SubIndicatorSwitcher
 * 副图指标切换：各副图左上角按钮 +「K线指标切换」面板。
 */
import { useEffect, useState } from "react";
import { AppDialogShell } from "../../components/AppDialog";
import {
  SUB_CHART_COUNT_MAX,
  SUB_CHART_COUNT_MIN,
  SUB_INDICATOR_OPTIONS,
  assignSubSlot,
  setSubChartCount,
  subChartOrdinalLabel,
  subIndicatorShortName,
  type SubIndicatorId,
  type SubIndicatorState,
} from "./subIndicators";

type Props = {
  value: SubIndicatorState;
  onChange: (next: SubIndicatorState) => void;
  /** 外部请求打开面板时递增；focusSlot 指定高亮副图 */
  openRequest?: { token: number; focusSlot?: number };
};

export function SubIndicatorSwitcherDialog({ value, onChange, openRequest }: Props) {
  const [open, setOpen] = useState(false);
  const [focusSlot, setFocusSlot] = useState(0);

  useEffect(() => {
    if (!openRequest || openRequest.token <= 0) return;
    setFocusSlot(
      typeof openRequest.focusSlot === "number"
        ? Math.min(Math.max(0, openRequest.focusSlot), Math.max(0, value.count - 1))
        : 0,
    );
    setOpen(true);
  }, [openRequest, value.count]);

  function selectSlotIndicator(slotIndex: number, id: SubIndicatorId) {
    onChange(assignSubSlot(value, slotIndex, id));
  }

  function changeCount(count: number) {
    onChange(setSubChartCount(value, count));
  }

  return (
    <AppDialogShell
      className="sub-indicator-switch-dialog"
      onClose={() => setOpen(false)}
      open={open}
      showCloseButton
      title="K线指标切换"
    >
      <p className="sub-indicator-switch-tab">常用指标</p>

      <div className="sub-indicator-switch-body">
        {value.count <= 0 ? (
          <p className="sub-indicator-switch-empty">当前未开启副图，请在下方选择副图数量。</p>
        ) : (
          Array.from({ length: value.count }, (_, slotIndex) => {
            const activeId = value.slots[slotIndex];
            return (
              <section
                className={`sub-indicator-slot-section${focusSlot === slotIndex ? " is-focused" : ""}`}
                key={`slot-${slotIndex}`}
              >
                <h3 className="sub-indicator-slot-title">{subChartOrdinalLabel(slotIndex)}</h3>
                <div className="sub-indicator-chip-row" role="listbox" aria-label={subChartOrdinalLabel(slotIndex)}>
                  {SUB_INDICATOR_OPTIONS.map((option) => {
                    const selected = activeId === option.id;
                    return (
                      <button
                        aria-selected={selected}
                        className={`sub-indicator-chip${selected ? " is-active" : ""}`}
                        key={option.id}
                        onClick={() => {
                          setFocusSlot(slotIndex);
                          selectSlotIndicator(slotIndex, option.id);
                        }}
                        role="option"
                        type="button"
                      >
                        {option.name}
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })
        )}
      </div>

      <div className="sub-indicator-switch-footer">
        <div className="sub-indicator-count-group" role="group" aria-label="副图数量">
          <span className="sub-indicator-count-label">副图数量</span>
          <div className="sub-indicator-count-seg">
            {Array.from({ length: SUB_CHART_COUNT_MAX - SUB_CHART_COUNT_MIN + 1 }, (_, i) => {
              const count = i + SUB_CHART_COUNT_MIN;
              const active = value.count === count;
              return (
                <button
                  aria-pressed={active}
                  className={`sub-indicator-count-btn${active ? " is-active" : ""}`}
                  key={count}
                  onClick={() => changeCount(count)}
                  type="button"
                >
                  {count}个
                </button>
              );
            })}
          </div>
        </div>

        <label className="sub-indicator-click-toggle">
          <input
            checked={value.clickToSwitch}
            onChange={(event) => onChange({ ...value, clickToSwitch: event.target.checked })}
            type="checkbox"
          />
          <span>点击副图切换</span>
        </label>
      </div>
    </AppDialogShell>
  );
}

type TriggerProps = {
  indicatorId: SubIndicatorId;
  onClick: () => void;
};

export function SubIndicatorTrigger({ indicatorId, onClick }: TriggerProps) {
  return (
    <button
      aria-haspopup="dialog"
      aria-label="切换副图指标"
      className="main-indicator-trigger sub-indicator-trigger"
      onClick={onClick}
      type="button"
    >
      {`${subIndicatorShortName(indicatorId)}▼`}
    </button>
  );
}
