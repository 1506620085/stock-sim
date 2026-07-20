import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Calculator, ChevronDown, ChevronRight, Copy, Download, Layers, PiggyBank, Plus, Trash2 } from "lucide-react";
import { AppSelect } from "../../components/AppSelect";
import { AppNumberStepper } from "../../components/AppNumberStepper";
import { AppSwitch } from "../../components/AppSwitch";
import { FieldLabelWithTip } from "../../components/FieldHelpTip";
import { showInfo, showSuccess } from "../../components/ToastProvider";
import { feeTemplateLabel, loadFeePreferences, loadFeeTemplates, resolveFeeTemplate, saveFeePreferences, templateToFeeSettings, type FeeTemplate } from "../settings/api";
import {
  buildTLedger,
  calculateAverage,
  calculateChange,
  calculateProfitCost,
  defaultFeeSettings,
  type AssetType,
  type AverageLine,
  type FeeSettings,
  type TLedgerEntryInput,
  type TLedgerRow,
  type TLedgerSide,
} from "./calculations";

type CalculatorTab = "profit" | "t" | "change" | "average";

const tabs: Array<{ id: CalculatorTab; label: string }> = [
  { id: "profit", label: "利润成本" },
  { id: "t", label: "做 T" },
  { id: "change", label: "涨跌幅" },
  { id: "average", label: "平均价格" },
];

const calculatorTabMeta: Record<CalculatorTab, { title: string; description: string }> = {
  profit: {
    title: "利润成本计算器",
    description: "按股票或 ETF 费率计算一买一卖后的净盈亏、净利润率和交易成本。",
  },
  t: {
    title: "做 T 计算器",
    description: "初始化底仓后逐笔记录买入卖出，按移动加权平均自动重算持仓成本、现金流与做 T 收益。",
  },
  change: {
    title: "涨跌幅计算器",
    description: "输入基准价和当前价计算涨跌幅，也可以输入目标涨跌幅反推目标价格。",
  },
  average: {
    title: "平均价格计算器",
    description: "录入多笔买入价格与数量，按费率模板或自定义费率计算加权平均价格与含费用平均成本。",
  },
};

const currency = (value: number) =>
  value.toLocaleString("zh-CN", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });

const percent = (value: number) => `${value.toFixed(2)}%`;

