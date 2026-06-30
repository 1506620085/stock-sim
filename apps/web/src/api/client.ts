import { showError } from "../components/toast";

const configuredBase = import.meta.env.VITE_API_BASE_URL?.toString().replace(/\/$/, "") ?? "";

/** 默认空字符串，开发/预览时走 Vite `/api` 代理；生产可设 VITE_API_BASE_URL 或由 Nginx 同域转发。 */
export const API_BASE = configuredBase;

export type ApiFetchOptions = {
  /** 为 true 时不弹出错误提示，由调用方自行处理。 */
  silent?: boolean;
};

export type ApiError = Error & { notified?: boolean };

function createApiError(message: string, notified: boolean): ApiError {
  const error = new Error(message) as ApiError;
  error.notified = notified;
  return error;
}

export async function extractErrorMessage(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { detail?: string | Array<{ msg?: string }> };
    if (typeof payload.detail === "string" && payload.detail.trim()) return payload.detail;
    if (Array.isArray(payload.detail)) {
      const message = payload.detail.map((item) => item.msg).filter(Boolean).join("；");
      if (message) return message;
    }
  } catch {
    // 代理或网关错误可能返回非 JSON 响应
  }

  if (response.status === 503) {
    return "服务暂时不可用，请确认后端已启动或稍后重试";
  }
  if (response.status === 502 || response.status === 504) {
    return "无法连接后端服务，请确认 API 已启动";
  }

  return response.statusText || `请求失败（${response.status}）`;
}

export async function apiFetch(input: RequestInfo | URL, init?: RequestInit, options: ApiFetchOptions = {}): Promise<Response> {
  let response: Response;

  try {
    response = await fetch(input, init);
  } catch {
    const message = "无法连接服务器，请确认后端已启动且网络正常";
    if (!options.silent) showError(message);
    throw createApiError(message, !options.silent);
  }

  if (!response.ok) {
    const message = await extractErrorMessage(response);
    if (!options.silent) showError(message);
    throw createApiError(message, !options.silent);
  }

  return response;
}

export async function apiJson<T>(input: RequestInfo | URL, init?: RequestInit, options?: ApiFetchOptions): Promise<T> {
  const response = await apiFetch(input, init, options);
  return response.json() as Promise<T>;
}
