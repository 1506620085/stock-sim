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
  /** 说明弹层标题 */
  helpTitle: string;
  /** 说明弹层正文 */
  helpBody: string;
  /** 常用列表中不可移除 */
  pinned?: boolean;
};

/** 全部可选副图指标（内置 + 自定义 ENE） */
export const SUB_INDICATOR_CATALOG: SubIndicatorMeta[] = [
  {
    id: "VOL",
    name: "成交量",
    shortName: "VOL",
    fullName: "VOL成交量",
    helpTitle: "VOL成交量",
    helpBody: "成交量反映市场交投活跃程度。量价配合常用于判断趋势是否得到资金认可，放量突破与缩量调整是常见观察点。",
    pinned: true,
  },
  {
    id: "MACD",
    name: "MACD",
    shortName: "MACD",
    fullName: "MACD平滑异同平均",
    helpTitle: "MACD平滑异同平均",
    helpBody: "MACD由快慢线差值与其平滑线构成，用于观察趋势强弱与拐点。金叉、死叉及柱状线零轴上下变化，常作为趋势跟踪参考。",
    pinned: true,
  },
  {
    id: "KDJ",
    name: "KDJ",
    shortName: "KDJ",
    fullName: "KDJ随机指标",
    helpTitle: "KDJ随机指标",
    helpBody: "KDJ根据一定周期内最高价、最低价与收盘价的关系衡量超买超卖。适合观察震荡市中的短线拐点，极端区域需结合趋势使用。",
  },
  {
    id: "BOLL",
    name: "BOLL",
    shortName: "BOLL",
    fullName: "BOLL布林线指标",
    helpTitle: "BOLL布林线指标",
    helpBody: "布林线由中轨均线与上下标准差轨道构成，用于观察价格波动区间。开口放大常对应波动加剧，收口则可能酝酿变盘。",
  },
  {
    id: "ENE",
    name: "ENE",
    shortName: "ENE",
    fullName: "ENE轨道线",
    helpTitle: "ENE轨道线",
    helpBody: "ENE以均线为中轨，按百分比上下扩展形成轨道。价格触及上轨或下轨时，常被用来观察短线压力与支撑。",
  },
  {
    id: "RSI",
    name: "RSI",
    shortName: "RSI",
    fullName: "RSI相对强弱指标",
    helpTitle: "RSI相对强弱指标",
    helpBody: "RSI通过比较上涨与下跌幅度衡量买卖力度。高位区域提示超买风险，低位区域提示超卖反弹可能，宜结合趋势确认。",
  },
  {
    id: "DMI",
    name: "DMI",
    shortName: "DMI",
    fullName: "DMI趋向指标",
    helpTitle: "DMI趋向指标",
    helpBody: "DMI通过+DI、-DI与ADX判断趋势方向与强度。ADX上行通常表示趋势增强，方向则由+DI与-DI的相对位置观察。",
  },
  {
    id: "DMA",
    name: "DMA",
    shortName: "DMA",
    fullName: "DMA平均线差",
    helpTitle: "DMA平均线差",
    helpBody: "DMA用短期与长期均线差值观察趋势偏离，再对其平滑得到辅助线。常用于跟踪中期趋势转折与强弱变化。",
  },
  {
    id: "TRIX",
    name: "TRIX",
    shortName: "TRIX",
    fullName: "TRIX三重指数平滑",
    helpTitle: "TRIX三重指数平滑",
    helpBody: "TRIX对收盘价进行三重指数平滑后计算变化率，用于过滤短期噪音、观察中长期趋势方向与交叉信号。",
  },
  {
    id: "BRAR",
    name: "BRAR",
    shortName: "BRAR",
    fullName: "BRAR情绪指标",
    helpTitle: "BRAR情绪指标",
    helpBody:
      "BRAR由人气指标(AR)和意愿指标(BR)构成，两个指标都是通过分析历史股价进行多空力量的对比，从而预测股价的未来走势。BRAR可帮助投资人有效地辨认高价及低价圈，并能够抓住局部底部，特别适合做反弹。",
  },
  {
    id: "VR",
    name: "VR",
    shortName: "VR",
    fullName: "VR成交量变异率",
    helpTitle: "VR成交量变异率",
    helpBody: "VR比较上涨日与下跌日成交量关系，用于衡量市场人气与买卖意愿。高位提示过热风险，低位提示人气低迷后的反转可能。",
  },
  {
    id: "OBV",
    name: "OBV",
    shortName: "OBV",
    fullName: "OBV能量潮",
    helpTitle: "OBV能量潮",
    helpBody: "OBV将成交量按涨跌方向累计，用于观察资金进出。价格与OBV同步常强化趋势，出现背离时需警惕转折风险。",
  },
  {
    id: "BIAS",
    name: "BIAS",
    shortName: "BIAS",
    fullName: "BIAS乖离率",
    helpTitle: "BIAS乖离率",
    helpBody: "乖离率衡量价格相对均线的偏离程度。偏离过大往往对应短线超买或超卖，常用于观察回归均线的交易机会。",
  },
  {
    id: "CCI",
    name: "CCI",
    shortName: "CCI",
    fullName: "CCI顺势指标",
    helpTitle: "CCI顺势指标",
    helpBody: "CCI衡量价格偏离统计平均值的程度，适合捕捉超买超卖与突破行情。绝对值过高时需结合趋势过滤假信号。",
  },
  {
    id: "CR",
    name: "CR",
    shortName: "CR",
    fullName: "CR能量指标",
    helpTitle: "CR能量指标",
    helpBody: "CR通过中间价相对前一日的强弱对比观察多空力量，并配合多条均线判断压力支撑，常用于波段高低区研判。",
  },
  {
    id: "EMV",
    name: "EMV",
    shortName: "EMV",
    fullName: "EMV简易波动",
    helpTitle: "EMV简易波动",
    helpBody: "EMV结合价格波动与成交量，衡量推动股价所需的量能效率。上升常表示上涨较轻松，下降则提示推动乏力。",
  },
  {
    id: "MTM",
    name: "MTM",
    shortName: "MTM",
    fullName: "MTM动量指标",
    helpTitle: "MTM动量指标",
    helpBody: "MTM比较当前价与N日前价格的差额，用于衡量上涨或下跌动量。配合其均线可观察动能衰减与增强。",
  },
  {
    id: "PSY",
    name: "PSY",
    shortName: "PSY",
    fullName: "PSY心理线",
    helpTitle: "PSY心理线",
    helpBody: "PSY统计一段时期内上涨天数占比，反映市场乐观或悲观情绪。极端高位或低位常作为情绪过热或过冷的参考。",
  },
  {
    id: "ROC",
    name: "ROC",
    shortName: "ROC",
    fullName: "ROC变动率",
    helpTitle: "ROC变动率",
    helpBody: "ROC衡量价格相对前值的百分比变化，用于跟踪动量强弱。与其均线交叉可辅助判断短线动能切换。",
  },
  {
    id: "WR",
    name: "WR",
    shortName: "WR",
    fullName: "WR威廉指标",
    helpTitle: "WR威廉指标",
    helpBody: "威廉指标根据周期内高低点衡量超买超卖位置。接近极端区域时，常用于观察短线反转或盘整突破前的风险。",
  },
  {
    id: "AO",
    name: "AO",
    shortName: "AO",
    fullName: "AO动量震荡",
    helpTitle: "AO动量震荡",
    helpBody: "AO用不同周期中间价均线之差衡量市场动量。柱状由负转正或由正转负时，常被用作动能转换的观察信号。",
  },
  {
    id: "PVT",
    name: "PVT",
    shortName: "PVT",
    fullName: "PVT价量趋势",
    helpTitle: "PVT价量趋势",
    helpBody: "PVT按价格涨跌幅加权累计成交量，用于跟踪价量趋势。与价格同向强化趋势判断，背离时提示动能可能减弱。",
  },
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