export function CalculatorsPage() {
  const [activeTab, setActiveTab] = useState<CalculatorTab>("profit");
  const activeMeta = calculatorTabMeta[activeTab];

  return (
    <section className="calculators-page">
      <div className="calculator-page-header">
        <header className="panel calculator-page-meta">
          <div className="calculator-page-meta-title">
            <h1>交易计算器</h1>
            <p className="eyebrow calculator-page-meta-eyebrow">Tools</p>
          </div>
          <span className="stage-pill">工具箱</span>
        </header>
        <div className="panel calculator-page-heading">
          <Calculator aria-hidden="true" size={28} />
          <div className="calculator-page-heading-main">
            <div className="calculator-page-heading-title">
              <h2>{activeMeta.title}</h2>
              <p className="eyebrow calculator-page-heading-eyebrow">Calculator</p>
            </div>
            <p className="calculator-page-heading-desc">{activeMeta.description}</p>
          </div>
        </div>
      </div>

      <div className="panel calculators-tabs" role="tablist" aria-label="计算器类型">
        {tabs.map((tab) => (
          <button aria-selected={activeTab === tab.id} className={activeTab === tab.id ? "active" : ""} key={tab.id} onClick={() => setActiveTab(tab.id)} role="tab" type="button">
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "profit" && <ProfitCostCalculator />}
      {activeTab === "t" && <TCalculator />}
      {activeTab === "change" && <ChangeCalculator />}
      {activeTab === "average" && <AveragePriceCalculator />}
    </section>
  );
}

function ProfitCostCalculator() {
  const fee = useCalculatorFeeSettings();
  const [buyPrice, setBuyPrice] = useState<number | null>(null);
  const [sellPrice, setSellPrice] = useState<number | null>(null);
  const [quantity, setQuantity] = useState<number | null>(null);
  const priceStep = fee.assetType === "etf" ? 0.001 : 0.01;
  const result = useMemo(
    () =>
      calculateProfitCost({
        ...fee.effectiveSettings,
        buyPrice: buyPrice ?? 0,
        sellPrice: sellPrice ?? 0,
        quantity: quantity ?? 0,
      }),
    [buyPrice, fee.effectiveSettings, quantity, sellPrice],
  );

  useEffect(() => {
    setBuyPrice((current) => (current == null ? current : Number(current.toFixed(fee.assetType === "etf" ? 3 : 2))));
    setSellPrice((current) => (current == null ? current : Number(current.toFixed(fee.assetType === "etf" ? 3 : 2))));
  }, [fee.assetType]);

  return (
    <CalculatorShell>
      <div className="calculator-form">
        <div className="panel">
          <h2>输入参数</h2>
          <div className="calculator-asset-type-field">
            <FieldLabelWithTip
              htmlFor="profit-cost-asset-type"
              tip="在买卖价格中，股票默认精确到两位小数；将成本类型切换为 ETF 后，可精确到三位小数。"
              tipAriaLabel="价格精度说明"
            >
              成本类型
            </FieldLabelWithTip>
            <AppSelect
              id="profit-cost-asset-type"
              onChange={fee.changeAssetType}
              options={[
                { label: "股票", value: "stock" },
                { label: "ETF", value: "etf" },
              ]}
              value={fee.assetType}
            />
          </div>
          <div className="calculator-input-grid">
            <AppNumberStepper label="买入价格" normalizeToStep onChange={setBuyPrice} step={priceStep} value={buyPrice} />
            <AppNumberStepper label="卖出价格" normalizeToStep onChange={setSellPrice} step={priceStep} value={sellPrice} />
            <AppNumberStepper label="买入数量" normalizeToStep onChange={setQuantity} step={100} value={quantity} />
          </div>
          <CalculatorFeePanel {...fee} />
        </div>
        <ResultTable
          rows={[
            ["买入金额", currency(result.buyAmount)],
            ["买入佣金", currency(result.buyCommission)],
            ["买入合计", currency(result.buyTotal)],
            ["卖出金额", currency(result.sellAmount)],
            ["卖出佣金", currency(result.sellCommission)],
            ["卖出印花税", currency(result.sellStampTax)],
            ["卖出合计", currency(result.sellTotal)],
            ["净盈亏金额", currency(result.netProfit), result.netProfit],
            ["净利润率", percent(result.netProfitRate), result.netProfitRate],
            ["交易成本合计", currency(result.totalCost)],
          ]}
          title="计算结果"
        />
      </div>
    </CalculatorShell>
  );
}

function TCalculator() {
  const fee = useCalculatorFeeSettings();
  const [baseAvgCost, setBaseAvgCost] = useState<number | null>(10);
  const [baseQuantity, setBaseQuantity] = useState<number | null>(1000);
  const [tradeSide, setTradeSide] = useState<"buy" | "sell">("buy");
  const [tradePrice, setTradePrice] = useState<number | null>(null);
  const [tradeQuantity, setTradeQuantity] = useState<number | null>(null);
  const [finalPrice, setFinalPrice] = useState<number | null>(null);
  const [entries, setEntries] = useState<TLedgerEntryInput[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showRetention, setShowRetention] = useState(false);

  const priceStep = fee.assetType === "etf" ? 0.001 : 0.01;
  const { rows, summary } = useMemo(
    () => buildTLedger(entries, fee.effectiveSettings, { finalPrice }),
    [entries, fee.effectiveSettings, finalPrice],
  );

  useEffect(() => {
    const decimals = fee.assetType === "etf" ? 3 : 2;
    setBaseAvgCost((current) => (current == null ? current : Number(current.toFixed(decimals))));
    setTradePrice((current) => (current == null ? current : Number(current.toFixed(decimals))));
    setFinalPrice((current) => (current == null ? current : Number(current.toFixed(decimals))));
  }, [fee.assetType]);

  function initBasePosition() {
    const cost = baseAvgCost ?? 0;
    const quantity = baseQuantity ?? 0;
    if (cost <= 0 || quantity <= 0) {
      showInfo("请先填写有效的底仓成本价与底仓数量。");
      return;
    }
    setEntries([{ id: crypto.randomUUID(), side: "init", price: cost, quantity }]);
    setSelectedIds([]);
    setShowRetention(false);
    showSuccess("底仓已初始化");
  }

  function addOperation() {
    if (!entries.some((entry) => entry.side === "init")) {
      showInfo("请先点击「底仓初始化」生成初始持仓。");
      return;
    }
    const price = tradePrice ?? 0;
    const quantity = tradeQuantity ?? 0;
    if (price <= 0 || quantity <= 0) {
      showInfo("请填写有效的交易价格与交易数量。");
      return;
    }
    if (tradeSide === "sell" && quantity > summary.positionQuantity) {
      showInfo(`持仓不足，当前可卖 ${summary.positionQuantity.toLocaleString("zh-CN")} 股。`);
      return;
    }
    setEntries((items) => [...items, { id: crypto.randomUUID(), side: tradeSide, price, quantity }]);
    setTradePrice(null);
    setTradeQuantity(null);
    setShowRetention(false);
  }

  function handleAddSubmit(event: FormEvent) {
    event.preventDefault();
    addOperation();
  }

  function deleteSelected() {
    if (!selectedIds.length) {
      showInfo("请先勾选要删除的记录。");
      return;
    }
    setEntries((items) => {
      const next = items.filter((item) => !selectedIds.includes(item.id));
      const hasInit = next.some((item) => item.side === "init");
      return hasInit ? next : [];
    });
    setSelectedIds([]);
    setShowRetention(false);
    showSuccess("已删除并重新计算");
  }

  function toggleSelect(id: string) {
    setSelectedIds((ids) => (ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]));
  }

  function toggleSelectAll() {
    if (!rows.length) return;
    setSelectedIds((ids) => (ids.length === rows.length ? [] : rows.map((row) => row.id)));
  }

  function analyzeRetention() {
    if (!rows.length) {
      showInfo("请先初始化底仓并添加操作。");
      return;
    }
    setShowRetention(true);
    showSuccess("已按当前做 T 收益更新利润留存分析");
  }

  function downloadExcel() {
    if (!rows.length) {
      showInfo("暂无交易记录可导出。");
      return;
    }
    const header = ["序号", "操作方向", "买入价格", "买入数量", "卖出价格", "卖出数量", "成交费用", "资金流向", "持仓数量", "持仓成本"];
    const body = rows.map((row) => [
      row.index,
      tSideLabel(row.side),
      formatOptional(row.buyPrice),
      formatOptionalQty(row.buyQuantity),
      formatOptional(row.sellPrice),
      formatOptionalQty(row.sellQuantity),
      currency(row.fee),
      currency(row.cashFlow),
      row.positionQuantity.toLocaleString("zh-CN"),
      currency(row.positionAvgCost),
    ]);
    const summaryRows = [
      [],
      ["最终状态"],
      ["当前持仓数量", summary.positionQuantity.toLocaleString("zh-CN")],
      ["当前平均成本", currency(summary.positionAvgCost)],
      ["当前持仓市值", currency(summary.positionMarketValue)],
      ["已实现盈亏", currency(summary.realizedPnl)],
      ["未实现盈亏", currency(summary.unrealizedPnl)],
      ["总盈亏", currency(summary.totalPnl)],
      ["累计手续费", currency(summary.totalFees)],
    ];
    const csv = [header, ...body, ...summaryRows]
      .map((line) => line.map(csvEscape).join(","))
      .join("\r\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `做T表_${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    showSuccess("做 T 表已导出");
  }

  return (
    <CalculatorShell>
      <div className="calculator-form t-calculator-form">
        <div className="t-calculator-top">
          <div className="panel t-calculator-panel">
            <div className="t-input-main">
              <form className="t-input-section" onSubmit={handleAddSubmit}>
                <div className="t-input-align">
                  <div className="calculator-input-grid t-input-grid t-input-grid--base">
                    <AppNumberStepper label="底仓成本价" onChange={setBaseAvgCost} step={priceStep} value={baseAvgCost} />
                    <AppNumberStepper label="底仓数量" normalizeToStep onChange={setBaseQuantity} step={100} value={baseQuantity} />
                    <AppNumberStepper
                      label={
                        <FieldLabelWithTip
                          tip="当前持仓若到达该价时的情景价。留空则总盈亏仍按最后成交价估算；填写后按该价与当前成本、股数重算未实现盈亏与总盈亏。"
                          tipAriaLabel="最终价格说明"
                        >
                          最终价格
                        </FieldLabelWithTip>
                      }
                      onChange={setFinalPrice}
                      step={priceStep}
                      value={finalPrice}
                    />
                    <div className="calculator-asset-type-field">
                      <FieldLabelWithTip htmlFor="t-asset-type" tip="成本类型决定印花税等费率规则；费率模板按此类型筛选。" tipAriaLabel="成本类型说明">
                        成本类型
                      </FieldLabelWithTip>
                      <AppSelect
                        id="t-asset-type"
                        onChange={fee.changeAssetType}
                        options={[
                          { label: "股票", value: "stock" },
                          { label: "ETF", value: "etf" },
                        ]}
                        value={fee.assetType}
                      />
                    </div>
                    <CalculatorFeePanel
                      {...fee}
                      compact
                      trailing={
                        <div className="t-peer-action">
                          <button className="primary-button t-init-button" onClick={initBasePosition} type="button">
                            <Layers size={14} />
                            底仓初始化
                          </button>
                        </div>
                      }
                    />
                  </div>
                  <div className="calculator-input-grid t-input-grid t-input-grid--trade">
                    <label>
                      交易方向
                      <AppSelect
                        onChange={setTradeSide}
                        options={[
                          { label: "买入", value: "buy" },
                          { label: "卖出", value: "sell" },
                        ]}
                        value={tradeSide}
                      />
                    </label>
                    <AppNumberStepper label="交易价格" onChange={setTradePrice} step={priceStep} value={tradePrice} />
                    <AppNumberStepper label="交易数量" normalizeToStep onChange={setTradeQuantity} step={100} value={tradeQuantity} />
                    <div className="t-action-bar t-action-bar--inline">
                      <button className="primary-button" onClick={addOperation} type="button" title="添加操作">
                        <Plus size={14} />
                        添加
                      </button>
                      <button className="secondary-button" onClick={deleteSelected} type="button" title="删除操作">
                        <Trash2 size={14} />
                        删除
                      </button>
                      <button className="secondary-button" onClick={analyzeRetention} type="button">
                        <PiggyBank size={14} />
                        利润留存
                      </button>
                      <button className="secondary-button" onClick={downloadExcel} type="button">
                        <Download size={14} />
                        下载做T表
                      </button>
                    </div>
                  </div>
                </div>
                <button className="sr-only" type="submit" tabIndex={-1} aria-hidden="true">
                  添加操作
                </button>
              </form>
            </div>
          </div>

          <div className="t-status-column">
            <ResultTable
              columns={2}
              rows={[
                ["当前持仓数量", summary.positionQuantity.toLocaleString("zh-CN")],
                ["当前平均成本", currency(summary.positionAvgCost)],
                ["当前持仓市值", currency(summary.positionMarketValue)],
                ["已实现盈亏", currency(summary.realizedPnl), summary.realizedPnl],
                ["未实现盈亏", currency(summary.unrealizedPnl), summary.unrealizedPnl],
                ["总盈亏", currency(summary.totalPnl), summary.totalPnl],
                ["累计手续费", currency(summary.totalFees)],
                ...(showRetention
                  ? ([
                      ["已实现利润", currency(summary.realizedPnl), summary.realizedPnl],
                      ["可提取利润", currency(summary.extractableProfit), summary.extractableProfit],
                      ["剩余持仓成本", currency(summary.positionCost)],
                    ] as Array<[string, string, number?]>)
                  : []),
              ]}
              title="最终状态"
            />
            {showRetention ? (
              <p className="t-retention-hint">
                {summary.extractableProfit > 0
                  ? summary.extractableProfit >= summary.positionCost
                    ? "可提取利润已覆盖剩余持仓成本。"
                    : "可提取利润尚未完全覆盖剩余持仓成本。"
                  : "当前暂无可提取利润。"}
              </p>
            ) : null}
          </div>
        </div>

        <section className="panel t-ledger-panel">
          <div className="section-header">
            <h2>做 T 记录</h2>
          </div>
          <div className="t-table-wrap">
            <table className="result-table t-ledger-table">
              <thead>
                <tr>
                  <th className="t-check-col">
                    <input
                      aria-label="全选"
                      checked={rows.length > 0 && selectedIds.length === rows.length}
                      onChange={toggleSelectAll}
                      type="checkbox"
                    />
                  </th>
                  <th>序号</th>
                  <th>操作方向</th>
                  <th>买入价格</th>
                  <th>买入数量</th>
                  <th>卖出价格</th>
                  <th>卖出数量</th>
                  <th>成交费用</th>
                  <th>资金流向</th>
                  <th>持仓数量</th>
                  <th>持仓成本</th>
                </tr>
              </thead>
              <tbody>
                {rows.length ? (
                  rows.map((row) => (
                    <tr key={row.id}>
                      <td className="t-check-col">
                        <input
                          aria-label={`选择第 ${row.index} 行`}
                          checked={selectedIds.includes(row.id)}
                          onChange={() => toggleSelect(row.id)}
                          type="checkbox"
                        />
                      </td>
                      <td>{row.index}</td>
                      <td>{tSideLabel(row.side)}</td>
                      <td>{formatOptional(row.buyPrice)}</td>
                      <td>{formatOptionalQty(row.buyQuantity)}</td>
                      <td>{formatOptional(row.sellPrice)}</td>
                      <td>{formatOptionalQty(row.sellQuantity)}</td>
                      <td>{currency(row.fee)}</td>
                      <td className={cashFlowTone(row)}>{currency(row.cashFlow)}</td>
                      <td>{row.positionQuantity.toLocaleString("zh-CN")}</td>
                      <td>{currency(row.positionAvgCost)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="t-empty-cell" colSpan={11}>
                      请先「底仓初始化」，再添加买入 / 卖出操作。
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </CalculatorShell>
  );
}

function tSideLabel(side: TLedgerSide) {
  return ({ init: "初始持仓", buy: "买入", sell: "卖出" } as const)[side];
}

function formatOptional(value: number | null) {
  return value == null ? "—" : currency(value);
}

function formatOptionalQty(value: number | null) {
  return value == null ? "—" : value.toLocaleString("zh-CN");
}

function cashFlowTone(row: TLedgerRow) {
  if (row.side === "init" || row.cashFlow === 0) return "";
  return row.cashFlow >= 0 ? "positive" : "negative";
}

function csvEscape(value: string | number) {
  const text = String(value);
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function ChangeCalculator() {
  const [basePrice, setBasePrice] = useState(10);
  const [currentPrice, setCurrentPrice] = useState(11.2);
  const [targetRate, setTargetRate] = useState(8);
  const result = useMemo(() => calculateChange({ basePrice, currentPrice, targetRate }), [basePrice, currentPrice, targetRate]);

  return (
    <CalculatorShell>
      <div className="calculator-form">
        <div className="panel">
          <h2>输入参数</h2>
          <div className="calculator-input-grid">
            <AppNumberStepper label="基准价格" onChange={(value) => setBasePrice(value ?? 0)} step={0.01} value={basePrice} />
            <AppNumberStepper label="当前价格" onChange={(value) => setCurrentPrice(value ?? 0)} step={0.01} value={currentPrice} />
            <AppNumberStepper label="目标涨跌幅(%)" onChange={(value) => setTargetRate(value ?? 0)} step={0.1} value={targetRate} />
          </div>
        </div>
        <ResultTable
          rows={[
            ["涨跌金额", currency(result.changeAmount), result.changeAmount],
            ["涨跌幅", percent(result.changeRate), result.changeRate],
            ["目标上涨价格", currency(result.targetUpPrice)],
            ["目标下跌价格", currency(result.targetDownPrice)],
            ["5% 涨停参考", currency(result.limit5Up)],
            ["5% 跌停参考", currency(result.limit5Down)],
            ["10% 涨停参考", currency(result.limit10Up)],
            ["10% 跌停参考", currency(result.limit10Down)],
            ["20% 涨停参考", currency(result.limit20Up)],
            ["20% 跌停参考", currency(result.limit20Down)],
          ]}
          title="计算结果"
        />
      </div>
    </CalculatorShell>
  );
}

function AveragePriceCalculator() {
  const fee = useCalculatorFeeSettings();
  const [lines, setLines] = useState<AverageLine[]>([
    { id: "1", price: null, quantity: null },
    { id: "2", price: null, quantity: null },
  ]);
  const priceStep = fee.assetType === "etf" ? 0.001 : 0.01;
  const result = useMemo(() => calculateAverage(lines, fee.effectiveSettings), [fee.effectiveSettings, lines]);

  useEffect(() => {
    const decimals = fee.assetType === "etf" ? 3 : 2;
    setLines((items) =>
      items.map((line) => ({
        ...line,
        price: line.price == null ? null : Number(line.price.toFixed(decimals)),
      })),
    );
  }, [fee.assetType]);

  function updateLine(id: string, patch: Partial<AverageLine>) {
    setLines((items) => items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function addLine() {
    setLines((items) => [...items, { id: crypto.randomUUID(), price: null, quantity: null }]);
  }

  function removeLine(id: string) {
    setLines((items) => (items.length > 1 ? items.filter((item) => item.id !== id) : items));
  }

  return (
    <CalculatorShell>
      <div className="calculator-form">
        <div className="panel">
          <div className="section-header">
            <h2>买入明细</h2>
            <button className="text-button" onClick={addLine} type="button">
              <Plus size={15} />
              新增
            </button>
          </div>
          <div className="calculator-asset-type-field">
            <FieldLabelWithTip
              htmlFor="average-price-asset-type"
              tip="在买卖价格中，股票默认精确到两位小数；将成本类型切换为 ETF 后，可精确到三位小数。"
              tipAriaLabel="价格精度说明"
            >
              成本类型
            </FieldLabelWithTip>
            <AppSelect
              id="average-price-asset-type"
              onChange={fee.changeAssetType}
              options={[
                { label: "股票", value: "stock" },
                { label: "ETF", value: "etf" },
              ]}
              value={fee.assetType}
            />
          </div>
          <div className="average-lines">
            {lines.map((line, index) => (
              <div className="average-line" key={line.id}>
                <span>{index + 1}</span>
                <AppNumberStepper
                  label="价格"
                  normalizeToStep
                  onChange={(value) => updateLine(line.id, { price: value })}
                  step={priceStep}
                  value={line.price}
                />
                <AppNumberStepper
                  label="数量"
                  normalizeToStep
                  onChange={(value) => updateLine(line.id, { quantity: value })}
                  step={100}
                  value={line.quantity}
                />
                <button aria-label="删除买入行" className="icon-button danger-button" onClick={() => removeLine(line.id)} type="button">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
          <CalculatorFeePanel {...fee} />
        </div>
        <ResultTable
          rows={[
            ["总数量", result.totalQuantity.toLocaleString("zh-CN")],
            ["总买入金额", currency(result.totalAmount)],
            ["总交易费用", currency(result.totalFee)],
            ["加权平均价格", currency(result.averagePrice)],
            ["含费用平均成本", currency(result.averageCost)],
          ]}
          title="计算结果"
        />
      </div>
    </CalculatorShell>
  );
}

function useCalculatorFeeSettings() {
  const [templates, setTemplates] = useState<FeeTemplate[]>([]);
  const [assetType, setAssetType] = useState<AssetType>("stock");
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [customEnabled, setCustomEnabled] = useState(false);
  const [customSettings, setCustomSettings] = useState<FeeSettings>(defaultFeeSettings);

  const selectedTemplate = useMemo(
    () => resolveFeeTemplate(templates, assetType, { preferredTemplateId: selectedTemplateId ?? undefined }),
    [assetType, selectedTemplateId, templates],
  );

  const templateSettings = useMemo(
    () => (selectedTemplate ? templateToFeeSettings(selectedTemplate) : { ...defaultFeeSettings, assetType }),
    [assetType, selectedTemplate],
  );

  const effectiveSettings = useMemo(
    () => ({
      ...(customEnabled ? customSettings : templateSettings),
      assetType,
    }),
    [assetType, customEnabled, customSettings, templateSettings],
  );

  useEffect(() => {
    let cancelled = false;
    loadFeeTemplates()
      .then((items) => {
        if (cancelled) return;
        setTemplates(items);
        const preferences = loadFeePreferences();
        const initialAssetType = defaultFeeSettings.assetType;
        const resolved = resolveFeeTemplate(items, initialAssetType, {
          preferredTemplateId: preferences.calculatorTemplateId,
        });
        if (resolved) {
          setAssetType(resolved.assetType);
          setSelectedTemplateId(resolved.id);
          setCustomSettings(templateToFeeSettings(resolved));
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

  function selectTemplate(templateId: number) {
    const template = templates.find((item) => item.id === templateId);
    if (!template) return;
    setSelectedTemplateId(template.id);
    setAssetType(template.assetType);
    saveFeePreferences({ calculatorTemplateId: template.id });
  }

  function changeAssetType(nextAssetType: AssetType) {
    const resolved = resolveFeeTemplate(templates, nextAssetType, {
      preferredTemplateId: selectedTemplateId ?? undefined,
    });
    setAssetType(nextAssetType);
    if (resolved) {
      setSelectedTemplateId(resolved.id);
      saveFeePreferences({ calculatorTemplateId: resolved.id });
    }
    setCustomSettings((current) => ({
      ...current,
      assetType: nextAssetType,
      stampTaxRate: nextAssetType === "stock" ? current.stampTaxRate : 0,
    }));
  }

  function updateCustomSettings(next: FeeSettings) {
    setCustomSettings({ ...next, assetType });
  }

  return {
    assetType,
    changeAssetType,
    customEnabled,
    customSettings,
    effectiveSettings,
    selectTemplate,
    selectedTemplateId,
    setCustomEnabled,
    setCustomSettings: updateCustomSettings,
    templates,
  };
}

function CalculatorFeePanel({
  assetType,
  compact = false,
  customEnabled,
  customSettings,
  mode = "full",
  selectTemplate,
  selectedTemplateId,
  setCustomEnabled,
  setCustomSettings,
  templates,
  trailing = null,
}: ReturnType<typeof useCalculatorFeeSettings> & {
  compact?: boolean;
  mode?: "full" | "custom-only";
  trailing?: ReactNode;
}) {
  const [templateOpen, setTemplateOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const templateOptions = templates.filter((template) => template.assetType === assetType);

  function updateCustom<K extends keyof FeeSettings>(key: K, value: FeeSettings[K]) {
    const next = { ...customSettings, [key]: value, assetType };
    if (key === "assetType") {
      next.stampTaxRate = value === "stock" ? customSettings.stampTaxRate : 0;
    }
    setCustomSettings(next);
  }

  const hasExpanded = (mode === "full" && templateOpen && templateOptions.length > 0) || customOpen;

  return (
    <section className={`calculator-fee-panel${compact ? " calculator-fee-panel--compact" : ""}`}>
      <div className="calculator-fee-toggles">
        <div className="t-fee-toggle-stack">
          {mode === "full" && templateOptions.length ? (
            <button
              aria-expanded={templateOpen}
              className="trade-fee-template-toggle"
              onClick={() => setTemplateOpen((open) => !open)}
              type="button"
            >
              <span>费率模板</span>
              <span aria-hidden="true" className="trade-fee-template-caret">
                {templateOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </span>
            </button>
          ) : null}
          <button
            aria-expanded={customOpen}
            className="trade-fee-template-toggle"
            onClick={() => setCustomOpen((open) => !open)}
            type="button"
          >
            <span>自定义</span>
            <span aria-hidden="true" className="trade-fee-template-caret">
              {customOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </span>
          </button>
        </div>
      </div>

      {compact ? trailing : null}

      {hasExpanded ? (
        <div className="calculator-fee-expanded">
          {mode === "full" && templateOpen && templateOptions.length ? (
            <div className="trade-fee-template-field">
              <AppSelect
                className="trade-fee-template-select"
                onChange={(value) => {
                  selectTemplate(Number(value));
                  setTemplateOpen(false);
                }}
                options={templateOptions.map((template) => ({
                  label: feeTemplateLabel(template),
                  value: template.id,
                }))}
                value={selectedTemplateId ?? templateOptions[0]?.id ?? null}
              />
            </div>
          ) : null}

          {customOpen ? (
            <div className="trade-fee-template-field calculator-custom-fee-fields">
              <AppSwitch
                aria-label="自定义费率"
                checked={customEnabled}
                checkedChildren="开启"
                className="calculator-custom-fee-enable"
                onChange={setCustomEnabled}
                unCheckedChildren="关闭"
              />
              <div className="fee-fields calculator-custom-fee-grid">
                <label>
                  佣金模式
                  <AppSelect
                    onChange={(value) => updateCustom("commissionMode", value)}
                    options={[
                      { label: "按比例", value: "rate" },
                      { label: "固定手续费", value: "fixed" },
                    ]}
                    value={customSettings.commissionMode}
                  />
                </label>
                {customSettings.commissionMode === "fixed" ? (
                  <AppNumberStepper
                    label="固定手续费"
                    onChange={(value) => updateCustom("fixedCommission", value ?? 0)}
                    step={0.01}
                    value={customSettings.fixedCommission}
                  />
                ) : (
                  <>
                    <AppNumberStepper
                      label="佣金费率(%)"
                      onChange={(value) => updateCustom("commissionRate", value ?? 0)}
                      step={0.001}
                      value={customSettings.commissionRate}
                    />
                    <AppNumberStepper label="最低佣金" onChange={(value) => updateCustom("minCommission", value ?? 0)} step={0.01} value={customSettings.minCommission} />
                  </>
                )}
                <AppNumberStepper
                  label="印花税率(%)"
                  onChange={(value) => updateCustom("stampTaxRate", value ?? 0)}
                  step={0.001}
                  value={customSettings.stampTaxRate}
                />
                <AppNumberStepper
                  label="过户费率(%)"
                  onChange={(value) => updateCustom("transferRate", value ?? 0)}
                  step={0.001}
                  value={customSettings.transferRate}
                />
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function CalculatorShell({ children }: { children: ReactNode }) {
  return <section className="calculator-shell">{children}</section>;
}

function ResultTable({
  rows,
  title,
  columns = 1,
}: {
  rows: Array<[string, string, number?]>;
  title: string;
  columns?: 1 | 2;
}) {
  const copyText = rows.map(([name, value]) => `${name}\t${value}`).join("\n");

  return (
    <section className={["panel result-panel", columns === 2 ? "result-panel--cols-2" : ""].filter(Boolean).join(" ")}>
      <div className="section-header">
        <h2>{title}</h2>
        <button className="text-button" onClick={() => void navigator.clipboard?.writeText(copyText)} type="button">
          <Copy size={15} />
          复制
        </button>
      </div>
      {columns === 2 ? (
        <div className="result-grid-2">
          {rows.map(([name, value, tone]) => (
            <div className="result-grid-item" key={name}>
              <span className="result-grid-label">{name}</span>
              <span className={["result-grid-value", tone === undefined ? "" : tone >= 0 ? "positive" : "negative"].filter(Boolean).join(" ")}>
                {value}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <table className="result-table">
          <tbody>
            {rows.map(([name, value, tone]) => (
              <tr key={name}>
                <th>{name}</th>
                <td className={tone === undefined ? "" : tone >= 0 ? "positive" : "negative"}>{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
