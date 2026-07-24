/**
 * registerCustomIndicators
 * 注册主图/副图自定义指标：BOLL、BBI、EXPMA、ENE、DKX。
 */
import { registerIndicator, type KLineData } from "klinecharts";

type LinePoint = Record<string, number | undefined>;

function sma(values: number[], period: number, index: number) {
  if (index + 1 < period) return undefined;
  let sum = 0;
  for (let i = index - period + 1; i <= index; i += 1) sum += values[i];
  return sum / period;
}

function ema(values: number[], period: number) {
  const result: Array<number | undefined> = [];
  const alpha = 2 / (period + 1);
  let prev: number | undefined;
  for (let i = 0; i < values.length; i += 1) {
    const value = values[i];
    if (prev === undefined) {
      if (i + 1 < period) {
        result.push(undefined);
        continue;
      }
      let sum = 0;
      for (let j = i - period + 1; j <= i; j += 1) sum += values[j];
      prev = sum / period;
      result.push(prev);
      continue;
    }
    prev = alpha * value + (1 - alpha) * prev;
    result.push(prev);
  }
  return result;
}

function getBollMd(dataList: KLineData[], ma: number) {
  let sum = 0;
  for (const data of dataList) {
    const closeMa = data.close - ma;
    sum += closeMa * closeMa;
  }
  return Math.sqrt(Math.abs(sum) / dataList.length);
}

let registered = false;

export function registerCustomIndicators() {
  if (registered) return;
  registered = true;

  registerIndicator({
    name: "BOLL",
    shortName: "BOLL",
    series: "normal",
    calcParams: [20, 2],
    precision: 3,
    shouldOhlc: true,
    figures: [
      { key: "mid", title: "BOLL: ", type: "line" },
      { key: "up", title: "UB: ", type: "line" },
      { key: "dn", title: "LB: ", type: "line" },
    ],
    calc: (dataList, indicator) => {
      const params = indicator.calcParams;
      const period = Number(params[0] ?? 20);
      const multiplier = Number(params[1] ?? 2);
      const start = period - 1;
      let closeSum = 0;

      return dataList.map((kLineData, index) => {
        const boll: LinePoint = {};
        closeSum += kLineData.close;
        if (index >= start) {
          boll.mid = closeSum / period;
          const md = getBollMd(dataList.slice(index - start, index + 1), boll.mid);
          boll.up = boll.mid + multiplier * md;
          boll.dn = boll.mid - multiplier * md;
          closeSum -= dataList[index - start].close;
        }
        return boll;
      });
    },
  });

  registerIndicator({
    name: "BBI",
    shortName: "BBI",
    series: "normal",
    calcParams: [3, 6, 12, 24],
    precision: 3,
    shouldOhlc: true,
    figures: [{ key: "bbi", title: "BBI: ", type: "line" }],
    calc: (dataList, indicator) => {
      const [p1, p2, p3, p4] = indicator.calcParams.map((item) => Number(item));
      const closes = dataList.map((item) => item.close);
      return dataList.map((_, index) => {
        const ma1 = sma(closes, p1, index);
        const ma2 = sma(closes, p2, index);
        const ma3 = sma(closes, p3, index);
        const ma4 = sma(closes, p4, index);
        if (ma1 == null || ma2 == null || ma3 == null || ma4 == null) return {};
        return { bbi: (ma1 + ma2 + ma3 + ma4) / 4 };
      });
    },
  });

  registerIndicator({
    name: "EXPMA",
    shortName: "EXPMA",
    series: "normal",
    calcParams: [12, 50],
    precision: 3,
    shouldOhlc: true,
    figures: [
      { key: "ma1", title: "EXPMA1: ", type: "line" },
      { key: "ma2", title: "EXPMA2: ", type: "line" },
    ],
    calc: (dataList, indicator) => {
      const [p1, p2] = indicator.calcParams.map((item) => Number(item));
      const closes = dataList.map((item) => item.close);
      const ema1 = ema(closes, p1);
      const ema2 = ema(closes, p2);
      return dataList.map((_, index) => ({
        ma1: ema1[index],
        ma2: ema2[index],
      }));
    },
  });

  registerIndicator({
    name: "ENE",
    shortName: "ENE",
    series: "normal",
    calcParams: [10, 11, 9],
    precision: 3,
    shouldOhlc: true,
    figures: [
      { key: "mid", title: "ENE: ", type: "line" },
      { key: "up", title: "UPPER: ", type: "line" },
      { key: "dn", title: "LOWER: ", type: "line" },
    ],
    calc: (dataList, indicator) => {
      const period = Number(indicator.calcParams[0] ?? 10);
      const upperPercent = Number(indicator.calcParams[1] ?? 11);
      const lowerPercent = Number(indicator.calcParams[2] ?? 9);
      const closes = dataList.map((item) => item.close);
      return dataList.map((_, index) => {
        const mid = sma(closes, period, index);
        if (mid == null) return {};
        return {
          mid,
          up: mid * (1 + upperPercent / 100),
          dn: mid * (1 - lowerPercent / 100),
        };
      });
    },
  });

  registerIndicator({
    name: "DKX",
    shortName: "DKX",
    series: "normal",
    calcParams: [10, 10],
    precision: 3,
    shouldOhlc: true,
    figures: [
      { key: "dkx", title: "DKX: ", type: "line" },
      { key: "madkx", title: "MADKX: ", type: "line" },
    ],
    calc: (dataList, indicator) => {
      const midPeriod = Number(indicator.calcParams[0] ?? 10);
      const maPeriod = Number(indicator.calcParams[1] ?? 10);
      const midValues = dataList.map((item) => (3 * item.close + item.low + item.open + item.high) / 6);
      // 经典加权：DKX = (N*MID + (N-1)*REF(MID,1) + ... + 1*REF(MID,N-1)) / (N*(N+1)/2)
      const dkxValues: Array<number | undefined> = midValues.map((_, index) => {
        if (index + 1 < midPeriod) return undefined;
        let weighted = 0;
        let weightSum = 0;
        for (let i = 0; i < midPeriod; i += 1) {
          const weight = midPeriod - i;
          weighted += weight * midValues[index - i];
          weightSum += weight;
        }
        return weighted / weightSum;
      });
      return dataList.map((_, index) => {
        const dkx = dkxValues[index];
        const defined = dkxValues.map((value) => value ?? Number.NaN);
        let madkx: number | undefined;
        if (index + 1 >= maPeriod) {
          let sum = 0;
          let count = 0;
          for (let i = index - maPeriod + 1; i <= index; i += 1) {
            if (Number.isFinite(defined[i])) {
              sum += defined[i];
              count += 1;
            }
          }
          madkx = count === maPeriod ? sum / maPeriod : undefined;
        }
        return { dkx, madkx };
      });
    },
  });
}
