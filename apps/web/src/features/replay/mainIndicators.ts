/**
 * mainIndicators
 * 主图指标（裸K / MA / BOLL / BBI / EXPMA / ENE / DKX）的类型、默认参数与本地持久化。
 */
export type MainIndicatorId = "none" | "MA" | "BOLL" | "BBI" | "EXPMA" | "ENE" | "DKX";

export const MA_LINE_COUNT = 8;
export const MA_PERIOD_MIN = 1;
export const MA_PERIOD_MAX = 900;

export type MaLineConfig = {
  period: number;
  color: string;
  enabled: boolean;
};

export type MaParams = { lines: MaLineConfig[] };
export type BollParams = { period: number; multiplier: number };
export type BbiParams = { periods: [number, number, number, number] };
export type ExpmaParams = { periods: [number, number] };
export type EneParams = { period: number; upperPercent: number; lowerPercent: number };
export type DkxParams = { midPeriod: number; maPeriod: number };

export type MainIndicatorParams = {
  MA: MaParams;
  BOLL: BollParams;
  BBI: BbiParams;
  EXPMA: ExpmaParams;
  ENE: EneParams;
  DKX: DkxParams;
};

export type MainIndicatorState = {
  active: MainIndicatorId;
  params: MainIndicatorParams;
};

export const MAIN_INDICATOR_OPTIONS: Array<{ id: MainIndicatorId; name: string; shortName: string }> = [
  { id: "none", name: "裸K线", shortName: "裸K" },
  { id: "MA", name: "MA 均线", shortName: "MA" },
  { id: "BOLL", name: "BOLL 布林线", shortName: "BOLL" },
  { id: "BBI", name: "BBI 多空指标", shortName: "BBI" },
  { id: "EXPMA", name: "EXPMA 指数平均线", shortName: "EXPMA" },
  { id: "ENE", name: "ENE 轨道线", shortName: "ENE" },
  { id: "DKX", name: "DKX 多空线", shortName: "DKX" },
];

/** 默认 8 条均线：周期 / 颜色 / 是否开启 */
export const DEFAULT_MA_LINES: MaLineConfig[] = [
  { period: 5, color: "#1677FF", enabled: true },
  { period: 10, color: "#22A06B", enabled: true },
  { period: 20, color: "#F18F01", enabled: true },
  { period: 30, color: "#EB2F96", enabled: false },
  { period: 60, color: "#722ED1", enabled: false },
  { period: 120, color: "#13C2C2", enabled: false },
  { period: 180, color: "#A855F7", enabled: false },
  { period: 360, color: "#B45309", enabled: false },
];

export const defaultMainIndicatorParams: MainIndicatorParams = {
  MA: { lines: structuredClone(DEFAULT_MA_LINES) },
  BOLL: { period: 20, multiplier: 2 },
  BBI: { periods: [3, 6, 12, 24] },
  EXPMA: { periods: [12, 50] },
  ENE: { period: 10, upperPercent: 11, lowerPercent: 9 },
  DKX: { midPeriod: 10, maPeriod: 10 },
};

export const defaultMainIndicatorState: MainIndicatorState = {
  active: "MA",
  params: structuredClone(defaultMainIndicatorParams),
};

const STORAGE_KEY = "stock-sim.main-indicator";

function clampPeriod(value: unknown, fallback: number, min = 2, max = 250) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function clampMaPeriod(value: unknown, fallback: number) {
  return clampPeriod(value, fallback, MA_PERIOD_MIN, MA_PERIOD_MAX);
}

function normalizeColor(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toUpperCase();
  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    const [, r, g, b] = trimmed;
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  return fallback;
}

