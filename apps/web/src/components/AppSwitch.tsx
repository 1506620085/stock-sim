import { useId, type ReactNode } from "react";

type AppSwitchProps = {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  id?: string;
  children?: ReactNode;
  "aria-label"?: string;
};

export function AppSwitch({
  checked = false,
  onChange,
  disabled = false,
  className,
  id,
  children,
  "aria-label": ariaLabel,
}: AppSwitchProps) {
  const autoId = useId();
  const inputId = id ?? autoId;

  return (
    <label className={["app-switch-row", disabled ? "is-disabled" : "", className].filter(Boolean).join(" ")}>
      <input
        aria-label={children ? undefined : ariaLabel}
        checked={checked}
        className="app-switch-input"
        disabled={disabled}
        id={inputId}
        onChange={(event) => onChange?.(event.target.checked)}
        type="checkbox"
      />
      <span aria-hidden="true" className="app-switch">
        <span className="app-switch-handle" />
      </span>
      {children ? <span className="app-switch-text">{children}</span> : null}
    </label>
  );
}
