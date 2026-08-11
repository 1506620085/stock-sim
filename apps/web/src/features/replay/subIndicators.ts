/**
 * subIndicators
 * 副图指标目录、常用收藏、槽位配置与本地持久化。
 */
import {
  defaultSubIndicatorParams,
  normalizeSubIndicatorParams,
  type SubIndicatorParams,
} from "./subIndicatorParams";

export type { SubIndicatorParams } from "./subIndicatorParams";
export {
  SUB_INDICATOR_PARAM_SCHEMAS,
  getSubIndicatorCalcParams,
  hasSubIndicatorParams,
} from "./subIndicatorParams";

export type SubIndicatorId =
  | "VOL"
  | "MACD"
  | "KDJ"
  | "BOLL"
  | "ENE"
  | "RSI"
  | "DMI"
  | "DMA"
  | "TRIX"
  | "BRAR"
  | "VR"
  | "OBV"
  | "BIAS"
  | "CCI"
  | "CR"
  | "EMV"
  | "MTM"
  | "PSY"
  | "ROC"
  | "WR"
  | "AO"
  | "PVT";

export type SubIndicatorMeta = {
  id: SubIndicatorId;
  /** 切换条短文案 */
  name: string;
  /** 按钮简称 */
  shortName: string;
  /** 设置列表全称，如 VOL成交量 */
  fullName: string;
  /** 常用列表中不可移除 */
  pinned?: boolean;
};

/** 全部可选副图指标（内置 + 自定义 ENE） */
export const SUB_INDICATOR_CATALOG: SubIndicatorMeta[] = [
  { id: "VOL", name: "成交量", shortName: "VOL", fullName: "VOL成交量", pinned: true },
  { id: "MACD", name: "MACD", shortName: "MACD", fullName: "MACD平滑异同平均", pinned: true },
  { id: "KDJ", name: "KDJ", shortName: "KDJ", fullName: "KDJ随机指标" },
  { id: "BOLL", name: "BOLL", shortName: "BOLL", fullName: "BOLL布林线指标" },
  { id: "ENE", name: "ENE", shortName: "ENE", fullName: "ENE轨道线" },
  { id: "RSI", name: "RSI", shortName: "RSI", fullName: "RSI相对强弱指标" },
  { id: "DMI", name: "DMI", shortName: "DMI", fullName: "DMI趋向指标" },
  { id: "DMA", name: "DMA", shortName: "DMA", fullName: "DMA平均线差" },
  { id: "TRIX", name: "TRIX", shortName: "TRIX", fullName: "TRIX三重指数平滑" },
  { id: "BRAR", name: "BRAR", shortName: "BRAR", fullName: "BRAR情绪指标" },
  { id: "VR", name: "VR", shortName: "VR", fullName: "VR成交量变异率" },
  { id: "OBV", name: "OBV", shortName: "OBV", fullName: "OBV能量潮" },
  { id: "BIAS", name: "BIAS", shortName: "BIAS", fullName: "BIAS乖离率" },
  { id: "CCI", name: "CCI", shortName: "CCI", fullName: "CCI顺势指标" },
  { id: "CR", name: "CR", shortName: "CR", fullName: "CR能量指标" },
  { id: "EMV", name: "EMV", shortName: "EMV", fullName: "EMV简易波动" },
  { id: "MTM", name: "MTM", shortName: "MTM", fullName: "MTM动量指标" },
  { id: "PSY", name: "PSY", shortName: "PSY", fullName: "PSY心理线" },
  { id: "ROC", name: "ROC", shortName: "ROC", fullName: "ROC变动率" },
  { id: "WR", name: "WR", shortName: "WR", fullName: "WR威廉指标" },
  { id: "AO", name: "AO", shortName: "AO", fullName: "AO动量震荡" },
  { id: "PVT", name: "PVT", shortName: "PVT", fullName: "PVT价量趋势" },
];

/** @deprecated 使用 getFavoriteSubIndicatorOptions */
export const SUB_INDICATOR_OPTIONS = SUB_INDICATOR_CATALOG.filter((item) =>
  (["VOL", "MACD", "KDJ", "BOLL"] as SubIndicatorId[]).includes(item.id),
);

export const SUB_CHART_COUNT_MIN = 1;
export const SUB_CHART_COUNT_MAX = 4;
export const SUB_FAVORITE_MIN = 1;

export type SubIndicatorState = {
  /** 显示的副图数量 1–4；0 表示关闭全部副图 */
  count: number;
  /** 各副图槽位指标（长度固定为 4，实际取前 count 个） */
  slots: [SubIndicatorId, SubIndicatorId, SubIndicatorId, SubIndicatorId];
  /** 「常用指标」快捷切换列表 */
  favorites: SubIndicatorId[];
  /** 各副图指标参数 */
  params: SubIndicatorParams;
};

export const DEFAULT_SUB_FAVORITES: SubIndicatorId[] = ["VOL", "MACD", "KDJ", "BOLL"];