function normalizeMaLines(raw: unknown): MaLineConfig[] {
  const defaults = DEFAULT_MA_LINES;
  const asRecord = raw && typeof raw === "object" ? (raw as { lines?: unknown; periods?: unknown }) : null;

  // 兼容旧版 { periods: [5,10,20] }
  if (Array.isArray(asRecord?.periods) && !Array.isArray(asRecord?.lines)) {
    const periods = asRecord.periods as unknown[];
    return defaults.map((item, index) => {
      if (index < periods.length) {
        return {
          period: clampMaPeriod(periods[index], item.period),
          color: item.color,
          enabled: true,
        };
      }
      return { ...item, enabled: false };
    });
  }

  const lines = Array.isArray(asRecord?.lines) ? asRecord.lines : Array.isArray(raw) ? raw : null;
  if (!Array.isArray(lines)) return structuredClone(defaults);

  return defaults.map((item, index) => {
    const line = lines[index] as Partial<MaLineConfig> | undefined;
    return {
      period: clampMaPeriod(line?.period, item.period),
      color: normalizeColor(line?.color, item.color),
      enabled: typeof line?.enabled === "boolean" ? line.enabled : item.enabled,
    };
  });
}

function normalizeParams(raw: Partial<MainIndicatorParams> | undefined): MainIndicatorParams {
  const d = defaultMainIndicatorParams;
  const boll = raw?.BOLL;
  const bbi = raw?.BBI?.periods;
  const expma = raw?.EXPMA?.periods;
  const ene = raw?.ENE;
  const dkx = raw?.DKX;
  return {
    MA: { lines: normalizeMaLines(raw?.MA) },
    BOLL: {
      period: clampPeriod(boll?.period, d.BOLL.period),
      multiplier: Math.min(10, Math.max(0.1, Number(boll?.multiplier ?? d.BOLL.multiplier) || d.BOLL.multiplier)),
    },
    BBI: {
      periods: [
        clampPeriod(bbi?.[0], d.BBI.periods[0]),
        clampPeriod(bbi?.[1], d.BBI.periods[1]),
        clampPeriod(bbi?.[2], d.BBI.periods[2]),
        clampPeriod(bbi?.[3], d.BBI.periods[3]),
      ],
    },
    EXPMA: {
      periods: [clampPeriod(expma?.[0], d.EXPMA.periods[0]), clampPeriod(expma?.[1], d.EXPMA.periods[1])],
    },
    ENE: {
      period: clampPeriod(ene?.period, d.ENE.period),
      upperPercent: Math.min(50, Math.max(0.1, Number(ene?.upperPercent ?? d.ENE.upperPercent) || d.ENE.upperPercent)),
      lowerPercent: Math.min(50, Math.max(0.1, Number(ene?.lowerPercent ?? d.ENE.lowerPercent) || d.ENE.lowerPercent)),
    },
    DKX: {
      midPeriod: clampPeriod(dkx?.midPeriod, d.DKX.midPeriod),
      maPeriod: clampPeriod(dkx?.maPeriod, d.DKX.maPeriod),
    },
  };
}

function normalizeActive(value: unknown): MainIndicatorId {
  const ids = MAIN_INDICATOR_OPTIONS.map((item) => item.id);
  return typeof value === "string" && ids.includes(value as MainIndicatorId) ? (value as MainIndicatorId) : "MA";
}

export function normalizeMainIndicatorState(state: MainIndicatorState): MainIndicatorState {
  return {
    active: normalizeActive(state.active),
    params: normalizeParams(state.params),
  };
}

export function loadMainIndicatorState(): MainIndicatorState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(defaultMainIndicatorState);
    const parsed = JSON.parse(raw) as Partial<MainIndicatorState>;
    return normalizeMainIndicatorState({
      active: normalizeActive(parsed.active),
      params: normalizeParams(parsed.params),
    });
  } catch {
    return structuredClone(defaultMainIndicatorState);
  }
}

export function saveMainIndicatorState(state: MainIndicatorState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeMainIndicatorState(state)));
}

export function mainIndicatorShortName(id: MainIndicatorId) {
  return MAIN_INDICATOR_OPTIONS.find((item) => item.id === id)?.shortName ?? "MA";
}

export function mainIndicatorFullName(id: MainIndicatorId) {
  return MAIN_INDICATOR_OPTIONS.find((item) => item.id === id)?.name ?? id;
}

export function getEnabledMaLines(params: MaParams): MaLineConfig[] {
  return params.lines.filter((line) => line.enabled);
}
