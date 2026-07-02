import { registerIndicator, type KLineData } from "klinecharts";

type BollResult = {
  up?: number;
  mid?: number;
  dn?: number;
};

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
    series: "price",
    calcParams: [20, 2],
    precision: 2,
    shouldOhlc: true,
    figures: [
      { key: "up", title: "UB: ", type: "line" },
      { key: "mid", title: "BOLL: ", type: "line" },
      { key: "dn", title: "LB: ", type: "line" },
    ],
    calc: (dataList, indicator) => {
      const params = indicator.calcParams;
      const period = params[0] - 1;
      const multiplier = params[1] ?? 2;
      let closeSum = 0;

      return dataList.map((kLineData, index) => {
        const boll: BollResult = {};
        closeSum += kLineData.close;

        if (index >= period) {
          boll.mid = closeSum / params[0];
          const md = getBollMd(dataList.slice(index - period, index + 1), boll.mid);
          boll.up = boll.mid + multiplier * md;
          boll.dn = boll.mid - multiplier * md;
          closeSum -= dataList[index - period].close;
        }

        return boll;
      });
    },
  });
}
