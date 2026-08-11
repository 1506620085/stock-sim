/**
 * SubIndicatorSwitcher
 * 副图指标切换：各副图左上角按钮、「K线指标切换」与「常用指标」配置。
 */
import { useEffect, useState } from "react";
import { CircleMinus, CirclePlus, Settings } from "lucide-react";
import { AppDialogShell } from "../../components/AppDialog";
import {
  SUB_CHART_COUNT_MAX,
  SUB_CHART_COUNT_MIN,
  addFavoriteSubIndicator,
  assignSubSlot,
  getFavoriteSubIndicatorOptions,
  getUnselectedSubIndicatorOptions,
  removeFavoriteSubIndicator,
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
  const [favoritesOpen, setFavoritesOpen] = useState(false);
  const [focusSlot, setFocusSlot] = useState(0);
  const favoriteOptions = getFavoriteSubIndicatorOptions(value);

  useEffect(() => {
    if (!openRequest || openRequest.token <= 0) return;
    setFocusSlot(
      typeof openRequest.focusSlot === "number"
        ? Math.min(Math.max(0, openRequest.focusSlot), Math.max(0, value.count - 1))
        : 0,
    );
    setFavoritesOpen(false);
    setOpen(true);
  }, [openRequest, value.count]);

  function selectSlotIndicator(slotIndex: number, id: SubIndicatorId) {
    onChange(assignSubSlot(value, slotIndex, id));
  }

  function changeCount(count: number) {
    onChange(setSubChartCount(value, count));
  }

  return (
    <>
      <AppDialogShell
        className="sub-indicator-switch-dialog"
        onClose={() => setOpen(false)}
        open={open}
        showCloseButton
        title="K线指标切换"
      >
        <button
          className="sub-indicator-switch-tab"
          onClick={() => setFavoritesOpen(true)}
          type="button"
        >
          常用指标
        </button>

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
                    {favoriteOptions.map((option) => {
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
        </div>
      </AppDialogShell>

      <SubFavoriteSettingsDialog
        onChange={onChange}
        onClose={() => setFavoritesOpen(false)}
        open={favoritesOpen}
        value={value}
      />
    </>
  );
}

function SubFavoriteSettingsDialog({
  open,
  value,
  onChange,
  onClose,
}: {
  open: boolean;
  value: SubIndicatorState;
  onChange: (next: SubIndicatorState) => void;
  onClose: () => void;
}) {
  const selected = getFavoriteSubIndicatorOptions(value);
  const unselected = getUnselectedSubIndicatorOptions(value);

  return (
    <AppDialogShell
      className="sub-favorite-settings-dialog"
      onClose={onClose}
      open={open}
      showCloseButton
      title="K线常用副图指标设置"
    >
      <section className="sub-favorite-section">
        <div className="sub-favorite-section-head">
          <h3 className="sub-favorite-section-title">
            已选常用指标<span>（{selected.length}个）</span>
          </h3>
        </div>
        <ul className="sub-favorite-list">
          {selected.map((item) => (
            <li className="sub-favorite-row" key={item.id}>
              <span className="sub-favorite-name">{item.fullName}</span>
              <div className="sub-favorite-actions">
                <span aria-hidden="true" className="sub-favorite-gear" title="参数设置即将支持">
                  <Settings size={15} strokeWidth={2} />
                </span>
                {!item.pinned ? (
                  <button
                    aria-label={`移除${item.fullName}`}
                    className="sub-favorite-action is-remove"
                    onClick={() => onChange(removeFavoriteSubIndicator(value, item.id))}
                    type="button"
                  >
                    <CircleMinus size={18} strokeWidth={2} />
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="sub-favorite-section">
        <div className="sub-favorite-section-head">
          <h3 className="sub-favorite-section-title">
            未选常用指标<span>（{unselected.length}个）</span>
          </h3>
        </div>
        <ul className="sub-favorite-list">
          {unselected.map((item) => (
            <li className="sub-favorite-row" key={item.id}>
              <span className="sub-favorite-name">{item.fullName}</span>
              <div className="sub-favorite-actions">
                <button
                  aria-label={`添加${item.fullName}`}
                  className="sub-favorite-action is-add"
                  onClick={() => onChange(addFavoriteSubIndicator(value, item.id))}
                  type="button"
                >
                  <CirclePlus size={18} strokeWidth={2} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
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
