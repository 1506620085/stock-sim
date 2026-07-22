/**
 * QuickPositionControls
 * 模拟交易数量快捷仓位条与本地配置对话框。
 */
import { useEffect, useId, useRef, useState, type DragEvent, type UIEvent } from "react";
import { GripVertical, Plus, Settings, Trash2 } from "lucide-react";
import { AppSelect } from "../../components/AppSelect";
import { showInfo, showSuccess } from "../../components/ToastProvider";
import type { FeeSettings } from "../calculators/calculations";
import {
  createEmptyQuickPositionDraft,
  draftToPreset,
  formatQuickPositionLabel,
  loadQuickPositions,
  presetToDraft,
  QUICK_POSITION_MAX,
  resolveQuickPositionQuantity,
  saveQuickPositions,
  type QuickPositionMode,
  type QuickPositionPreset,
} from "./quickPositions";

type QuickPositionControlsProps = {
  availableCash: number;
  feeSettings: FeeSettings | null;
  maxTradeQuantity: number;
  price: number;
  side: "buy" | "sell";
  onApplyQuantity: (quantity: number) => void;
};

type EditorDraft = {
  id: string;
  mode: QuickPositionMode;
  valueText: string;
};

export function QuickPositionControls({
  availableCash,
  feeSettings,
  maxTradeQuantity,
  price,
  side,
  onApplyQuantity,
}: QuickPositionControlsProps) {
  const [presets, setPresets] = useState<QuickPositionPreset[]>(() => loadQuickPositions());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const scrollWrapRef = useRef<HTMLDivElement | null>(null);

  function updateScrollHints() {
    const node = scrollRef.current;
    if (!node) {
      setCanScrollLeft(false);
      setCanScrollRight(false);
      return;
    }
    const maxScroll = Math.max(0, node.scrollWidth - node.clientWidth);
    setCanScrollLeft(node.scrollLeft > 1);
    setCanScrollRight(maxScroll - node.scrollLeft > 1);
  }

  useEffect(() => {
    const node = scrollRef.current;
    const wrap = scrollWrapRef.current;
    if (!node) return;

    const scheduleUpdate = () => {
      requestAnimationFrame(updateScrollHints);
    };
    scheduleUpdate();

    const onWheel = (event: WheelEvent) => {
      if (node.scrollWidth <= node.clientWidth + 1) return;
      const delta =
        Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      if (delta === 0) return;
      const maxScroll = node.scrollWidth - node.clientWidth;
      const next = Math.min(maxScroll, Math.max(0, node.scrollLeft + delta));
      if (next === node.scrollLeft) return;
      event.preventDefault();
      node.scrollLeft = next;
      updateScrollHints();
    };

    node.addEventListener("wheel", onWheel, { passive: false });

    const observers: ResizeObserver[] = [];
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(scheduleUpdate);
      observer.observe(node);
      if (wrap) observer.observe(wrap);
      observers.push(observer);
    }

    window.addEventListener("resize", scheduleUpdate);
    return () => {
      node.removeEventListener("wheel", onWheel);
      window.removeEventListener("resize", scheduleUpdate);
      observers.forEach((observer) => observer.disconnect());
    };
  }, [presets]);

  function handleApply(preset: QuickPositionPreset) {
    const quantity = resolveQuickPositionQuantity({
      preset,
      maxTradeQuantity,
      availableCash,
      price,
      side,
      feeSettings,
    });
    if (quantity <= 0) {
      showInfo(side === "buy" ? "当前无可买数量。" : "当前无可卖数量。");
      return;
    }
    onApplyQuantity(quantity);
  }

  function handleSave(next: QuickPositionPreset[]) {
    saveQuickPositions(next);
    setPresets(next.map((item) => ({ ...item })));
    setSettingsOpen(false);
    showSuccess("快捷仓位已保存");
  }

  function handleScroll(event: UIEvent<HTMLDivElement>) {
    const node = event.currentTarget;
    const maxScroll = Math.max(0, node.scrollWidth - node.clientWidth);
    setCanScrollLeft(node.scrollLeft > 1);
    setCanScrollRight(maxScroll - node.scrollLeft > 1);
  }

  return (
    <>
      <div className="quick-position-bar" role="group" aria-label="快捷仓位">
        <div
          className={[
            "quick-position-scroll",
            canScrollLeft ? "has-left" : "",
            canScrollRight ? "has-right" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          ref={scrollWrapRef}
        >
          <div className="quick-position-buttons" onScroll={handleScroll} ref={scrollRef}>
            {presets.map((preset) => {
              const label = formatQuickPositionLabel(preset);
              return (
                <button
                  className="quick-position-chip"
                  key={preset.id}
                  onClick={() => handleApply(preset)}
                  type="button"
                  title={label}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
        <button
          aria-label="快捷仓位设置"
          className="quick-position-settings"
          onClick={() => setSettingsOpen(true)}
          type="button"
          title="快捷仓位设置"
        >
          <Settings size={15} />
        </button>
      </div>

      {settingsOpen ? (
        <QuickPositionSettingsDialog
          initialPresets={presets}
          onClose={() => setSettingsOpen(false)}
          onSave={handleSave}
        />
      ) : null}
    </>
  );
}

function QuickPositionSettingsDialog({
  initialPresets,
  onClose,
  onSave,
}: {
  initialPresets: QuickPositionPreset[];
  onClose: () => void;
  onSave: (presets: QuickPositionPreset[]) => void;
}) {
  const titleId = useId();
  const [draft, setDraft] = useState<EditorDraft[]>(() => initialPresets.map(presetToDraft));
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  function updateItem(id: string, patch: Partial<EditorDraft>) {
    setDraft((items) => items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function addItem() {
    if (draft.length >= QUICK_POSITION_MAX) {
      showInfo(`最多配置 ${QUICK_POSITION_MAX} 个快捷仓位。`);
      return;
    }
    setDraft((items) => [...items, createEmptyQuickPositionDraft()]);
  }

  function removeItem(id: string) {
    setDraft((items) => (items.length > 1 ? items.filter((item) => item.id !== id) : items));
  }

  function handleDragStart(index: number) {
    setDragIndex(index);
  }

  function handleDragOver(event: DragEvent, index: number) {
    event.preventDefault();
    if (dragIndex == null || dragIndex === index) return;
    setDraft((items) => {
      const next = [...items];
      const [moved] = next.splice(dragIndex, 1);
      next.splice(index, 0, moved);
      return next;
    });
    setDragIndex(index);
  }

  function handleDragEnd() {
    setDragIndex(null);
  }

  function handleSaveClick() {
    const cleaned: QuickPositionPreset[] = [];
    for (const item of draft) {
      const preset = draftToPreset(item);
      if (!preset) {
        showInfo("请完整填写每一行的数量参数。");
        return;
      }
      cleaned.push(preset);
    }
    if (!cleaned.length) {
      showInfo("请至少保留一个快捷仓位。");
      return;
    }
    onSave(cleaned.slice(0, QUICK_POSITION_MAX));
  }

  return (
    <div className="app-dialog-backdrop" onClick={onClose} role="presentation">
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className="app-dialog quick-position-dialog"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="section-header quick-position-dialog-header">
          <h2 id={titleId}>快捷仓位编辑</h2>
          <div className="quick-position-dialog-actions">
            <button className="secondary-button" onClick={onClose} type="button">
              取消
            </button>
            <button className="primary-button" onClick={handleSaveClick} type="button">
              保存
            </button>
          </div>
        </div>

        <p className="quick-position-dialog-hint">
          拖拽左侧手柄调整顺序；按钮名称由计算方式自动生成。最多 {QUICK_POSITION_MAX} 个。
        </p>

        <div className="quick-position-editor-columns" aria-hidden="true">
          <span />
          <span>计算方式</span>
          <span>数量</span>
          <span />
        </div>

        <div className="quick-position-editor-list">
          {draft.map((item, index) => (
            <div
              className={`quick-position-editor-item${dragIndex === index ? " is-dragging" : ""}`}
              key={item.id}
              onDragOver={(event) => handleDragOver(event, index)}
            >
              <span
                aria-hidden="true"
                className="quick-position-drag-handle"
                draggable
                onDragEnd={handleDragEnd}
                onDragStart={() => handleDragStart(index)}
                title="拖拽排序"
              >
                <GripVertical size={16} />
              </span>

              <div className="quick-position-mode">
                <AppSelect
                  aria-label="计算方式"
                  onChange={(value) => updateItem(item.id, { mode: value as QuickPositionMode, valueText: "" })}
                  options={[
                    { label: "仓位", value: "fraction" },
                    { label: "数量", value: "fixedShares" },
                    { label: "金额", value: "fixedAmount" },
                  ]}
                  value={item.mode}
                />
              </div>

              <div className="quick-position-value">
                {item.mode === "fraction" ? (
                  <div className="quick-position-value-input quick-position-value-input--fraction">
                    <span className="quick-position-value-prefix" aria-hidden="true">
                      1/
                    </span>
                    <input
                      aria-label="仓位分母"
                      inputMode="numeric"
                      onChange={(event) => updateItem(item.id, { valueText: event.target.value.replace(/[^\d]/g, "") })}
                      placeholder="输入"
                      type="text"
                      value={item.valueText}
                    />
                  </div>
                ) : null}

                {item.mode === "fixedShares" ? (
                  <div className="quick-position-value-input">
                    <input
                      aria-label="股数"
                      inputMode="numeric"
                      onChange={(event) => updateItem(item.id, { valueText: event.target.value.replace(/[^\d]/g, "") })}
                      placeholder="输入数量"
                      type="text"
                      value={item.valueText}
                    />
                    <span className="quick-position-value-suffix" aria-hidden="true">
                      股
                    </span>
                  </div>
                ) : null}

                {item.mode === "fixedAmount" ? (
                  <div className="quick-position-value-input">
                    <input
                      aria-label="金额"
                      inputMode="decimal"
                      onChange={(event) =>
                        updateItem(item.id, {
                          valueText: event.target.value.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1"),
                        })
                      }
                      placeholder="输入金额"
                      type="text"
                      value={item.valueText}
                    />
                    <span className="quick-position-value-suffix" aria-hidden="true">
                      元
                    </span>
                  </div>
                ) : null}
              </div>

              <button
                aria-label="删除快捷仓位"
                className="icon-button danger-button quick-position-remove"
                disabled={draft.length <= 1}
                onClick={() => removeItem(item.id)}
                type="button"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>

        <button className="text-button quick-position-add" onClick={addItem} type="button">
          <Plus size={15} />
          新增快捷仓位
        </button>
      </div>
    </div>
  );
}
