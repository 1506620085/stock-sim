import { useMemo, useState, type ReactNode } from "react";
import { Calculator, Copy, Plus, Trash2 } from "lucide-react";
import {
  calculateAverage,
  calculateChange,
  calculateProfitCost,
  calculateTTrade,
  defaultFeeSettings,
  type AssetType,
  type AverageLine,
  type FeeSettings,
} from "./calculations";

type CalculatorTab = "profit" | "t" | "change" | "average";

const tabs: Array<{ id: CalculatorTab; label: string }> = [
  { id: "profit", label: "利润成本" },
  { id: "t", label: "做 T" },
  { id: "change", label: "涨跌幅" },
  { id: "average", label: "平均价格" },
];

const currency = (value: number) =>
  value.toLocaleString("zh-CN", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });

const percent = (value: number) => `${value.toFixed(2)}%`;

export function CalculatorsPage() {
  const [activeTab, setActiveTab] = useState<CalculatorTab>("profit");

  return (
    <section className="calculators-page">
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

function FeeFields({ settings, onChange }: { settings: FeeSettings; onChange: (settings: FeeSettings) => void }) {
  function update<K extends keyof FeeSettings>(key: K, value: FeeSettings[K]) {
    const next = { ...settings, [key]: value };
    if (key === "assetType") {
      next.stampTaxRate = value === "stock" ? 0.05 : 0;
    }
    onChange(next);
  }

  return (
    <section className="fee-fields">
      <label>
        成本类型
        <select value={settings.assetType} onChange={(event) => update("assetType", event.target.value as AssetType)}>
          <option value="stock">股票</option>
          <option value="etf">ETF</option>
        </select>
      </label>
      <NumberField label="佣金费率(%)" value={settings.commissionRate} onChange={(value) => update("commissionRate", value)} step={0.001} />
      <NumberField label="最低佣金" value={settings.minCommission} onChange={(value) => update("minCommission", value)} step={0.01} />
      <NumberField label="印花税率(%)" value={settings.stampTaxRate} onChange={(value) => update("stampTaxRate", value)} step={0.001} />
      <NumberField label="过户费率(%)" value={settings.transferRate} onChange={(value) => update("transferRate", value)} step={0.001} />
    </section>
  );
}

function ProfitCostCalculator() {
  const [settings, setSettings] = useState(defaultFeeSettings);
  const [buyPrice, setBuyPrice] = useState(10);
  const [sellPrice, setSellPrice] = useState(11.8);
  const [quantity, setQuantity] = useState(1000);
  const result = useMemo(() => calculateProfitCost({ ...settings, buyPrice, sellPrice, quantity }), [buyPrice, quantity, sellPrice, settings]);

  return (
    <CalculatorShell description="按股票或 ETF 费率计算一买一卖后的净盈亏、净利润率和交易成本。" title="利润成本计算器">
      <div className="calculator-form">
        <div className="panel">
          <h2>输入参数</h2>
          <div className="calculator-input-grid">
            <NumberField label="买入价格" value={buyPrice} onChange={setBuyPrice} step={0.01} />
            <NumberField label="卖出价格" value={sellPrice} onChange={setSellPrice} step={0.01} />
            <NumberField label="买入数量" value={quantity} onChange={setQuantity} step={100} />
          </div>
          <FeeFields settings={settings} onChange={setSettings} />
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
  const [settings, setSettings] = useState(defaultFeeSettings);
  const [baseQuantity, setBaseQuantity] = useState(1000);
  const [baseAvgCost, setBaseAvgCost] = useState(10);
  const [sequence, setSequence] = useState<"buyFirst" | "sellFirst">("buyFirst");
  const [buyPrice, setBuyPrice] = useState(9.8);
  const [buyQuantity, setBuyQuantity] = useState(500);
  const [sellPrice, setSellPrice] = useState(10.3);
  const [sellQuantity, setSellQuantity] = useState(500);
  const result = useMemo(
    () => calculateTTrade({ ...settings, baseQuantity, baseAvgCost, sequence, buyPrice, buyQuantity, sellPrice, sellQuantity }),
    [baseAvgCost, baseQuantity, buyPrice, buyQuantity, sellPrice, sellQuantity, sequence, settings],
  );

  return (
    <CalculatorShell description="根据底仓、当日买入和当日卖出计算做 T 后成本、现金流和当日 T 盈亏。" title="做 T 计算器">
      <div className="calculator-form">
        <div className="panel">
          <h2>输入参数</h2>
          <div className="calculator-input-grid">
            <NumberField label="原持仓数量" value={baseQuantity} onChange={setBaseQuantity} step={100} />
            <NumberField label="原平均成本" value={baseAvgCost} onChange={setBaseAvgCost} step={0.01} />
            <label>
              操作顺序
              <select value={sequence} onChange={(event) => setSequence(event.target.value as "buyFirst" | "sellFirst")}>
                <option value="buyFirst">先买后卖</option>
                <option value="sellFirst">先卖后买</option>
              </select>
            </label>
            <NumberField label="当日买入价格" value={buyPrice} onChange={setBuyPrice} step={0.01} />
            <NumberField label="当日买入数量" value={buyQuantity} onChange={setBuyQuantity} step={100} />
            <NumberField label="当日卖出价格" value={sellPrice} onChange={setSellPrice} step={0.01} />
            <NumberField label="当日卖出数量" value={sellQuantity} onChange={setSellQuantity} step={100} />
          </div>
          <FeeFields settings={settings} onChange={setSettings} />
        </div>
        <ResultTable
          rows={[
            ["当日买入金额", currency(result.buyAmount)],
            ["当日买入费用", currency(result.buyFees)],
            ["当日卖出金额", currency(result.sellAmount)],
            ["当日卖出费用", currency(result.sellFees)],
            ["做 T 净现金流", currency(result.cashFlow), result.cashFlow],
            ["做 T 已实现盈亏", currency(result.realizedProfit), result.realizedProfit],
            ["做 T 后剩余持仓", result.finalQuantity.toLocaleString("zh-CN")],
            ["做 T 后持仓成本", currency(result.finalCost)],
            ["做 T 后平均成本", currency(result.finalAvgCost)],
          ]}
          title="计算结果"
        />
      </div>
    </CalculatorShell>
  );
}

function ChangeCalculator() {
  const [basePrice, setBasePrice] = useState(10);
  const [currentPrice, setCurrentPrice] = useState(11.2);
  const [targetRate, setTargetRate] = useState(8);
  const result = useMemo(() => calculateChange({ basePrice, currentPrice, targetRate }), [basePrice, currentPrice, targetRate]);

  return (
    <CalculatorShell description="输入基准价和当前价计算涨跌幅，也可以输入目标涨跌幅反推目标价格。" title="涨跌幅计算器">
      <div className="calculator-form">
        <div className="panel">
          <h2>输入参数</h2>
          <div className="calculator-input-grid">
            <NumberField label="基准价格" value={basePrice} onChange={setBasePrice} step={0.01} />
            <NumberField label="当前价格" value={currentPrice} onChange={setCurrentPrice} step={0.01} />
            <NumberField label="目标涨跌幅(%)" value={targetRate} onChange={setTargetRate} step={0.1} />
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
  const [lines, setLines] = useState<AverageLine[]>([
    { id: "1", price: 10, quantity: 1000, fee: 5 },
    { id: "2", price: 9.2, quantity: 1000, fee: 5 },
  ]);
  const result = useMemo(() => calculateAverage(lines), [lines]);

  function updateLine(id: string, patch: Partial<AverageLine>) {
    setLines((items) => items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function addLine() {
    setLines((items) => [...items, { id: crypto.randomUUID(), price: 0, quantity: 0, fee: 0 }]);
  }

  function removeLine(id: string) {
    setLines((items) => (items.length > 1 ? items.filter((item) => item.id !== id) : items));
  }

  return (
    <CalculatorShell description="录入多笔买入价格、数量和费用，计算加权平均价格与含费用平均成本。" title="平均价格计算器">
      <div className="calculator-form">
        <div className="panel">
          <div className="section-header">
            <h2>买入明细</h2>
            <button className="text-button" onClick={addLine} type="button">
              <Plus size={15} />
              新增
            </button>
          </div>
          <div className="average-lines">
            {lines.map((line, index) => (
              <div className="average-line" key={line.id}>
                <span>{index + 1}</span>
                <NumberField label="价格" value={line.price} onChange={(value) => updateLine(line.id, { price: value })} step={0.01} />
                <NumberField label="数量" value={line.quantity} onChange={(value) => updateLine(line.id, { quantity: value })} step={100} />
                <NumberField label="费用" value={line.fee} onChange={(value) => updateLine(line.id, { fee: value })} step={0.01} />
                <button aria-label="删除买入行" className="icon-button danger-button" onClick={() => removeLine(line.id)} type="button">
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
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

function CalculatorShell({ children, description, title }: { children: ReactNode; description: string; title: string }) {
  return (
    <section className="calculator-shell">
      <div className="panel calculator-heading">
        <Calculator aria-hidden="true" size={28} />
        <div>
          <p className="eyebrow">Calculator</p>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function NumberField({ label, onChange, step = 1, value }: { label: string; onChange: (value: number) => void; step?: number; value: number }) {
  return (
    <label>
      {label}
      <input min={0} step={step} type="number" value={Number.isFinite(value) ? value : 0} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function ResultTable({ rows, title }: { rows: Array<[string, string, number?]>; title: string }) {
  const copyText = rows.map(([name, value]) => `${name}\t${value}`).join("\n");

  return (
    <section className="panel result-panel">
      <div className="section-header">
        <h2>{title}</h2>
        <button className="text-button" onClick={() => void navigator.clipboard?.writeText(copyText)} type="button">
          <Copy size={15} />
          复制
        </button>
      </div>
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
    </section>
  );
}
