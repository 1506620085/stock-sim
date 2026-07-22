/**
 * QuickPositionControls
 * 模拟交易数量快捷仓位条与本地配置对话框。
 */
import { useEffect, useId, useState, type DragEvent } from "react";
import { GripVertical, Plus, Settings, Trash2 } from "lucide-react";
import { AppSelect } from "../../components/AppSelect";
import { AppNumberStepper } from "../../components/AppNumberStepper";
import { showInfo, showSuccess } from "../../components/ToastProvider";
import type { FeeSettings } from "../calculators/calculations";
import {
  createEmptyQuickPosition,
  loadQuickPositions,
  QUICK_POSITION_MAX,
  resolveQuickPositionQuantity,
  saveQuickPositions,
  type QuickPositionMode,
  type QuickPositionPreset,
} from "./quickPositions";
import { SHARES_PER_LOT } from "./tradeFunds";

type QuickPositionControlsProps = {
  availableCash: number;
  feeSettings: FeeSettings | null;
  maxTradeQuantity: number;
  price: number;
  side: "buy" | "sell";
  onApplyQuantity: (quantity: number) => void;
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

  return (
    <>
      <div className="quick-position-bar" role="group" aria-label="快捷仓位">
        <div className="quick-position-buttons">
          {presets.map((preset) => (
            <button
              className="quick-position-chip"
              key={preset.id}
              onClick={() => handleApply(preset)}
              type="button"
              title={presetLabelHint(preset)}
            >
              {preset.name}
            </button>
          ))}
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

function presetLabelHint(preset: QuickPositionPreset) {
  if (preset.mode === "fraction") {
    return preset.denominator <= 1 ? "全仓（可买/可卖）" : `可买/可卖的 1/${preset.denominator}`;
  }
  if (preset.mode === "fixedShares") {
    return `固定 ${preset.shares.toLocaleString("zh-CN")} 股`;
  }
  return `固定 ${preset.amount.toLocaleString("zh-CN")} 元`;
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
  const [draft, setDraft] = useState(() => initialPresets.map((item) => ({ ...item })));
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  function updateItem(id: string, patch: Partial<QuickPositionPreset>) {
    setDraft((items) => items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function addItem() {
    if (draft.length >= QUICK_POSITION_MAX) {
      showInfo(`最多配置 ${QUICK_POSITION_MAX} 个快捷仓位。`);
      return;
    }
    setDraft((items) => [...items, createEmptyQuickPosition()]);
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
    const cleaned = draft
      .map((item) => ({
        ...item,
        name: item.name.trim() || "快捷仓位",
        denominator: Math.max(1, Math.floor(item.denominator) || 1),
        shares: Math.max(SHARES_PER_LOT, item.shares),
        amount: Math.max(0.01, item.amount),
      }))
      .slice(0, QUICK_POSITION_MAX);
    if (!cleaned.length) {
      showInfo("请至少保留一个快捷仓位。");
      return;
    }
    onSave(cleaned);
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
          拖拽左侧手柄调整顺序；点击保存后才会生效。最多 {QUICK_POSITION_MAX} 个。
        </p>

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

              <label className="quick-position-field">
                名称
                <input
                  onChange={(event) => updateItem(item.id, { name: event.target.value })}
                  type="text"
                  value={item.name}
                />
              </label>

              <label className="quick-position-field">
                计算方式
                <AppSelect
                  onChange={(value) => updateItem(item.id, { mode: value as QuickPositionMode })}
                  options={[
                    { label: "1/N 仓", value: "fraction" },
                    { label: "固定股数", value: "fixedShares" },
                    { label: "固定金额", value: "fixedAmount" },
                  ]}
                  value={item.mode}
                />
              </label>

              <div className="quick-position-param">
                {item.mode === "fraction" ? (
                  <AppNumberStepper
                    label="N（1=全仓）"
                    min={1}
                    onChange={(value) => updateItem(item.id, { denominator: value ?? 1 })}
                    step={1}
                    value={item.denominator}
                  />
                ) : null}

                {item.mode === "fixedShares" ? (
                  <AppNumberStepper
                    label="股数"
                    min={SHARES_PER_LOT}
                    normalizeToStep
                    onChange={(value) => updateItem(item.id, { shares: value ?? SHARES_PER_LOT })}
                    step={SHARES_PER_LOT}
                    value={item.shares}
                  />
                ) : null}

                {item.mode === "fixedAmount" ? (
                  <AppNumberStepper
                    label="金额（元）"
                    min={0.01}
                    onChange={(value) => updateItem(item.id, { amount: value ?? 0.01 })}
                    step={100}
                    value={item.amount}
                  />
                ) : null}
              </div>

              <button
                aria-label={`删除 ${item.name}`}
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
