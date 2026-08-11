/**
 * subIndicatorParams
 * 副图指标参数 schema、默认值与规范化。
 */
import type { SubIndicatorId } from "./subIndicators";

export type SubParamField = {
  label: string;
  unit?: string;
  min: number;
  max: number;
  step?: number;
};

export type SubParamSchema = {
  title: string;
  fields: SubParamField[];
  defaults: number[];
  hint: (values: number[]) => string;
};

const period = (label: string, min = 2, max = 500): SubParamField => ({
  label,
  unit: "日",
  min,
  max,
});

export const SUB_INDICATOR_PARAM_SCHEMAS: Partial<Record<SubIndicatorId, SubParamSchema>> = {
  VOL: {
    title: "VOL参数设置",
    fields: [period("成交量均线1"), period("成交量均线2"), period("成交量均线3")],
    defaults: [5, 10, 20],
    hint: (v) => `设置说明：VOL 中的 ${v.join("、")} 分别代表成交量均线周期`,
  },
  MACD: {
    title: "MACD参数设置",
    fields: [period("短期", 2, 200), period("长期", 2, 200), period("DEA", 2, 200)],
    defaults: [12, 26, 9],
    hint: (v) => `设置说明：MACD（${v.join(", ")}）中的参数分别代表快线、慢线与 DEA 周期`,
  },
  KDJ: {
    title: "KDJ参数设置",
    fields: [period("计算周期", 2, 200), period("K值平滑", 1, 100), period("D值平滑", 1, 100)],
    defaults: [9, 3, 3],
    hint: (v) => `设置说明：KDJ（${v.join(", ")}）中的参数分别代表 RSV 周期、K 平滑与 D 平滑`,
  },
  BOLL: {
    title: "BOLL参数设置",
    fields: [period("布林线", 2, 500), { label: "标准差倍数", min: 0.1, max: 10, step: 0.1 }],
    defaults: [20, 2],
    hint: (v) => `设置说明：BOLL（${v[0]}）中的 ${v[0]} 代表布林线周期，${v[1]} 为标准差倍数`,
  },
  ENE: {
    title: "ENE参数设置",
    fields: [
      { label: "上轨线 (UPPER)", unit: "%", min: 2, max: 120 },
      period("日移动平均线", 2, 999),
      { label: "下轨线 (LOWER)", unit: "%", min: 2, max: 120 },
    ],
    // 存储顺序与界面一致：上轨%、周期、下轨%
    defaults: [11, 10, 9],
    hint: (v) =>
      `设置说明：ENE (${v[0]}, ${v[1]}, ${v[2]}) 中的参数分别代表上轨、中轨周期、下轨`,
  },
  RSI: {
    title: "RSI参数设置",
    fields: [period("RSI1"), period("RSI2"), period("RSI3")],
    defaults: [6, 12, 24],
    hint: (v) => `设置说明：RSI 参数 ${v.join("、")} 分别代表三条 RSI 线的计算周期`,
  },
  DMI: {
    title: "DMI参数设置",
    fields: [period("计算周期"), period("ADXR平滑")],
    defaults: [14, 6],
    hint: (v) => `设置说明：DMI（${v.join(", ")}）分别代表趋向计算周期与 ADXR 平滑周期`,
  },
  DMA: {
    title: "DMA参数设置",
    fields: [period("短期均线"), period("长期均线"), period("DMA均线")],
    defaults: [10, 50, 10],
    hint: (v) => `设置说明：DMA（${v.join(", ")}）分别代表短期、长期与 DMA 均线周期`,
  },
  TRIX: {
    title: "TRIX参数设置",
    fields: [period("TRIX周期"), period("MATRIX周期")],
    defaults: [12, 9],
    hint: (v) => `设置说明：TRIX（${v.join(", ")}）分别代表 TRIX 与 MATRIX 周期`,
  },
  BRAR: {
    title: "BRAR参数设置",
    fields: [period("计算周期")],
    defaults: [26],
    hint: (v) => `设置说明：BRAR（${v[0]}）中的 ${v[0]} 代表情绪指标计算周期`,
  },
  VR: {
    title: "VR参数设置",
    fields: [period("计算周期"), period("均线周期")],
    defaults: [26, 6],
    hint: (v) => `设置说明：VR（${v.join(", ")}）分别代表 VR 周期与均线周期`,
  },
  OBV: {
    title: "OBV参数设置",
    fields: [period("均线周期")],
    defaults: [30],
    hint: (v) => `设置说明：OBV（${v[0]}）中的 ${v[0]} 代表能量潮均线周期`,
  },
  BIAS: {
    title: "BIAS参数设置",
    fields: [period("BIAS1"), period("BIAS2"), period("BIAS3")],
    defaults: [6, 12, 24],
    hint: (v) => `设置说明：BIAS 参数 ${v.join("、")} 分别代表三条乖离率周期`,
  },
  CCI: {
    title: "CCI参数设置",
    fields: [period("计算周期")],
    defaults: [20],
    hint: (v) => `设置说明：CCI（${v[0]}）中的 ${v[0]} 代表顺势指标计算周期`,
  },
  CR: {
    title: "CR参数设置",
    fields: [
      period("计算周期"),
      period("均线1"),
      period("均线2"),
      period("均线3"),
      period("均线4"),
    ],
    defaults: [26, 10, 20, 40, 60],
    hint: (v) => `设置说明：CR（${v.join(", ")}）分别代表 CR 周期与四条均线周期`,
  },
  EMV: {
    title: "EMV参数设置",
    fields: [period("计算周期"), period("均线周期")],
    defaults: [14, 9],
    hint: (v) => `设置说明：EMV（${v.join(", ")}）分别代表 EMV 与均线周期`,
  },
  MTM: {
    title: "MTM参数设置",
    fields: [period("计算周期"), period("均线周期")],
    defaults: [12, 6],
    hint: (v) => `设置说明：MTM（${v.join(", ")}）分别代表动量周期与均线周期`,
  },
  PSY: {
    title: "PSY参数设置",
    fields: [period("计算周期"), period("均线周期")],
    defaults: [12, 6],
    hint: (v) => `设置说明：PSY（${v.join(", ")}）分别代表心理线周期与均线周期`,
  },
  ROC: {
    title: "ROC参数设置",
    fields: [period("计算周期"), period("均线周期")],
    defaults: [12, 6],
    hint: (v) => `设置说明：ROC（${v.join(", ")}）分别代表变动率周期与均线周期`,
  },
  WR: {
    title: "WR参数设置",
    fields: [period("WR1"), period("WR2"), period("WR3")],
    defaults: [6, 10, 14],
    hint: (v) => `设置说明：WR 参数 ${v.join("、")} 分别代表三条威廉指标周期`,
  },
  AO: {
    title: "AO参数设置",
    fields: [period("短期"), period("长期")],
    defaults: [5, 34],
    hint: (v) => `设置说明：AO（${v.join(", ")}）分别代表短期与长期中间价均线周期`,
  },
};

