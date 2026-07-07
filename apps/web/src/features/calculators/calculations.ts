export type AssetType = "stock" | "etf";

export type FeeSettings = {
  assetType: AssetType;
  commissionMode: "rate" | "fixed";
  commissionRate: number;
  fixedCommission: number;
  minCommission: number;
  stampTaxRate: number;
  transferRate: number;
};

export type ProfitCostInput = FeeSettings & {
  buyPrice: number;
  sellPrice: number;
  quantity: number;
};

export type ProfitCostResult = {
  buyAmount: number;
  buyCommission: number;
  buyTransferFee: number;
  buyTotal: number;
  sellAmount: number;
  sellCommission: number;
  sellStampTax: number;
  sellTransferFee: number;
  sellTotal: number;
  netProfit: number;
  netProfitRate: number;
  totalCost: number;
};

export type TTradeInput = FeeSettings & {
  baseQuantity: number;
  baseAvgCost: number;
  sequence: "buyFirst" | "sellFirst";
  buyPrice: number;
  buyQuantity: number;
  sellPrice: number;
  sellQuantity: number;
};

export type TTradeResult = {
  buyAmount: number;
  buyFees: number;
  sellAmount: number;
  sellFees: number;
  cashFlow: number;
  realizedProfit: number;
  finalQuantity: number;
  finalCost: number;
  finalAvgCost: number;
};

export type ChangeInput = {
  basePrice: number;
  currentPrice: number;
  targetRate: number;
};

export type ChangeResult = {
  changeAmount: number;
  changeRate: number;
  targetUpPrice: number;
  targetDownPrice: number;
  limit5Up: number;
  limit5Down: number;
  limit10Up: number;
  limit10Down: number;
  limit20Up: number;
  limit20Down: number;
};

export type AverageLine = {
  id: string;
  price: number;
  quantity: number;
  fee: number;
};

export type AverageResult = {
  totalQuantity: number;
  totalAmount: number;
  totalFee: number;
  averagePrice: number;
  averageCost: number;
};

export const defaultFeeSettings: FeeSettings = {
  assetType: "stock",
  commissionMode: "rate",
  commissionRate: 0.025,
  fixedCommission: 0,
  minCommission: 5,
  stampTaxRate: 0.05,
  transferRate: 0,
};

export function calculateProfitCost(input: ProfitCostInput): ProfitCostResult {
  const buyAmount = input.buyPrice * input.quantity;
  const sellAmount = input.sellPrice * input.quantity;
  const buyCommission = calculateCommission(buyAmount, input);
  const sellCommission = calculateCommission(sellAmount, input);
  const buyTransferFee = buyAmount * percentToRate(input.transferRate);
  const sellTransferFee = sellAmount * percentToRate(input.transferRate);
  const sellStampTax = input.assetType === "stock" ? sellAmount * percentToRate(input.stampTaxRate) : 0;
  const buyTotal = buyAmount + buyCommission + buyTransferFee;
  const sellTotal = sellAmount - sellCommission - sellStampTax - sellTransferFee;
  const netProfit = sellTotal - buyTotal;
  const totalCost = buyCommission + sellCommission + buyTransferFee + sellTransferFee + sellStampTax;

  return {
    buyAmount,
    buyCommission,
    buyTransferFee,
    buyTotal,
    sellAmount,
    sellCommission,
    sellStampTax,
    sellTransferFee,
    sellTotal,
    netProfit,
    netProfitRate: buyTotal > 0 ? (netProfit / buyTotal) * 100 : 0,
    totalCost,
  };
}

