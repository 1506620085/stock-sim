/**
 * SubIndicatorSwitcher
 * 副图指标切换：各副图左上角按钮、「K线指标切换」、常用指标与参数设置。
 */
import { useEffect, useState } from "react";
import { CircleMinus, CirclePlus, Settings } from "lucide-react";
import { AppDialogShell } from "../../components/AppDialog";
import { FieldHelpTip } from "../../components/FieldHelpTip";
import {
  SUB_CHART_COUNT_MAX,
  SUB_CHART_COUNT_MIN,
  SUB_INDICATOR_PARAM_SCHEMAS,
  addFavoriteSubIndicator,
  assignSubSlot,
  getFavoriteSubIndicatorOptions,
  getUnselectedSubIndicatorOptions,
  hasSubIndicatorParams,
  removeFavoriteSubIndicator,
  resetSubIndicatorParams,
  setSubChartCount,
  subChartOrdinalLabel,
  subIndicatorShortName,
  updateSubIndicatorParams,
  type SubIndicatorId,
  type SubIndicatorMeta,
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
  const [paramsTarget, setParamsTarget] = useState<SubIndicatorId | null>(null);
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
    setParamsTarget(null);
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
        <button className="sub-indicator-switch-tab" onClick={() => setFavoritesOpen(true)} type="button">
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
        onOpenParams={(id) => setParamsTarget(id)}
        open={favoritesOpen}
        value={value}
      />

      {paramsTarget && hasSubIndicatorParams(paramsTarget) ? (
        <SubIndicatorParamsDialog
          key={paramsTarget}
          indicatorId={paramsTarget}
          onChange={onChange}
          onClose={() => setParamsTarget(null)}
          value={value}
        />
      ) : null}
    </>
  );
}

function SubFavoriteSettingsDialog({
  open,
  value,
  onChange,
  onClose,
  onOpenParams,
}: {
  open: boolean;
  value: SubIndicatorState;
  onChange: (next: SubIndicatorState) => void;
  onClose: () => void;
  onOpenParams: (id: SubIndicatorId) => void;
}) {
  const selected = getFavoriteSubIndicatorOptions(value);
  const unselected = getUnselectedSubIndicatorOptions(value);

  return (
    <AppDialogShell
      className="sub-favorite-settings-dialog"
      headerActions={
        <button
          className="ma-params-restore"
          onClick={() => {
            const firstConfigurable = selected.find((item) => hasSubIndicatorParams(item.id));
            if (firstConfigurable) onOpenParams(firstConfigurable.id);
          }}
          type="button"
        >
          指标参数自定义
        </button>
      }
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
                {hasSubIndicatorParams(item.id) ? (
                  <button
                    aria-label={`${item.fullName}参数设置`}
                    className="sub-favorite-action is-gear"
                    onClick={() => onOpenParams(item.id)}
                    type="button"
                  >
                    <Settings size={15} strokeWidth={2} />
                  </button>
                ) : (
                  <span aria-hidden="true" className="sub-favorite-gear" />
                )}
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
                <SubIndicatorHelpTip item={item} />
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

function SubIndicatorHelpTip({ item }: { item: SubIndicatorMeta }) {
  return (
    <FieldHelpTip
      aria-label={`${item.helpTitle}说明`}
      className="sub-favorite-help"
      mode="click"
      size={16}
      tip={
        <div className="sub-indicator-help-content">
          <p className="sub-indicator-help-title">{item.helpTitle}</p>
          <p className="sub-indicator-help-body">{item.helpBody}</p>
        </div>
      }
    />
  );
}

function SubIndicatorParamsDialog({
  indicatorId,
  value,
  onChange,
  onClose,
}: {
  indicatorId: SubIndicatorId;
  value: SubIndicatorState;
  onChange: (next: SubIndicatorState) => void;
  onClose: () => void;
}) {
  const schema = SUB_INDICATOR_PARAM_SCHEMAS[indicatorId];
  const [draft, setDraft] = useState<number[]>(() => {
    if (!schema) return [];
    const stored = value.params[indicatorId];
    return schema.fields.map((field, index) => {
      const raw = stored?.[index] ?? schema.defaults[index];
      const n = Number(raw);
      return Number.isFinite(n) ? n : schema.defaults[index];
    });
  });

  if (!schema) return null;
  const activeSchema = schema;

  function save() {
    onChange(updateSubIndicatorParams(value, indicatorId, draft));
    onClose();
  }

  function restore() {
    const next = resetSubIndicatorParams(value, indicatorId);
    setDraft([...(next.params[indicatorId] ?? activeSchema.defaults)]);
    onChange(next);
  }

  return (
    <AppDialogShell
      className="main-indicator-params-dialog is-sheet"
      headerActions={
        <button className="ma-params-restore" onClick={restore} type="button">
          恢复默认
        </button>
      }
      onClose={onClose}
      open
      title={activeSchema.title}
    >
      <div className="main-indicator-params-form is-sheet">
        <div className="indicator-params-panel">
          {activeSchema.fields.map((field, index) => (
            <div className="indicator-param-row" key={`${indicatorId}-${index}`}>
              <span className="indicator-param-label">{field.label}</span>
              <input
                aria-label={field.label}
                className="indicator-param-period"
                max={field.max}
                min={field.min}
                onChange={(event) => {
                  const next = [...draft];
                  next[index] = Number(event.target.value);
                  setDraft(next);
                }}
                step={field.step ?? 1}
                type="number"
                value={Number.isFinite(draft[index]) ? draft[index] : field.min}
              />
              {field.unit ? <span className="indicator-param-unit">{field.unit}</span> : null}
              <span className="indicator-param-range">
                范围：{field.min} ~ {field.max}
              </span>
            </div>
          ))}
          <p className="indicator-param-hint">{activeSchema.hint(draft)}</p>
        </div>
      </div>
      <div className="app-dialog-actions main-indicator-params-actions is-sheet">
        <button className="indicator-params-save" onClick={save} type="button">
          保存设置
        </button>
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