export const defaultSubIndicatorState: SubIndicatorState = {
  count: 3,
  slots: ["VOL", "BOLL", "KDJ", "MACD"],
  favorites: [...DEFAULT_SUB_FAVORITES],
  params: defaultSubIndicatorParams(),
};

const STORAGE_KEY = "stock-sim.sub-indicator";

const ALL_IDS = SUB_INDICATOR_CATALOG.map((item) => item.id);
const META_BY_ID = new Map(SUB_INDICATOR_CATALOG.map((item) => [item.id, item]));

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

function normalizeFavorites(raw: unknown): SubIndicatorId[] {
  const list = Array.isArray(raw) ? raw : DEFAULT_SUB_FAVORITES;
  const next: SubIndicatorId[] = [];
  const seen = new Set<SubIndicatorId>();

  for (const item of list) {
    if (!isSubIndicatorId(item) || seen.has(item)) continue;
    next.push(item);
    seen.add(item);
  }

  for (const id of DEFAULT_SUB_FAVORITES) {
    if (next.length >= SUB_FAVORITE_MIN) break;
    if (seen.has(id)) continue;
    next.push(id);
    seen.add(id);
  }

  if (!next.length) next.push("VOL");
  return next;
}

export function normalizeSubIndicatorState(state: Partial<SubIndicatorState> | undefined): SubIndicatorState {
  const countRaw = Number(state?.count);
  const count = Number.isFinite(countRaw)
    ? Math.min(SUB_CHART_COUNT_MAX, Math.max(0, Math.round(countRaw)))
    : defaultSubIndicatorState.count;
  const favorites = normalizeFavorites(state?.favorites);
  const slots = normalizeSlots(state?.slots).map((id) =>
    favorites.includes(id) ? id : favorites[0] ?? "VOL",
  ) as SubIndicatorState["slots"];

  return {
    count,
    slots,
    favorites,
    params: normalizeSubIndicatorParams(state?.params),
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

export function getSubIndicatorMeta(id: SubIndicatorId) {
  return META_BY_ID.get(id);
}

export function subIndicatorShortName(id: SubIndicatorId) {
  return getSubIndicatorMeta(id)?.shortName ?? id;
}

export function subIndicatorName(id: SubIndicatorId) {
  return getSubIndicatorMeta(id)?.name ?? id;
}

export function subIndicatorFullName(id: SubIndicatorId) {
  return getSubIndicatorMeta(id)?.fullName ?? id;
}

export function subChartOrdinalLabel(index: number) {
  const labels = ["第一副图", "第二副图", "第三副图", "第四副图"];
  return labels[index] ?? `副图${index + 1}`;
}

export function getFavoriteSubIndicatorOptions(state: SubIndicatorState): SubIndicatorMeta[] {
  const favorites = normalizeSubIndicatorState(state).favorites;
  return favorites
    .map((id) => getSubIndicatorMeta(id))
    .filter((item): item is SubIndicatorMeta => Boolean(item));
}

export function getUnselectedSubIndicatorOptions(state: SubIndicatorState): SubIndicatorMeta[] {
  const favorites = new Set(normalizeSubIndicatorState(state).favorites);
  return SUB_INDICATOR_CATALOG.filter((item) => !favorites.has(item.id));
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
  if (!next.favorites.includes(indicatorId)) return next;
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

export function addFavoriteSubIndicator(state: SubIndicatorState, id: SubIndicatorId): SubIndicatorState {
  const next = normalizeSubIndicatorState(state);
  if (next.favorites.includes(id)) return next;
  return normalizeSubIndicatorState({
    ...next,
    favorites: [...next.favorites, id],
  });
}

export function removeFavoriteSubIndicator(state: SubIndicatorState, id: SubIndicatorId): SubIndicatorState {
  const next = normalizeSubIndicatorState(state);
  const meta = getSubIndicatorMeta(id);
  if (meta?.pinned) return next;
  if (next.favorites.length <= SUB_FAVORITE_MIN) return next;
  if (!next.favorites.includes(id)) return next;

  const favorites = next.favorites.filter((item) => item !== id);
  const fallback = favorites[0] ?? "VOL";
  const slots = next.slots.map((slot) => (slot === id ? fallback : slot)) as SubIndicatorState["slots"];
  return normalizeSubIndicatorState({ ...next, favorites, slots });
}

export function updateSubIndicatorParams(
  state: SubIndicatorState,
  id: SubIndicatorId,
  values: number[],
): SubIndicatorState {
  const next = normalizeSubIndicatorState(state);
  return normalizeSubIndicatorState({
    ...next,
    params: {
      ...next.params,
      [id]: values,
    },
  });
}

export function resetSubIndicatorParams(state: SubIndicatorState, id: SubIndicatorId): SubIndicatorState {
  const defaults = defaultSubIndicatorParams();
  return updateSubIndicatorParams(state, id, defaults[id] ?? []);
}
