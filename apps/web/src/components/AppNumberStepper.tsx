import { memo, useEffect, useId, useState, type ReactNode } from "react";

export function normalizeStepValue(raw: number, step: number) {
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  if (step >= 1) return Math.floor(raw / step) * step;
  const decimals = String(step).includes(".") ? String(step).split(".")[1]?.length ?? 0 : 0;
  const factor = 10 ** decimals;
  return Math.round(raw * factor) / factor;
}

type AppNumberStepperProps = {
  value: number | null;
  onChange: (value: number | null) => void;
  step?: number;
  min?: number;
  max?: number;
  normalizeToStep?: boolean;
  disabled?: boolean;
  inputMode?: "decimal" | "numeric";
  className?: string;
  label?: ReactNode;
  decrementAriaLabel?: string;
  incrementAriaLabel?: string;
  "aria-label"?: string;
};

export const AppNumberStepper = memo(function AppNumberStepper({
  value,
  onChange,
  step = 1,
  min = 0,
  max,
  normalizeToStep = false,
  disabled = false,
  inputMode = "decimal",
  className,
  label,
  decrementAriaLabel,
  incrementAriaLabel,
  "aria-label": ariaLabel,
}: AppNumberStepperProps) {
  const inputId = useId();
  const [draft, setDraft] = useState(value == null ? "" : String(value));

  useEffect(() => {
    setDraft(value == null ? "" : String(value));
  }, [value]);

  function applyValue(raw: number) {
    if (!Number.isFinite(raw)) {
      setDraft(value == null ? "" : String(value));
      return;
    }
    const normalized = normalizeToStep ? normalizeStepValue(raw, step) : normalizeStepValue(Math.max(min, raw), step);
    let next = Math.max(min, normalized);
    if (max != null) next = Math.min(max, next);
    onChange(next);
    setDraft(String(next));
  }

  function adjustValue(delta: number) {
    applyValue((value ?? 0) + delta);
  }

  function commitDraft() {
    if (draft.trim() === "") {
      onChange(null);
      setDraft("");
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
        aria-label={decrementAriaLabel ?? `减少 ${step}`}
        className="trade-qty-step"
        disabled={!canDecrement}
        onClick={() => adjustValue(-step)}
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
          onChange={(event) => setDraft(event.target.value)}
        />
      </div>
      <button
        aria-label={incrementAriaLabel ?? `增加 ${step}`}
        className="trade-qty-step"
        disabled={!canIncrement}
        onClick={() => adjustValue(step)}
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
