const STORAGE_KEY = "stock-sim.active-replay-session";

type ActiveSessionMap = Record<string, number>;

function readMap(): ActiveSessionMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as ActiveSessionMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function getActiveReplaySessionId(instrumentId: number): number | null {
  const value = readMap()[String(instrumentId)];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function setActiveReplaySessionId(instrumentId: number, sessionId: number) {
  const next = { ...readMap(), [String(instrumentId)]: sessionId };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function clearActiveReplaySessionId(instrumentId: number) {
  const next = { ...readMap() };
  delete next[String(instrumentId)];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function formatSessionUpdatedAt(value?: string | null) {
  if (!value) return "";
  const text = value.slice(0, 19).replace("T", " ");
  return text;
}

export function buildDefaultSessionName(code: string, name: string, sequence: number) {
  const stamp = new Date();
  const date = [
    stamp.getFullYear(),
    String(stamp.getMonth() + 1).padStart(2, "0"),
    String(stamp.getDate()).padStart(2, "0"),
  ].join("-");
  return `${code} ${name} 复盘 #${sequence} · ${date}`;
}
