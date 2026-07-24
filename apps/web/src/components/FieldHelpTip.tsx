/**
 * FieldHelpTip / FieldLabelWithTip
 * 字段说明提示：问号图标悬停或点击展示提示文案；FieldLabelWithTip 将标签与提示组合在同一行。
 */
import { CircleHelp } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

type FieldHelpTipProps = {
  tip: ReactNode;
  "aria-label"?: string;
  className?: string;
  size?: number;
  /** hover：悬停显示；click：点击弹出说明面板 */
  mode?: "hover" | "click";
  /** click 模式下弹出层方位 */
  placement?: "top" | "top-left" | "bottom" | "bottom-left";
};

export function FieldHelpTip({
  tip,
  "aria-label": ariaLabel = "说明",
  className,
  size = 14,
  mode = "hover",
  placement = "top",
}: FieldHelpTipProps) {
  const tipId = useId();
  const rootRef = useRef<HTMLSpanElement | null>(null);
  const [open, setOpen] = useState(false);
  const tipText = typeof tip === "string" ? tip : undefined;

  useEffect(() => {
    if (mode !== "click" || !open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [mode, open]);

  if (mode === "click") {
    return (
      <span
        className={["field-help-tip", "field-help-tip--click", className].filter(Boolean).join(" ")}
        ref={rootRef}
      >
        <button
          aria-controls={tipId}
          aria-expanded={open}
          aria-label={ariaLabel}
          className="field-help-tip-trigger"
          onClick={() => setOpen((value) => !value)}
          type="button"
        >
          <CircleHelp aria-hidden="true" size={size} />
        </button>
        {open ? (
          <div
            className={["field-help-popover", `field-help-popover--${placement}`].join(" ")}
            id={tipId}
            role="dialog"
            aria-label={ariaLabel}
          >
            {tip}
          </div>
        ) : null}
      </span>
    );
  }

  return (
    <span
      aria-label={ariaLabel}
      className={["tooltip-wrap", "field-help-tip", className].filter(Boolean).join(" ")}
      data-tooltip={tipText ?? ariaLabel}
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

export function FieldLabelWithTip({ tip, tipAriaLabel, htmlFor, children, className }: FieldLabelWithTipProps) {
  return (
    <span className={["field-label-with-tip", className].filter(Boolean).join(" ")}>
      {htmlFor ? <label htmlFor={htmlFor}>{children}</label> : <span>{children}</span>}
      <FieldHelpTip aria-label={tipAriaLabel} tip={tip} />
    </span>
  );
}
