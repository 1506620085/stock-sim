/**
 * AppDialog
 * 通用确认 / 输入对话框：遮罩、Esc 关闭、取消与确认操作，供各业务页复用。
 */
import { useEffect, useId, useRef, type ReactNode } from "react";

type AppDialogShellProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  confirm?: boolean;
  className?: string;
};

export function AppDialogShell({ open, title, onClose, children, confirm = false, className = "" }: AppDialogShellProps) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="app-dialog-backdrop" onClick={onClose} role="presentation">
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className={["app-dialog", confirm ? "app-dialog--confirm" : "", className].filter(Boolean).join(" ")}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <h2 className="app-dialog-title" id={titleId}>
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}

export type AppConfirmDialogProps = {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function AppConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "确定",
  cancelLabel = "取消",
  danger = false,
  onConfirm,
  onCancel,
}: AppConfirmDialogProps) {
  return (
    <AppDialogShell confirm open={open} onClose={onCancel} title={title}>
      <div className="app-dialog-copy">{message}</div>
      <div className="app-dialog-actions">
        <button className="secondary-button" onClick={onCancel} type="button">
          {cancelLabel}
        </button>
        <button className={`primary-button${danger ? " danger-confirm-button" : ""}`} onClick={onConfirm} type="button">
          {confirmLabel}
        </button>
      </div>
    </AppDialogShell>
  );
}

export type AppPromptDialogProps = {
  open: boolean;
  title: string;
  label?: string;
  value: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onChange: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
};

export function AppPromptDialog({
  open,
  title,
  label = "名称",
  value,
  placeholder,
  confirmLabel = "确定",
  cancelLabel = "取消",
  onChange,
  onConfirm,
  onCancel,
}: AppPromptDialogProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  return (
    <AppDialogShell open={open} onClose={onCancel} title={title}>
      <label className="app-dialog-field">
        {label}
        <input
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onConfirm();
            }
          }}
          placeholder={placeholder}
          ref={inputRef}
          type="text"
          value={value}
        />
      </label>
      <div className="app-dialog-actions">
        <button className="secondary-button" onClick={onCancel} type="button">
          {cancelLabel}
        </button>
        <button className="primary-button" onClick={onConfirm} type="button">
          {confirmLabel}
        </button>
      </div>
    </AppDialogShell>
  );
}
