/**
 * AppNumberStepper
 * 通用数字步进输入：支持加减按钮、步长对齐、上下限与草稿态，用于价格/数量等数值录入。
 */
import { memo, useEffect, useId, useState, type ReactNode } from "react";

export function countStepDecimals(step: number) {
  if (!Number.isFinite(step) || step <= 0) return 0;
  if (step >= 1) return 0;
  const normalized = step.toFixed(12).replace(/\.?0+$/, "");
  const dot = normalized.indexOf(".");
  return dot === -1 ? 0 : normalized.length - dot - 1;
}

export function normalizeStepValue(raw: number, step: number) {
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  if (step >= 1) return Math.floor(raw / step) * step;
  const decimals = countStepDecimals(step);
  const factor = 10 ** decimals;
  return Math.round(raw * factor) / factor;
}

type AppNumberStepperProps = {
  value: number | null;
  onChange: (value: number | null) => void;
  /** 输入精度 / normalizeToStep 对齐步长；HTML input 的 step */
  step?: number;
  /** +/- 按钮步长，默认与 step 相同（如股票价格输入精度 0.001、加减按 0.01） */
  adjustStep?: number;
  min?: number;
  max?: number;
  normalizeToStep?: boolean;
  disabled?: boolean;
  inputMode?: "decimal" | "numeric";
  className?: string;
  label?: ReactNode;
  decrementAriaLabel?: string;
  incrementAriaLabel?: string;
  onDraftChange?: (draft: string) => void;
  "aria-label"?: string;
};

export const AppNumberStepper = memo(function AppNumberStepper({
  value,
  onChange,
  step = 1,
  adjustStep,
  min = 0,
  max,
  normalizeToStep = false,
  disabled = false,
  inputMode = "decimal",
  className,
  label,
  decrementAriaLabel,
  incrementAriaLabel,
  onDraftChange,
  "aria-label": ariaLabel,
}: AppNumberStepperProps) {
  const inputId = useId();
  const [draft, setDraft] = useState(value == null ? "" : String(value));
  const bumpStep = adjustStep ?? step;

  useEffect(() => {
    const nextDraft = value == null ? "" : String(value);
    setDraft(nextDraft);
    onDraftChange?.(nextDraft);
  }, [value, onDraftChange]);

  function syncDraft(nextDraft: string) {
    setDraft(nextDraft);
    onDraftChange?.(nextDraft);
  }

  function applyValue(raw: number) {
    if (!Number.isFinite(raw)) {
      syncDraft(value == null ? "" : String(value));
      return;
    }
    const clamped = Math.max(min, raw);
    const normalized = normalizeToStep ? normalizeStepValue(clamped, step) : clamped;
    let next = Math.max(min, normalized);
    if (max != null) next = Math.min(max, next);
    onChange(next);
    syncDraft(String(next));
  }

  function adjustValue(delta: number) {
    applyValue((value ?? 0) + delta);
  }

  function commitDraft() {
    if (draft.trim() === "") {
      onChange(null);
      syncDraft("");
      return;
    }
    applyValue(Number(draft));
  }

  const stepperValue = value == null ? min : normalizeToStep ? normalizeStepValue(value, step) : value;
  const canDecrement = !disabled && stepperValue > min;
  const canIncrement = !disabled && (max == null || stepperValue < max);

  const control = (
    <div className="trade-qty-stepper">
      <button
        aria-label={decrementAriaLabel ?? `减少 ${bumpStep}`}
        className="trade-qty-step"
        disabled={!canDecrement}
        onClick={() => adjustValue(-bumpStep)}
        type="button"
      >
        −
      </button>
      <div className="trade-qty-input-wrap">
        <input
          aria-label={label ? undefined : ariaLabel}
          className="trade-qty-input"
          disabled={disabled}
          id={inputId}
          inputMode={inputMode}
          max={max}
          min={min}
          step={step}
          type="number"
          value={draft}
          onBlur={commitDraft}
          onChange={(event) => syncDraft(event.target.value)}
        />
      </div>
      <button
        aria-label={incrementAriaLabel ?? `增加 ${bumpStep}`}
        className="trade-qty-step"
        disabled={!canIncrement}
        onClick={() => adjustValue(bumpStep)}
        type="button"
      >
        +
      </button>
    </div>
  );

  if (label == null) return control;

  return (
    <div className={["app-number-stepper-field", className].filter(Boolean).join(" ")}>
      <label htmlFor={inputId}>{label}</label>
      {control}
    </div>
  );
});
