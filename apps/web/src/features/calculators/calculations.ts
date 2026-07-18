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

/** 做 T 账本操作：初始持仓 / 买入 / 卖出 */
export type TLedgerSide = "init" | "buy" | "sell";

export type TLedgerEntryInput = {
  id: string;
  side: TLedgerSide;
  price: number;
  quantity: number;
};

export type TLedgerRow = {
  id: string;
  index: number;
  side: TLedgerSide;
  buyPrice: number | null;
  buyQuantity: number | null;
  sellPrice: number | null;
  sellQuantity: number | null;
  fee: number;
  cashFlow: number;
  positionQuantity: number;
  positionAvgCost: number;
};

export type TLedgerSummary = {
  positionQuantity: number;
  positionAvgCost: number;
  positionCost: number;
  positionMarketValue: number;
  realizedPnl: number;
  unrealizedPnl: number;
  totalPnl: number;
  totalFees: number;
  totalCashFlow: number;
  /** 做 T 收益：已实现盈亏 */
  tProfit: number;
  markPrice: number;
  /** 可提取利润：已实现盈亏中非负部分 */
  extractableProfit: number;
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
  price: number | null;
  quantity: number | null;
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

/**
 * 按真实做 T 逻辑从首条记录重算整本账：
 * - 买入：金额+手续费入成本，移动加权平均
 * - 卖出：金额-手续费为现金流，平均成本不变，仅减仓
 * - finalPrice：可选情景价；有值时用其估算持仓市值与未实现/总盈亏，无值则用最后成交价
 */
export function buildTLedger(
  entries: TLedgerEntryInput[],
  feeSettings: FeeSettings,
  options?: { finalPrice?: number | null },
): { rows: TLedgerRow[]; summary: TLedgerSummary } {
  const rows: TLedgerRow[] = [];
  let positionQuantity = 0;
  let positionAvgCost = 0;
  let realizedPnl = 0;
  let totalFees = 0;
  let totalCashFlow = 0;
  let lastTradePrice = 0;

  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    const price = Math.max(0, entry.price);
    let quantity = Math.max(0, entry.quantity);

    if (entry.side === "init") {
      positionQuantity = quantity;
      positionAvgCost = price;
      lastTradePrice = price;
      rows.push({
        id: entry.id,
        index: i + 1,
        side: "init",
        buyPrice: null,
        buyQuantity: null,
        sellPrice: null,
        sellQuantity: null,
        fee: 0,
        cashFlow: 0,
        positionQuantity,
        positionAvgCost,
      });
      continue;
    }

    if (entry.side === "buy") {
      const amount = price * quantity;
      const fee = quantity > 0 && price > 0 ? calculateTradeFee("buy", price, quantity, feeSettings) : 0;
      const cashFlow = -(amount + fee);
      const nextQuantity = positionQuantity + quantity;
      const nextCost = positionQuantity * positionAvgCost + amount + fee;
      positionQuantity = nextQuantity;
      positionAvgCost = nextQuantity > 0 ? nextCost / nextQuantity : 0;
      lastTradePrice = price;
      totalFees += fee;
      totalCashFlow += cashFlow;
      rows.push({
        id: entry.id,
        index: i + 1,
        side: "buy",
        buyPrice: price,
        buyQuantity: quantity,
        sellPrice: null,
        sellQuantity: null,
        fee,
        cashFlow,
        positionQuantity,
        positionAvgCost,
      });
      continue;
    }

    // sell
    quantity = Math.min(quantity, positionQuantity);
    const amount = price * quantity;
    const fee = quantity > 0 && price > 0 ? calculateTradeFee("sell", price, quantity, feeSettings) : 0;
    const cashFlow = amount - fee;
    const sellCost = positionAvgCost * quantity;
    realizedPnl += amount - sellCost - fee;
    positionQuantity = Math.max(0, positionQuantity - quantity);
    // 平均成本保持不变；清仓后成本归零
    if (positionQuantity <= 0) {
      positionQuantity = 0;
      positionAvgCost = 0;
    }
    lastTradePrice = price;
    totalFees += fee;
    totalCashFlow += cashFlow;
    rows.push({
      id: entry.id,
      index: i + 1,
      side: "sell",
      buyPrice: null,
      buyQuantity: null,
      sellPrice: price,
      sellQuantity: quantity,
      fee,
      cashFlow,
      positionQuantity,
      positionAvgCost,
    });
  }

  const scenarioPrice = options?.finalPrice;
  const hasScenarioPrice = scenarioPrice != null && Number.isFinite(scenarioPrice) && scenarioPrice > 0;
  const markPrice = hasScenarioPrice ? scenarioPrice : lastTradePrice;
  const positionCost = positionQuantity * positionAvgCost;
  const positionMarketValue = positionQuantity * markPrice;
  const unrealizedPnl = positionQuantity > 0 ? (markPrice - positionAvgCost) * positionQuantity : 0;
  const totalPnl = realizedPnl + unrealizedPnl;

  return {
    rows,
    summary: {
      positionQuantity,
      positionAvgCost,
      positionCost,
      positionMarketValue,
      realizedPnl,
      unrealizedPnl,
      totalPnl,
      totalFees,
      totalCashFlow,
      tProfit: realizedPnl,
      markPrice,
      extractableProfit: Math.max(0, realizedPnl),
    },
  };
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

export function calculateAverage(lines: AverageLine[], feeSettings: FeeSettings): AverageResult {
  const totals = lines.reduce(
    (sum, line) => {
      const price = line.price ?? 0;
      const quantity = line.quantity ?? 0;
      const amount = price * quantity;
      const fee = quantity > 0 && price > 0 ? calculateTradeFee("buy", price, quantity, feeSettings) : 0;
      return {
        totalQuantity: sum.totalQuantity + quantity,
        totalAmount: sum.totalAmount + amount,
        totalFee: sum.totalFee + fee,
      };
    },
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

function percentToRate(value: number) {
  return value / 100;
}
