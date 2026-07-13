import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Calculator, ChevronDown, ChevronRight, Copy, Plus, Trash2 } from "lucide-react";
import { AppSelect } from "../../components/AppSelect";
import { AppNumberStepper } from "../../components/AppNumberStepper";
import { AppSwitch } from "../../components/AppSwitch";
import { feeTemplateLabel, loadFeePreferences, loadFeeTemplates, resolveFeeTemplate, saveFeePreferences, templateToFeeSettings, type FeeTemplate } from "../settings/api";
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

const calculatorTabMeta: Record<CalculatorTab, { title: string; description: string }> = {
  profit: {
    title: "利润成本计算器",
    description: "按股票或 ETF 费率计算一买一卖后的净盈亏、净利润率和交易成本。",
  },
  t: {
    title: "做 T 计算器",
    description: "根据底仓、当日买入和当日卖出计算做 T 后成本、现金流和当日 T 盈亏。",
  },
  change: {
    title: "涨跌幅计算器",
    description: "输入基准价和当前价计算涨跌幅，也可以输入目标涨跌幅反推目标价格。",
  },
  average: {
    title: "平均价格计算器",
    description: "录入多笔买入价格、数量和费用，计算加权平均价格与含费用平均成本。",
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
          <div>
            <p className="eyebrow">Tools</p>
            <h1>交易计算器</h1>
          </div>
          <span className="stage-pill">工具箱</span>
        </header>
        <div className="panel calculator-page-heading">
          <Calculator aria-hidden="true" size={28} />
          <div>
            <p className="eyebrow">Calculator</p>
            <h2>{activeMeta.title}</h2>
            <p>{activeMeta.description}</p>
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

function FeeTemplateSelector({
  assetType,
  selectedTemplateId,
  templates,
  onSelect,
}: {
  assetType: AssetType;
  selectedTemplateId: number | null;
  templates: FeeTemplate[];
  onSelect: (templateId: number) => void;
}) {
  const options = templates.filter((template) => template.assetType === assetType);
  if (!options.length) return null;

  return (
    <label className="fee-template-select">
      费率模板
      <AppSelect
        onChange={onSelect}
        options={options.map((template) => ({
          label: feeTemplateLabel(template),
          value: template.id,
        }))}
        value={selectedTemplateId ?? options[0]?.id ?? null}
      />
    </label>
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
        <AppSelect
          onChange={(value) => update("assetType", value)}
          options={[
            { label: "股票", value: "stock" },
            { label: "ETF", value: "etf" },
          ]}
          value={settings.assetType}
        />
      </label>
      <label>
        佣金模式
        <AppSelect
          onChange={(value) => update("commissionMode", value)}
          options={[
            { label: "按比例", value: "rate" },
            { label: "固定手续费", value: "fixed" },
          ]}
          value={settings.commissionMode}
        />
      </label>
      {settings.commissionMode === "fixed" ? (
        <NumberField label="固定手续费" onChange={(value) => update("fixedCommission", value)} step={0.01} stepper value={settings.fixedCommission} />
      ) : (
        <>
          <NumberField label="佣金费率(%)" value={settings.commissionRate} onChange={(value) => update("commissionRate", value)} step={0.001} />
          <NumberField label="最低佣金" value={settings.minCommission} onChange={(value) => update("minCommission", value)} step={0.01} />
        </>
      )}
      <NumberField label="印花税率(%)" value={settings.stampTaxRate} onChange={(value) => update("stampTaxRate", value)} step={0.001} />
      <NumberField label="过户费率(%)" value={settings.transferRate} onChange={(value) => update("transferRate", value)} step={0.001} />
    </section>
  );
}

function ProfitCostCalculator() {
  const fee = useProfitCostFeeSettings();
  const [buyPrice, setBuyPrice] = useState<number | null>(null);
  const [sellPrice, setSellPrice] = useState<number | null>(null);
  const [quantity, setQuantity] = useState<number | null>(null);
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

  return (
    <CalculatorShell>
      <div className="calculator-form">
        <div className="panel">
          <h2>输入参数</h2>
          <div className="calculator-input-grid">
            <AppNumberStepper label="买入价格" onChange={setBuyPrice} step={0.01} value={buyPrice} />
            <AppNumberStepper label="卖出价格" onChange={setSellPrice} step={0.01} value={sellPrice} />
            <AppNumberStepper label="买入数量" normalizeToStep onChange={setQuantity} step={100} value={quantity} />
          </div>
          <ProfitCostFeePanel {...fee} />
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
  const { settings, setSettings, selectedTemplateId, setSelectedTemplateId, templates } = useTemplateFeeSettings();
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
    <CalculatorShell>
      <div className="calculator-form">
        <div className="panel">
          <h2>输入参数</h2>
          <div className="calculator-input-grid">
            <NumberField label="原持仓数量" value={baseQuantity} onChange={setBaseQuantity} step={100} />
            <NumberField label="原平均成本" value={baseAvgCost} onChange={setBaseAvgCost} step={0.01} />
            <label>
              操作顺序
              <AppSelect
                onChange={setSequence}
                options={[
                  { label: "先买后卖", value: "buyFirst" },
                  { label: "先卖后买", value: "sellFirst" },
                ]}
                value={sequence}
              />
            </label>
            <NumberField label="当日买入价格" value={buyPrice} onChange={setBuyPrice} step={0.01} />
            <NumberField label="当日买入数量" value={buyQuantity} onChange={setBuyQuantity} step={100} />
            <NumberField label="当日卖出价格" value={sellPrice} onChange={setSellPrice} step={0.01} />
            <NumberField label="当日卖出数量" value={sellQuantity} onChange={setSellQuantity} step={100} />
          </div>
          <FeeTemplateSelector
            assetType={settings.assetType}
            selectedTemplateId={selectedTemplateId}
            templates={templates}
            onSelect={setSelectedTemplateId}
          />
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

function useProfitCostFeeSettings() {
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

function ProfitCostFeePanel({
  assetType,
  changeAssetType,
  customEnabled,
  customSettings,
  selectTemplate,
  selectedTemplateId,
  setCustomEnabled,
  setCustomSettings,
  templates,
}: ReturnType<typeof useProfitCostFeeSettings>) {
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

  return (
    <section className="calculator-fee-panel">
      <label>
        成本类型
        <AppSelect
          onChange={changeAssetType}
          options={[
            { label: "股票", value: "stock" },
            { label: "ETF", value: "etf" },
          ]}
          value={assetType}
        />
      </label>

      {templateOptions.length ? (
        <div className="trade-fee-template-field">
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
          {templateOpen ? (
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
          ) : null}
        </div>
      ) : null}

      <div className="trade-fee-template-field">
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
        {customOpen ? (
          <div className="calculator-custom-fee-fields">
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
    </section>
  );
}

function useTemplateFeeSettings() {
  const [templates, setTemplates] = useState<FeeTemplate[]>([]);
  const [settings, setSettings] = useState(defaultFeeSettings);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadFeeTemplates()
      .then((items) => {
        if (cancelled) return;
        setTemplates(items);
        const preferences = loadFeePreferences();
        const preferred = preferences.calculatorTemplateId
          ? resolveFeeTemplate(items, settings.assetType, { preferredTemplateId: preferences.calculatorTemplateId })
          : null;
        const resolved = preferred ?? resolveFeeTemplate(items, settings.assetType);
        if (resolved) {
          setSelectedTemplateId(resolved.id);
          setSettings(templateToFeeSettings(resolved));
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
    setSettings(templateToFeeSettings(template));
    saveFeePreferences({ calculatorTemplateId: template.id });
  }

  function updateSettings(next: FeeSettings) {
    if (next.assetType !== settings.assetType) {
      const resolved = resolveFeeTemplate(templates, next.assetType);
      if (resolved) {
        setSelectedTemplateId(resolved.id);
        setSettings(templateToFeeSettings(resolved));
        saveFeePreferences({ calculatorTemplateId: resolved.id });
        return;
      }
    }
    setSettings(next);
  }

  return {
    settings,
    setSettings: updateSettings,
    selectedTemplateId,
    setSelectedTemplateId: selectTemplate,
    templates,
  };
}

function CalculatorShell({ children }: { children: ReactNode }) {
  return <section className="calculator-shell">{children}</section>;
}

function NumberField({
  label,
  min = 0,
  normalizeToStep = false,
  onChange,
  step = 1,
  stepper = false,
  value,
}: {
  label: string;
  min?: number;
  normalizeToStep?: boolean;
  onChange: (value: number) => void;
  step?: number;
  stepper?: boolean;
  value: number;
}) {
  if (stepper) {
    return (
      <AppNumberStepper label={label} min={min} normalizeToStep={normalizeToStep} onChange={(value) => onChange(value ?? 0)} step={step} value={value} />
    );
  }

  return (
    <label>
      {label}
      <input min={min} step={step} type="number" value={Number.isFinite(value) ? value : 0} onChange={(event) => onChange(Number(event.target.value))} />
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
