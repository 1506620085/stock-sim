/**
 * ToastProvider
 * 全局 Toast 容器：订阅 toast 状态并渲染成功/错误/信息提示栈，需挂在应用根节点。
 */
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { useEffect, useState } from "react";
import { dismissToast, subscribeToasts, type ToastItem, type ToastKind } from "./toast";

const iconByKind: Record<ToastKind, typeof AlertCircle> = {
  error: AlertCircle,
  success: CheckCircle2,
  info: Info,
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    return subscribeToasts(setToasts);
  }, []);

  return (
    <>
      {children}
      <div aria-live="polite" className="toast-stack" role="region" aria-label="系统提示">
        {toasts.map((toast) => {
          const Icon = iconByKind[toast.kind];
          return (
            <article className={`toast toast-${toast.kind}`} key={toast.id} role="status">
              <Icon aria-hidden="true" size={18} strokeWidth={2} />
              <p>{toast.message}</p>
              <button aria-label="关闭提示" className="toast-close" onClick={() => dismissToast(toast.id)} type="button">
                <X size={16} />
              </button>
            </article>
          );
        })}
      </div>
    </>
  );
}

export { showError, showInfo, showSuccess, notifyError, toUserMessage } from "./toast";