export function calculateTTrade(input: TTradeInput): TTradeResult {
  const buyAmount = input.buyPrice * input.buyQuantity;
  const sellAmount = input.sellPrice * input.sellQuantity;
  const buyFees = calculateSideFees("buy", buyAmount, input);
  const sellFees = calculateSideFees("sell", sellAmount, input);
  const initialCost = input.baseQuantity * input.baseAvgCost;
  const cashFlow = sellAmount - sellFees - buyAmount - buyFees;

  if (input.sequence === "buyFirst") {
    const tradableQuantity = input.baseQuantity + input.buyQuantity;
    const sellQuantity = Math.min(input.sellQuantity, tradableQuantity);
    const tQuantity = Math.min(input.buyQuantity, sellQuantity);
    const baseSellQuantity = Math.max(0, sellQuantity - tQuantity);
    const realizedProfit =
      (input.sellPrice - input.buyPrice) * tQuantity +
      (input.sellPrice - input.baseAvgCost) * baseSellQuantity -
      sellFees -
      (buyFees * tQuantity) / Math.max(input.buyQuantity, 1);
    const remainingBuyQuantity = Math.max(0, input.buyQuantity - tQuantity);
    const finalQuantity = input.baseQuantity + input.buyQuantity - sellQuantity;
    const finalCost = initialCost + input.buyPrice * remainingBuyQuantity + buyFees - (input.baseAvgCost * baseSellQuantity + (buyFees * tQuantity) / Math.max(input.buyQuantity, 1));

    return normalizeTResult({
      buyAmount,
      buyFees,
      sellAmount,
      sellFees,
      cashFlow,
      realizedProfit,
      finalQuantity,
      finalCost,
    });
  }

  const sellQuantity = Math.min(input.sellQuantity, input.baseQuantity);
  const realizedProfit = (input.sellPrice - input.baseAvgCost) * sellQuantity - sellFees;
  const finalQuantity = input.baseQuantity - sellQuantity + input.buyQuantity;
  const finalCost = initialCost - input.baseAvgCost * sellQuantity + buyAmount + buyFees;

  return normalizeTResult({
    buyAmount,
    buyFees,
    sellAmount,
    sellFees,
    cashFlow,
    realizedProfit,
    finalQuantity,
    finalCost,
  });
}

export function calculateChange(input: ChangeInput): ChangeResult {
  const changeAmount = input.currentPrice - input.basePrice;
  const changeRate = input.basePrice > 0 ? (changeAmount / input.basePrice) * 100 : 0;

  return {
    changeAmount,
    changeRate,
    targetUpPrice: input.basePrice * (1 + percentToRate(Math.abs(input.targetRate))),
    targetDownPrice: input.basePrice * (1 - percentToRate(Math.abs(input.targetRate))),
    limit5Up: input.basePrice * 1.05,
    limit5Down: input.basePrice * 0.95,
    limit10Up: input.basePrice * 1.1,
    limit10Down: input.basePrice * 0.9,
    limit20Up: input.basePrice * 1.2,
    limit20Down: input.basePrice * 0.8,
  };
}

export function calculateAverage(lines: AverageLine[]): AverageResult {
  const totals = lines.reduce(
    (sum, line) => ({
      totalQuantity: sum.totalQuantity + line.quantity,
      totalAmount: sum.totalAmount + line.price * line.quantity,
      totalFee: sum.totalFee + line.fee,
    }),
    { totalQuantity: 0, totalAmount: 0, totalFee: 0 },
  );

  return {
    ...totals,
    averagePrice: totals.totalQuantity > 0 ? totals.totalAmount / totals.totalQuantity : 0,
    averageCost: totals.totalQuantity > 0 ? (totals.totalAmount + totals.totalFee) / totals.totalQuantity : 0,
  };
}

function calculateCommission(amount: number, settings: FeeSettings) {
  if (amount <= 0) return 0;
  if (settings.commissionMode === "fixed") {
    return settings.fixedCommission;
  }
  return Math.max(amount * percentToRate(settings.commissionRate), settings.minCommission);
}

export function calculateTradeFee(side: "buy" | "sell", price: number, quantity: number, settings: FeeSettings) {
  return calculateSideFees(side, price * quantity, settings);
}

function calculateSideFees(side: "buy" | "sell", amount: number, settings: FeeSettings) {
  const commission = calculateCommission(amount, settings);
  const transferFee = amount * percentToRate(settings.transferRate);
  const stampTax = side === "sell" && settings.assetType === "stock" ? amount * percentToRate(settings.stampTaxRate) : 0;
  return commission + transferFee + stampTax;
}

function normalizeTResult(result: Omit<TTradeResult, "finalAvgCost">): TTradeResult {
  const finalCost = Math.max(0, result.finalCost);
  const finalQuantity = Math.max(0, result.finalQuantity);
  return {
    ...result,
    finalCost,
    finalQuantity,
    finalAvgCost: finalQuantity > 0 ? finalCost / finalQuantity : 0,
  };
}

function percentToRate(value: number) {
  return value / 100;
}
