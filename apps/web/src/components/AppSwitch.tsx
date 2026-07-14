/**
 * AppSwitch
 * 通用开关组件：布尔开/关切换，可选开关内文案，用于设置项与表单开关。
 */
import { useId, type ReactNode } from "react";

type AppSwitchProps = {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  id?: string;
  checkedChildren?: ReactNode;
  unCheckedChildren?: ReactNode;
  "aria-label"?: string;
};

export function AppSwitch({
  checked = false,
  onChange,
  disabled = false,
  className,
  id,
  checkedChildren,
  unCheckedChildren,
  "aria-label": ariaLabel,
}: AppSwitchProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const hasInnerText = checkedChildren != null || unCheckedChildren != null;

  return (
    <label className={["app-switch-row", disabled ? "is-disabled" : "", className].filter(Boolean).join(" ")}>
      <input
        aria-label={ariaLabel}
        checked={checked}
        className="app-switch-input"
        disabled={disabled}
        id={inputId}
        onChange={(event) => onChange?.(event.target.checked)}
        type="checkbox"
      />
      <span aria-hidden="true" className={["app-switch", hasInnerText ? "app-switch--with-text" : ""].filter(Boolean).join(" ")}>
        {hasInnerText ? (
          <span className="app-switch-inner">
            {checkedChildren != null ? <span className="app-switch-inner-checked">{checkedChildren}</span> : null}
            {unCheckedChildren != null ? <span className="app-switch-inner-unchecked">{unCheckedChildren}</span> : null}
          </span>
        ) : null}
        <span className="app-switch-handle" />
      </span>
    </label>
  );
}
