import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ToastProvider, notifyError } from "./components/ToastProvider";
import type { ApiError } from "./api/client";
import { isBenignBrowserError } from "./utils/browserErrors";
import "./styles.css";

window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason as ApiError | undefined;
  if (reason?.notified || isBenignBrowserError(reason instanceof Error ? reason.message : reason)) {
    event.preventDefault();
    return;
  }
  notifyError(event.reason, "发生未预期的系统错误");
});

window.addEventListener("error", (event) => {
  if (isBenignBrowserError(event.message)) {
    event.preventDefault();
    return;
  }
  notifyError(event.error ?? event.message, "页面运行出错");
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </StrictMode>,
);
