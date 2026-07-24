/**
 * mainIndicators
 * 主图指标（裸K / MA / BOLL / BBI / EXPMA / ENE / DKX）的类型、默认参数与本地持久化。
 */
export type MainIndicatorId = "none" | "MA" | "BOLL" | "BBI" | "EXPMA" | "ENE" | "DKX";

export type MaParams = { periods: [number, number, number] };
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

export const defaultMainIndicatorParams: MainIndicatorParams = {
  MA: { periods: [5, 10, 20] },
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

function normalizeParams(raw: Partial<MainIndicatorParams> | undefined): MainIndicatorParams {
  const d = defaultMainIndicatorParams;
  const ma = raw?.MA?.periods;
  const boll = raw?.BOLL;
  const bbi = raw?.BBI?.periods;
  const expma = raw?.EXPMA?.periods;
  const ene = raw?.ENE;
  const dkx = raw?.DKX;
  return {
    MA: {
      periods: [
        clampPeriod(ma?.[0], d.MA.periods[0]),
        clampPeriod(ma?.[1], d.MA.periods[1]),
        clampPeriod(ma?.[2], d.MA.periods[2]),
      ],
    },
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