export type SubIndicatorParams = Partial<Record<SubIndicatorId, number[]>>;

export function defaultSubIndicatorParams(): SubIndicatorParams {
  const next: SubIndicatorParams = {};
  for (const [id, schema] of Object.entries(SUB_INDICATOR_PARAM_SCHEMAS) as Array<
    [SubIndicatorId, SubParamSchema]
  >) {
    next[id] = [...schema.defaults];
  }
  return next;
}

function clampNumber(value: unknown, fallback: number, min: number, max: number, step = 1) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  const rounded = step >= 1 ? Math.round(n) : Math.round(n / step) * step;
  return Math.min(max, Math.max(min, Number(rounded.toFixed(4))));
}

export function normalizeSubIndicatorParams(raw: unknown): SubIndicatorParams {
  const source = raw && typeof raw === "object" ? (raw as SubIndicatorParams) : {};
  const next: SubIndicatorParams = {};
  for (const [id, schema] of Object.entries(SUB_INDICATOR_PARAM_SCHEMAS) as Array<
    [SubIndicatorId, SubParamSchema]
  >) {
    const list = Array.isArray(source[id]) ? source[id]! : schema.defaults;
    next[id] = schema.fields.map((field, index) =>
      clampNumber(list[index], schema.defaults[index], field.min, field.max, field.step ?? 1),
    );
  }
  return next;
}

export function getSubIndicatorCalcParams(
  params: SubIndicatorParams | undefined,
  id: SubIndicatorId,
): number[] | undefined {
  const schema = SUB_INDICATOR_PARAM_SCHEMAS[id];
  if (!schema) return undefined;
  const values = normalizeSubIndicatorParams(params)[id] ?? schema.defaults;

  // ENE 存储 [upper, period, lower]，calcParams 为 [period, upper, lower]
  if (id === "ENE") {
    return [values[1], values[0], values[2]];
  }
  return values;
}

export function hasSubIndicatorParams(id: SubIndicatorId) {
  return Boolean(SUB_INDICATOR_PARAM_SCHEMAS[id]);
}
