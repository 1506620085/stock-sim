const configuredBase = import.meta.env.VITE_API_BASE_URL?.toString().replace(/\/$/, "") ?? "";

/** 默认空字符串，开发/预览时走 Vite `/api` 代理；生产可设 VITE_API_BASE_URL 或由 Nginx 同域转发。 */
export const API_BASE = configuredBase;

export async function extractErrorMessage(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { detail?: string | Array<{ msg?: string }> };
    if (typeof payload.detail === "string") return payload.detail;
    if (Array.isArray(payload.detail)) {
      return payload.detail.map((item) => item.msg).filter(Boolean).join("；") || response.statusText;
    }
  } catch {
    // ignore parse errors
  }
  return response.statusText || "请求失败";
}
