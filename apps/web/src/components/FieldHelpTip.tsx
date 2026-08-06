/**
 * FieldHelpTip / FieldLabelWithTip
 * 字段说明提示：问号图标悬停或点击展示提示文案；FieldLabelWithTip 将标签与提示组合在同一行。
 */
import { CircleHelp } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";

type FieldHelpTipProps = {
  tip: ReactNode;
  "aria-label"?: string;
  className?: string;
  size?: number;
  /** hover：悬停显示；click：点击弹出说明面板 */
  mode?: "hover" | "click";
  /** 弹出层方位 */
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
  const bubbleRef = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [bubbleStyle, setBubbleStyle] = useState<CSSProperties>({});
  const tipText = typeof tip === "string" ? tip : undefined;

  function updateBubblePosition() {
    const root = rootRef.current;
    const bubble = bubbleRef.current;
    if (!root || !bubble) return;

    const rect = root.getBoundingClientRect();
    const bubbleRect = bubble.getBoundingClientRect();
    const gap = 8;
    const padding = 12;
    const preferBottom = placement === "bottom" || placement === "bottom-left";
    const preferLeft = placement === "top-left" || placement === "bottom-left";

    let top = preferBottom ? rect.bottom + gap : rect.top - gap - bubbleRect.height;
    if (!preferBottom && top < padding) {
      top = rect.bottom + gap;
    }
    if (preferBottom && top + bubbleRect.height > window.innerHeight - padding) {
      top = Math.max(padding, rect.top - gap - bubbleRect.height);
    }

    let left = preferLeft ? rect.right - bubbleRect.width : rect.left + rect.width / 2 - bubbleRect.width / 2;
    left = Math.min(Math.max(padding, left), window.innerWidth - bubbleRect.width - padding);

    setBubbleStyle({
      position: "fixed",
      top,
      left,
      transform: "none",
      bottom: "auto",
      right: "auto",
      zIndex: 1200,
      opacity: 1,
      visibility: "visible",
    });
  }

  useLayoutEffect(() => {
    if (!open) return;
    updateBubblePosition();
    const frame = window.requestAnimationFrame(updateBubblePosition);
    return () => window.cancelAnimationFrame(frame);
  }, [open, placement, tipText, tip]);

  useEffect(() => {
    if (!open) return;

    const handleWindowChange = () => updateBubblePosition();
    window.addEventListener("resize", handleWindowChange);
    window.addEventListener("scroll", handleWindowChange, true);
    return () => {
      window.removeEventListener("resize", handleWindowChange);
      window.removeEventListener("scroll", handleWindowChange, true);
    };
  }, [open]);

  useEffect(() => {
    if (mode !== "click" || !open) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !bubbleRef.current?.contains(target)) {
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
        {open
          ? createPortal(
              <div
                aria-label={ariaLabel}
                className="field-help-popover field-help-popover--portal"
                id={tipId}
                ref={(node) => {
                  bubbleRef.current = node;
                }}
                role="dialog"
                style={bubbleStyle}
              >
                {tip}
              </div>,
              document.body,
            )
          : null}
      </span>
    );
  }

  return (
    <span
      aria-label={ariaLabel}
      className={["tooltip-wrap", "field-help-tip", className].filter(Boolean).join(" ")}
      onBlur={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      ref={rootRef}
      tabIndex={0}
    >
      <CircleHelp aria-hidden="true" size={size} />
      {open
        ? createPortal(
            <span
              aria-hidden="true"
              className="tooltip-bubble tooltip-bubble--portal"
              ref={(node) => {
                bubbleRef.current = node;
              }}
              style={bubbleStyle}
            >
              {tipText ?? ariaLabel}
            </span>,
            document.body,
          )
        : null}
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
