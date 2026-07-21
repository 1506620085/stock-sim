import { useEffect, useMemo, useState, type FormEvent, type MouseEvent, type ReactNode } from "react";
import { Calculator, Copy, Download, FilePlus, Layers, Pencil, PiggyBank, Plus, Save, Trash2 } from "lucide-react";
import { AppSelect } from "../../components/AppSelect";
import { AppNumberStepper } from "../../components/AppNumberStepper";
import { FieldLabelWithTip } from "../../components/FieldHelpTip";
import { showInfo, showSuccess } from "../../components/ToastProvider";
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
import {
  defaultTHistoryName,
  deleteTHistory,
  formatTHistoryTime,
  loadTHistory,
  renameTHistory,
  upsertTHistory,
  type THistorySession,
} from "./tHistory";

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
  const { assetType, changeAssetType } = useCalculatorAssetType();
  const [buyPrice, setBuyPrice] = useState<number | null>(null);
  const [sellPrice, setSellPrice] = useState<number | null>(null);
  const [quantity, setQuantity] = useState<number | null>(null);
  const priceStep = assetType === "etf" ? 0.001 : 0.01;
  const feeSettings = useMemo(() => feeSettingsForAssetType(assetType), [assetType]);
  const result = useMemo(
    () =>
      calculateProfitCost({
        ...feeSettings,
        buyPrice: buyPrice ?? 0,
        sellPrice: sellPrice ?? 0,
        quantity: quantity ?? 0,
      }),
    [buyPrice, feeSettings, quantity, sellPrice],
  );

  useEffect(() => {
    setBuyPrice((current) => (current == null ? current : Number(current.toFixed(assetType === "etf" ? 3 : 2))));
    setSellPrice((current) => (current == null ? current : Number(current.toFixed(assetType === "etf" ? 3 : 2))));
  }, [assetType]);

  return (
    <CalculatorShell>
      <div className="calculator-form">
        <div className="panel">
          <h2>输入参数</h2>
          <div className="calculator-asset-type-field">
            <FieldLabelWithTip
              htmlFor="profit-cost-asset-type"
              tip="成本类型决定费率与价格精度：股票卖出计印花税、价格两位小数；ETF 不计印花税、价格三位小数。佣金等按系统默认费率计算。"
              tipAriaLabel="成本类型说明"
            >
              成本类型
            </FieldLabelWithTip>
            <AppSelect
              id="profit-cost-asset-type"
              onChange={changeAssetType}
              options={[
                { label: "股票", value: "stock" },
                { label: "ETF", value: "etf" },
              ]}
              value={assetType}
            />
          </div>
          <div className="calculator-input-grid">
            <AppNumberStepper label="买入价格" normalizeToStep onChange={setBuyPrice} step={priceStep} value={buyPrice} />
            <AppNumberStepper label="卖出价格" normalizeToStep onChange={setSellPrice} step={priceStep} value={sellPrice} />
            <AppNumberStepper label="买入数量" normalizeToStep onChange={setQuantity} step={100} value={quantity} />
          </div>
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
  const { assetType, changeAssetType } = useCalculatorAssetType();
  const [baseAvgCost, setBaseAvgCost] = useState<number | null>(null);
  const [baseQuantity, setBaseQuantity] = useState<number | null>(null);
  const [tradeSide, setTradeSide] = useState<"buy" | "sell">("buy");
  const [tradePrice, setTradePrice] = useState<number | null>(null);
  const [tradeQuantity, setTradeQuantity] = useState<number | null>(null);
  const [finalPrice, setFinalPrice] = useState<number | null>(null);
  const [entries, setEntries] = useState<TLedgerEntryInput[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [historyList, setHistoryList] = useState<THistorySession[]>(() => loadTHistory());
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [dialog, setDialog] = useState<THistoryDialog | null>(null);

  const priceStep = assetType === "etf" ? 0.001 : 0.01;
  const feeSettings = useMemo(() => feeSettingsForAssetType(assetType), [assetType]);
  const { rows, summary } = useMemo(
    () => buildTLedger(entries, feeSettings, { finalPrice }),
    [entries, feeSettings, finalPrice],
  );

  useEffect(() => {
    const decimals = assetType === "etf" ? 3 : 2;
    setBaseAvgCost((current) => (current == null ? current : Number(current.toFixed(decimals))));
    setTradePrice((current) => (current == null ? current : Number(current.toFixed(decimals))));
    setFinalPrice((current) => (current == null ? current : Number(current.toFixed(decimals))));
  }, [assetType]);

  useEffect(() => {
    if (!dialog) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDialog(null);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [dialog]);

  function markDirty() {
    setDirty(true);
  }

  function closeDialog() {
    setDialog(null);
  }

  function buildSnapshot(id: string, name: string, createdAt: string): THistorySession {
    const now = new Date().toISOString();
    return {
      id,
      name,
      createdAt,
      updatedAt: now,
      assetType,
      baseAvgCost,
      baseQuantity,
      finalPrice,
      tradeSide,
      entries,
    };
  }

  function applyHistorySession(session: THistorySession) {
    changeAssetType(session.assetType);
    setBaseAvgCost(session.baseAvgCost);
    setBaseQuantity(session.baseQuantity);
    setFinalPrice(session.finalPrice);
    setTradeSide(session.tradeSide);
    setTradePrice(null);
    setTradeQuantity(null);
    setEntries(session.entries.map((entry) => ({ ...entry })));
    setSelectedIds([]);
    setActiveHistoryId(session.id);
    setDirty(false);
    showSuccess(`已打开「${session.name}」`);
  }

  function clearWorkspace() {
    setBaseAvgCost(null);
    setBaseQuantity(null);
    setTradeSide("buy");
    setTradePrice(null);
    setTradeQuantity(null);
    setFinalPrice(null);
    setEntries([]);
    setSelectedIds([]);
    setActiveHistoryId(null);
    setDirty(false);
    showSuccess("已新建空白做 T");
  }

  function saveHistory() {
    if (!entries.some((entry) => entry.side === "init")) {
      showInfo("请先初始化底仓后再保存。");
      return;
    }

    const existing = activeHistoryId ? historyList.find((item) => item.id === activeHistoryId) : undefined;
    if (existing) {
      const next = upsertTHistory(buildSnapshot(existing.id, existing.name, existing.createdAt));
      setHistoryList(next);
      setActiveHistoryId(existing.id);
      setDirty(false);
      showSuccess("历史记录已更新");
      return;
    }

    setDialog({ type: "saveName", draft: defaultTHistoryName() });
  }

  function confirmSaveName() {
    if (dialog?.type !== "saveName") return;
    const suggested = defaultTHistoryName();
    const name = dialog.draft.trim() || suggested;
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const next = upsertTHistory(buildSnapshot(id, name, now));
    setHistoryList(next);
    setActiveHistoryId(id);
    setDirty(false);
    closeDialog();
    showSuccess("已保存到做 T 历史");
  }

  function openHistory(session: THistorySession) {
    if (activeHistoryId === session.id && !dirty) return;
    if (dirty) {
      setDialog({ type: "confirmOpen", session });
      return;
    }
    applyHistorySession(session);
  }

  function startFresh() {
    const hasContent =
      dirty ||
      activeHistoryId != null ||
      entries.length > 0 ||
      baseAvgCost != null ||
      baseQuantity != null ||
      finalPrice != null ||
      tradePrice != null ||
      tradeQuantity != null;
    if (!hasContent) {
      clearWorkspace();
      return;
    }
    setDialog({
      type: "confirmFresh",
      message: dirty ? "当前有未保存的修改，新建将清空工作区，是否继续？" : "确定清空当前做 T，从头开始？",
    });
  }

  function handleRenameHistory(session: THistorySession, event: MouseEvent) {
    event.stopPropagation();
    setDialog({ type: "rename", sessionId: session.id, draft: session.name });
  }

  function confirmRename() {
    if (dialog?.type !== "rename") return;
    const name = dialog.draft.trim();
    if (!name) {
      showInfo("名称不能为空。");
      return;
    }
    setHistoryList(renameTHistory(dialog.sessionId, name));
    closeDialog();
    showSuccess("已重命名");
  }

  function handleDeleteHistory(session: THistorySession, event: MouseEvent) {
    event.stopPropagation();
    setDialog({ type: "confirmDelete", session });
  }

  function confirmDeleteHistory() {
    if (dialog?.type !== "confirmDelete") return;
    const session = dialog.session;
    const next = deleteTHistory(session.id);
    setHistoryList(next);
    if (activeHistoryId === session.id) {
      setActiveHistoryId(null);
    }
    closeDialog();
    showSuccess("已删除历史记录");
  }

  function initBasePosition() {
    const cost = baseAvgCost ?? 0;
    const quantity = baseQuantity ?? 0;
    if (cost <= 0 || quantity <= 0) {
      showInfo("请先填写有效的底仓成本价与底仓数量。");
      return;
    }
    setEntries([{ id: crypto.randomUUID(), side: "init", price: cost, quantity }]);
    setSelectedIds([]);
    markDirty();
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
    markDirty();
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

    const initIds = new Set(entries.filter((entry) => entry.side === "init").map((entry) => entry.id));
    const deletingInit = selectedIds.some((id) => initIds.has(id));
    const deletableIds = selectedIds.filter((id) => !initIds.has(id));

    if (deletingInit) {
      showInfo("初始底仓不可删除");
    }

    if (!deletableIds.length) {
      setSelectedIds((ids) => ids.filter((id) => !initIds.has(id)));
      return;
    }

    setEntries((items) => items.filter((item) => !deletableIds.includes(item.id)));
    setSelectedIds([]);
    markDirty();
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
      ["已实现利润", currency(summary.realizedPnl)],
      ["可提取利润", currency(summary.extractableProfit)],
      ["剩余持仓成本", currency(summary.positionCost)],
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
                    <AppNumberStepper
                      label="底仓成本价"
                      onChange={(value) => {
                        setBaseAvgCost(value);
                        markDirty();
                      }}
                      step={priceStep}
                      value={baseAvgCost}
                    />
                    <AppNumberStepper
                      label="底仓数量"
                      normalizeToStep
                      onChange={(value) => {
                        setBaseQuantity(value);
                        markDirty();
                      }}
                      step={100}
                      value={baseQuantity}
                    />
                    <AppNumberStepper
                      label={
                        <FieldLabelWithTip
                          tip="当前持仓若到达该价时的情景价。留空则总盈亏仍按最后成交价估算；填写后按该价与当前成本、股数重算未实现盈亏与总盈亏。"
                          tipAriaLabel="最终价格说明"
                        >
                          最终价格
                        </FieldLabelWithTip>
                      }
                      onChange={(value) => {
                        setFinalPrice(value);
                        markDirty();
                      }}
                      step={priceStep}
                      value={finalPrice}
                    />
                    <div className="calculator-asset-type-field">
                      <FieldLabelWithTip
                        htmlFor="t-asset-type"
                        tip="成本类型决定费率规则：股票卖出计印花税，ETF 不计；佣金等按系统默认费率计算。"
                        tipAriaLabel="成本类型说明"
                      >
                        成本类型
                      </FieldLabelWithTip>
                      <AppSelect
                        id="t-asset-type"
                        onChange={(value) => {
                          changeAssetType(value);
                          markDirty();
                        }}
                        options={[
                          { label: "股票", value: "stock" },
                          { label: "ETF", value: "etf" },
                        ]}
                        value={assetType}
                      />
                    </div>
                  </div>
                  <div className="calculator-input-grid t-input-grid t-input-grid--trade">
                    <label>
                      交易方向
                      <AppSelect
                        onChange={(value) => {
                          setTradeSide(value);
                          markDirty();
                        }}
                        options={[
                          { label: "买入", value: "buy" },
                          { label: "卖出", value: "sell" },
                        ]}
                        value={tradeSide}
                      />
                    </label>
                    <AppNumberStepper label="交易价格" onChange={setTradePrice} step={priceStep} value={tradePrice} />
                    <AppNumberStepper label="交易数量" normalizeToStep onChange={setTradeQuantity} step={100} value={tradeQuantity} />
                    <div className="t-peer-action">
                      <button className="primary-button t-init-button" onClick={initBasePosition} type="button">
                        <Layers size={14} />
                        底仓初始化
                      </button>
                    </div>
                  </div>
                  <div className="t-action-bar t-action-bar--row">
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
                <button className="sr-only" type="submit" tabIndex={-1} aria-hidden="true">
                  添加操作
                </button>
              </form>
            </div>
          </div>

          <div className="t-status-column">
            <ResultTable
              columns={3}
              footer={
                <p className="t-retention-hint">
                  {summary.extractableProfit > 0
                    ? summary.extractableProfit >= summary.positionCost
                      ? "可提取利润已覆盖剩余持仓成本。"
                      : "可提取利润尚未完全覆盖剩余持仓成本。"
                    : "当前暂无可提取利润。"}
                </p>
              }
              rows={[
                // 第1列：持仓现状
                ["当前持仓数量", summary.positionQuantity.toLocaleString("zh-CN")],
                ["当前平均成本", currency(summary.positionAvgCost)],
                ["当前持仓市值", currency(summary.positionMarketValue)],
                ["", ""],
                // 第2列：盈亏结果
                ["已实现盈亏", currency(summary.realizedPnl), summary.realizedPnl],
                ["未实现盈亏", currency(summary.unrealizedPnl), summary.unrealizedPnl],
                ["总盈亏", currency(summary.totalPnl), summary.totalPnl],
                ["", ""],
                // 第3列：费用与留存
                ["累计手续费", currency(summary.totalFees)],
                ["已实现利润", currency(summary.realizedPnl), summary.realizedPnl],
                ["可提取利润", currency(summary.extractableProfit), summary.extractableProfit],
                ["剩余持仓成本", currency(summary.positionCost)],
              ]}
              title="最终状态"
            />
          </div>
        </div>

        <div className="t-bottom-split">
          <section className="panel t-history-panel">
            <div className="section-header">
              <h2>做 T 历史</h2>
              <div className="t-history-header-actions">
                <button className="text-button" onClick={startFresh} type="button" title="清空工作区，从头做 T">
                  <FilePlus size={15} />
                  新建
                </button>
                <button
                  className="text-button"
                  disabled={Boolean(activeHistoryId) && !dirty}
                  onClick={saveHistory}
                  type="button"
                  title={activeHistoryId ? (dirty ? "更新当前历史" : "已与历史同步") : "保存为新历史"}
                >
                  <Save size={15} />
                  {activeHistoryId ? (dirty ? "更新" : "已保存") : "保存"}
                </button>
              </div>
            </div>
            <div className="t-history-list">
              {historyList.length ? (
                historyList.map((session) => {
                  const isActive = activeHistoryId === session.id;
                  return (
                    <div
                      className={`t-history-item${isActive ? " is-active" : ""}`}
                      key={session.id}
                      onClick={() => openHistory(session)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          openHistory(session);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                    >
                      <div className="t-history-item-main">
                        <div className="t-history-item-title">
                          <span className="t-history-item-name">{session.name}</span>
                          {isActive ? <span className="t-history-item-badge">当前</span> : null}
                        </div>
                        <div className="t-history-item-meta">
                          <span>{session.assetType === "etf" ? "ETF" : "股票"}</span>
                          <span>{session.entries.length} 笔</span>
                          <span>{formatTHistoryTime(session.updatedAt)}</span>
                        </div>
                      </div>
                      <div className="t-history-item-actions">
                        <button
                          aria-label={`重命名 ${session.name}`}
                          className="t-history-action"
                          onClick={(event) => handleRenameHistory(session, event)}
                          type="button"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          aria-label={`删除 ${session.name}`}
                          className="t-history-action t-history-action--danger"
                          onClick={(event) => handleDeleteHistory(session, event)}
                          type="button"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="t-history-empty">暂无历史，保存当前做 T 后会出现在这里</p>
              )}
            </div>
          </section>

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
      </div>

      {dialog ? (
        <div className="settings-modal-backdrop" onClick={closeDialog} role="presentation">
          <div
            aria-labelledby="t-history-dialog-title"
            aria-modal="true"
            className={`settings-modal${dialog.type === "saveName" || dialog.type === "rename" ? "" : " settings-confirm-modal"}`}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            {dialog.type === "saveName" || dialog.type === "rename" ? (
              <>
                <div className="section-header">
                  <h2 id="t-history-dialog-title">{dialog.type === "saveName" ? "保存做 T 历史" : "重命名"}</h2>
                </div>
                <label className="t-history-dialog-field">
                  名称
                  <input
                    autoFocus
                    onChange={(event) =>
                      setDialog((current) =>
                        current && (current.type === "saveName" || current.type === "rename")
                          ? { ...current, draft: event.target.value }
                          : current,
                      )
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        if (dialog.type === "saveName") confirmSaveName();
                        else confirmRename();
                      }
                    }}
                    type="text"
                    value={dialog.draft}
                  />
                </label>
                <div className="settings-actions">
                  <button className="secondary-button" onClick={closeDialog} type="button">
                    取消
                  </button>
                  <button
                    className="primary-button"
                    onClick={() => {
                      if (dialog.type === "saveName") confirmSaveName();
                      else confirmRename();
                    }}
                    type="button"
                  >
                    {dialog.type === "saveName" ? "保存" : "确定"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 id="t-history-dialog-title">
                  {dialog.type === "confirmDelete" ? "删除历史" : dialog.type === "confirmOpen" ? "打开历史" : "新建做 T"}
                </h2>
                <p className="settings-confirm-copy">
                  {dialog.type === "confirmDelete"
                    ? `确定删除「${dialog.session.name}」吗？删除后无法恢复。`
                    : dialog.type === "confirmOpen"
                      ? "当前有未保存的修改，打开历史将放弃这些修改，是否继续？"
                      : dialog.message}
                </p>
                <div className="settings-actions">
                  <button className="secondary-button" onClick={closeDialog} type="button">
                    取消
                  </button>
                  <button
                    className={`primary-button${dialog.type === "confirmDelete" ? " danger-confirm-button" : ""}`}
                    onClick={() => {
                      if (dialog.type === "confirmDelete") {
                        confirmDeleteHistory();
                      } else if (dialog.type === "confirmOpen") {
                        applyHistorySession(dialog.session);
                        closeDialog();
                      } else {
                        clearWorkspace();
                        closeDialog();
                      }
                    }}
                    type="button"
                  >
                    {dialog.type === "confirmDelete" ? "删除" : dialog.type === "confirmOpen" ? "打开" : "新建"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </CalculatorShell>
  );
}

type THistoryDialog =
  | { type: "saveName"; draft: string }
  | { type: "rename"; sessionId: string; draft: string }
  | { type: "confirmOpen"; session: THistorySession }
  | { type: "confirmFresh"; message: string }
  | { type: "confirmDelete"; session: THistorySession };

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
  const [basePrice, setBasePrice] = useState<number | null>(null);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [targetRate, setTargetRate] = useState<number | null>(null);
  const result = useMemo(
    () =>
      calculateChange({
        basePrice: basePrice ?? 0,
        currentPrice: currentPrice ?? 0,
        targetRate: targetRate ?? 0,
      }),
    [basePrice, currentPrice, targetRate],
  );

  return (
    <CalculatorShell>
      <div className="calculator-form">
        <div className="panel">
          <h2>输入参数</h2>
          <div className="calculator-input-grid">
            <AppNumberStepper label="基准价格" onChange={setBasePrice} step={0.01} value={basePrice} />
            <AppNumberStepper label="当前价格" onChange={setCurrentPrice} step={0.01} value={currentPrice} />
            <AppNumberStepper label="目标涨跌幅(%)" onChange={setTargetRate} step={0.1} value={targetRate} />
          </div>
        </div>
        <ResultTable
          rows={[
            [
              "涨跌金额",
              currentPrice == null ? "—" : currency(result.changeAmount),
              currentPrice == null ? undefined : result.changeAmount,
            ],
            [
              "涨跌幅",
              currentPrice == null ? "—" : percent(result.changeRate),
              currentPrice == null ? undefined : result.changeRate,
            ],
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
  const { assetType, changeAssetType } = useCalculatorAssetType();
  const [lines, setLines] = useState<AverageLine[]>([
    { id: "1", price: null, quantity: null },
    { id: "2", price: null, quantity: null },
  ]);
  const priceStep = assetType === "etf" ? 0.001 : 0.01;
  const feeSettings = useMemo(() => feeSettingsForAssetType(assetType), [assetType]);
  const result = useMemo(() => calculateAverage(lines, feeSettings), [feeSettings, lines]);

  useEffect(() => {
    const decimals = assetType === "etf" ? 3 : 2;
    setLines((items) =>
      items.map((line) => ({
        ...line,
        price: line.price == null ? null : Number(line.price.toFixed(decimals)),
      })),
    );
  }, [assetType]);

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
              tip="成本类型决定费率与价格精度：股票卖出计印花税、价格两位小数；ETF 不计印花税、价格三位小数。佣金等按系统默认费率计算。"
              tipAriaLabel="成本类型说明"
            >
              成本类型
            </FieldLabelWithTip>
            <AppSelect
              id="average-price-asset-type"
              onChange={changeAssetType}
              options={[
                { label: "股票", value: "stock" },
                { label: "ETF", value: "etf" },
              ]}
              value={assetType}
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

function feeSettingsForAssetType(assetType: AssetType): FeeSettings {
  return {
    ...defaultFeeSettings,
    assetType,
    stampTaxRate: assetType === "stock" ? defaultFeeSettings.stampTaxRate : 0,
  };
}

function useCalculatorAssetType() {
  const [assetType, setAssetType] = useState<AssetType>("stock");

  function changeAssetType(nextAssetType: AssetType) {
    setAssetType(nextAssetType);
  }

  return { assetType, changeAssetType };
}

function CalculatorShell({ children }: { children: ReactNode }) {
  return <section className="calculator-shell">{children}</section>;
}

function ResultTable({
  rows,
  title,
  columns = 1,
  footer = null,
}: {
  rows: Array<[string, string, number?]>;
  title: string;
  columns?: 1 | 2 | 3 | 4;
  footer?: ReactNode;
}) {
  const copyText = rows
    .filter(([name]) => name)
    .map(([name, value]) => `${name}\t${value}`)
    .join("\n");
  const gridClass =
    columns === 4 ? "result-grid-4" : columns === 3 ? "result-grid-3" : columns === 2 ? "result-grid-2" : null;

  return (
    <section
      className={[
        "panel result-panel",
        columns === 2 ? "result-panel--cols-2" : "",
        columns === 3 ? "result-panel--cols-3" : "",
        columns === 4 ? "result-panel--cols-4" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="section-header">
        <h2>{title}</h2>
        <button className="text-button" onClick={() => void navigator.clipboard?.writeText(copyText)} type="button">
          <Copy size={15} />
          复制
        </button>
      </div>
      {gridClass ? (
        <div className={gridClass}>
          {rows.map(([name, value, tone], index) =>
            name ? (
              <div className="result-grid-item" key={name}>
                <span className="result-grid-label">{name}</span>
                <span className={["result-grid-value", tone === undefined ? "" : tone >= 0 ? "positive" : "negative"].filter(Boolean).join(" ")}>
                  {value}
                </span>
              </div>
            ) : (
              <div aria-hidden="true" className="result-grid-item result-grid-item--spacer" key={`spacer-${index}`} />
            ),
          )}
        </div>
      ) : (
        <table className="result-table">
          <tbody>
            {rows
              .filter(([name]) => name)
              .map(([name, value, tone]) => (
                <tr key={name}>
                  <th>{name}</th>
                  <td className={tone === undefined ? "" : tone >= 0 ? "positive" : "negative"}>{value}</td>
                </tr>
              ))}
          </tbody>
        </table>
      )}
      {footer}
    </section>
  );
}
