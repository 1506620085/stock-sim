import { CircleHelp } from "lucide-react";
import type { ReactNode } from "react";

type FieldHelpTipProps = {
  tip: string;
  "aria-label"?: string;
  className?: string;
  size?: number;
};

export function FieldHelpTip({ tip, "aria-label": ariaLabel = "说明", className, size = 14 }: FieldHelpTipProps) {
  return (
    <span
      aria-label={ariaLabel}
      className={["tooltip-wrap", "field-help-tip", className].filter(Boolean).join(" ")}
      data-tooltip={tip}
      tabIndex={0}
    >
      <CircleHelp aria-hidden="true" size={size} />
    </span>
  );
}

type FieldLabelWithTipProps = {
  tip: string;
  tipAriaLabel?: string;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
};

/** 字段标签与右侧问号提示的组合，便于标签行复用。 */
export function FieldLabelWithTip({ tip, tipAriaLabel, htmlFor, children, className }: FieldLabelWithTipProps) {
  return (
    <span className={["field-label-with-tip", className].filter(Boolean).join(" ")}>
      {htmlFor ? <label htmlFor={htmlFor}>{children}</label> : <span>{children}</span>}
      <FieldHelpTip aria-label={tipAriaLabel} tip={tip} />
    </span>
  );
}
