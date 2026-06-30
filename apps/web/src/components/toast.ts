export type ToastKind = "error" | "success" | "info";

export type ToastItem = {
  id: string;
  kind: ToastKind;
  message: string;
};

type ToastListener = (items: ToastItem[]) => void;

const DEFAULT_DURATION_MS: Record<ToastKind, number> = {
  error: 6000,
  success: 3200,
  info: 4200,
};

let items: ToastItem[] = [];
const listeners = new Set<ToastListener>();

function emit() {
  listeners.forEach((listener) => listener([...items]));
}

export function subscribeToasts(listener: ToastListener) {
  listeners.add(listener);
  listener([...items]);
  return () => {
    listeners.delete(listener);
  };
}

export function dismissToast(id: string) {
  items = items.filter((item) => item.id !== id);
  emit();
}

export function pushToast(kind: ToastKind, message: string, durationMs = DEFAULT_DURATION_MS[kind]) {
  const text = message.trim();
  if (!text) return;

  const toast: ToastItem = { id: crypto.randomUUID(), kind, message: text };
  items = [...items, toast];
  emit();

  window.setTimeout(() => dismissToast(toast.id), durationMs);
}

export function showError(message: string) {
  pushToast("error", message);
}

export function showSuccess(message: string) {
  pushToast("success", message);
}

export function showInfo(message: string) {
  pushToast("info", message);
}

export function toUserMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  if (typeof error === "string" && error.trim()) return error.trim();
  return fallback;
}

export function notifyError(error: unknown, fallback = "操作失败") {
  showError(toUserMessage(error, fallback));
}
