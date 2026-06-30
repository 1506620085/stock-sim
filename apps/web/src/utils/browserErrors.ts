const BENIGN_ERROR_PATTERNS = ["ResizeObserver loop completed with undelivered notifications", "ResizeObserver loop limit exceeded"];

export function isBenignBrowserError(message: unknown) {
  const text = String(message ?? "");
  return BENIGN_ERROR_PATTERNS.some((pattern) => text.includes(pattern));
}
