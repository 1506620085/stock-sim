/**
 * subIndicators
 * 副图指标槽位：数量、各副图所选指标、本地持久化。
 */
export type SubIndicatorId = "VOL" | "MACD" | "KDJ" | "BOLL";

export const SUB_INDICATOR_OPTIONS: Array<{ id: SubIndicatorId; name: string; shortName: string }> = [
  { id: "VOL", name: "成交量", shortName: "VOL" },
  { id: "MACD", name: "MACD", shortName: "MACD" },
  { id: "KDJ", name: "KDJ", shortName: "KDJ" },
  { id: "BOLL", name: "BOLL", shortName: "BOLL" },
];

export const SUB_CHART_COUNT_MIN = 1;
export const SUB_CHART_COUNT_MAX = 4;

export type SubIndicatorState = {
  /** 显示的副图数量 1–4；0 表示关闭全部副图 */
  count: number;
  /** 各副图槽位指标（长度固定为 4，实际取前 count 个） */
  slots: [SubIndicatorId, SubIndicatorId, SubIndicatorId, SubIndicatorId];
};

export const defaultSubIndicatorState: SubIndicatorState = {
  count: 3,
  slots: ["VOL", "BOLL", "KDJ", "MACD"],
};

const STORAGE_KEY = "stock-sim.sub-indicator";

const ALL_IDS = SUB_INDICATOR_OPTIONS.map((item) => item.id);

function isSubIndicatorId(value: unknown): value is SubIndicatorId {
  return typeof value === "string" && ALL_IDS.includes(value as SubIndicatorId);
}

function normalizeSlots(raw: unknown): SubIndicatorState["slots"] {
  const defaults = defaultSubIndicatorState.slots;
  const list = Array.isArray(raw) ? raw : [];
  const next: SubIndicatorId[] = [];

  for (let i = 0; i < 4; i += 1) {
    const candidate = list[i];
    next.push(isSubIndicatorId(candidate) ? candidate : defaults[i] ?? "VOL");
  }

  return next as SubIndicatorState["slots"];
}

export function normalizeSubIndicatorState(state: Partial<SubIndicatorState> | undefined): SubIndicatorState {
  const countRaw = Number(state?.count);
  const count = Number.isFinite(countRaw)
    ? Math.min(SUB_CHART_COUNT_MAX, Math.max(0, Math.round(countRaw)))
    : defaultSubIndicatorState.count;
  return {
    count,
    slots: normalizeSlots(state?.slots),
  };
}

export function loadSubIndicatorState(): SubIndicatorState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(defaultSubIndicatorState);
    return normalizeSubIndicatorState(JSON.parse(raw) as Partial<SubIndicatorState>);
  } catch {
    return structuredClone(defaultSubIndicatorState);
  }
}

export function saveSubIndicatorState(state: SubIndicatorState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeSubIndicatorState(state)));
}

export function subIndicatorShortName(id: SubIndicatorId) {
  return SUB_INDICATOR_OPTIONS.find((item) => item.id === id)?.shortName ?? id;
}

export function subIndicatorName(id: SubIndicatorId) {
  return SUB_INDICATOR_OPTIONS.find((item) => item.id === id)?.name ?? id;
}

export function subChartOrdinalLabel(index: number) {
  const labels = ["第一副图", "第二副图", "第三副图", "第四副图"];
  return labels[index] ?? `副图${index + 1}`;
}

/** 有效副图列表（按槽位顺序） */
export function getActiveSubSlots(state: SubIndicatorState): SubIndicatorId[] {
  const normalized = normalizeSubIndicatorState(state);
  return normalized.slots.slice(0, normalized.count);
}

/** 将某副图切换为指定指标（各副图互不排斥，可重复） */
export function assignSubSlot(
  state: SubIndicatorState,
  slotIndex: number,
  indicatorId: SubIndicatorId,
): SubIndicatorState {
  const next = normalizeSubIndicatorState(state);
  if (slotIndex < 0 || slotIndex >= next.count) return next;
  if (next.slots[slotIndex] === indicatorId) return next;
  const slots = [...next.slots] as SubIndicatorState["slots"];
  slots[slotIndex] = indicatorId;
  return { ...next, slots };
}

export function setSubChartCount(state: SubIndicatorState, count: number): SubIndicatorState {
  return normalizeSubIndicatorState({
    ...state,
    count: Math.min(SUB_CHART_COUNT_MAX, Math.max(0, Math.round(count))),
  });
}
