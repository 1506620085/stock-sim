import { useEffect, useMemo, useState } from "react";
import { CreditCard, Database, RefreshCw, Save, Trash2 } from "lucide-react";
import { showSuccess } from "../../components/ToastProvider";
import type { Instrument } from "../replay/types";
import {
  createFeeTemplate,
  deleteFeeTemplate,
  loadDataQuality,
  loadFeeTemplates,
  loadInstruments,
  loadPreferences,
  savePreferences,
  syncInstrument,
  updateFeeTemplate,
  type AdjustType,
  type AppPreferences,
  type DataQuality,
  type FeeTemplate,
  type FeeTemplateInput,
} from "./api";

const emptyFeeForm: FeeTemplateInput = {
  name: "默认股票费率",
  assetType: "stock",
  commissionMode: "rate",
  commissionRate: 0.025,
  fixedCommission: 0,
  minCommission: 5,
  stampTaxRate: 0.05,
  transferRate: 0,
  config: { commissionMode: "rate" },
};

export function SettingsPage() {
  const [preferences, setPreferences] = useState<AppPreferences>(() => loadPreferences());
  const [feeTemplates, setFeeTemplates] = useState<FeeTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [feeForm, setFeeForm] = useState<FeeTemplateInput>(emptyFeeForm);
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [selectedInstrumentId, setSelectedInstrumentId] = useState<number | null>(null);
  const [dataQuality, setDataQuality] = useState<DataQuality | null>(null);

  const selectedTemplate = useMemo(() => feeTemplates.find((item) => item.id === selectedTemplateId) ?? null, [feeTemplates, selectedTemplateId]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadFeeTemplates(), loadInstruments()])
      .then(([templates, instrumentItems]) => {
        if (cancelled) return;
        setFeeTemplates(templates);
        setInstruments(instrumentItems);
        if (templates[0]) {
          setSelectedTemplateId(templates[0].id);
          setFeeForm(toForm(templates[0]));
        }
        if (instrumentItems[0]?.id) {
          setSelectedInstrumentId(instrumentItems[0].id);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedTemplate) return;
    setFeeForm(toForm(selectedTemplate));
  }, [selectedTemplate]);

  useEffect(() => {
    if (!selectedInstrumentId) return;
    void refreshDataQuality(selectedInstrumentId, preferences.adjustType);
  }, [preferences.adjustType, selectedInstrumentId]);

  function updatePreferences(patch: Partial<AppPreferences>) {
    const next = { ...preferences, ...patch };
    setPreferences(next);
    savePreferences(next);
    showSuccess("设置已保存");
  }

  async function refreshDataQuality(instrumentId = selectedInstrumentId, adjustType = preferences.adjustType) {
    if (!instrumentId) return;
    try {
      const quality = await loadDataQuality(instrumentId, adjustType);
      setDataQuality(quality);
    } catch {
      // apiFetch 已弹出错误提示
    }
  }

  async function handleSync() {
    if (!selectedInstrumentId) return;
    try {
      const result = await syncInstrument(selectedInstrumentId, preferences.adjustType);
      showSuccess(`已同步 ${result.rows_fetched} 条，最新交易日 ${result.latest_trade_date ?? "-"}`);
      await refreshDataQuality(selectedInstrumentId, preferences.adjustType);
    } catch {
      // apiFetch 已弹出错误提示
    }
  }

  async function handleSaveTemplate() {
    try {
      const saved = selectedTemplateId ? await updateFeeTemplate(selectedTemplateId, feeForm) : await createFeeTemplate(feeForm);
      setFeeTemplates((items) => [saved, ...items.filter((item) => item.id !== saved.id)].sort((a, b) => a.assetType.localeCompare(b.assetType) || a.name.localeCompare(b.name)));
      setSelectedTemplateId(saved.id);
      showSuccess("费率模板已保存");
    } catch {
      // apiFetch 已弹出错误提示
    }
  }

  async function handleDeleteTemplate() {
    if (!selectedTemplateId) return;
    try {
      await deleteFeeTemplate(selectedTemplateId);
      const next = feeTemplates.filter((item) => item.id !== selectedTemplateId);
      setFeeTemplates(next);
      setSelectedTemplateId(next[0]?.id ?? null);
      setFeeForm(next[0] ? toForm(next[0]) : emptyFeeForm);
      showSuccess("费率模板已删除");
    } catch {
      // apiFetch 已弹出错误提示
    }
  }

  return (
    <section className="settings-page">
      <div className="settings-layout">
        <section className="panel settings-panel">
          <div className="section-header">
            <h2>数据源与复权</h2>
            <Database size={18} />
          </div>
          <div className="settings-grid">
            <label>
              默认复权
              <select value={preferences.adjustType} onChange={(event) => updatePreferences({ adjustType: event.target.value as AdjustType })}>
                <option value="none">不复权</option>
                <option value="qfq">前复权</option>
                <option value="hfq">后复权</option>
              </select>
            </label>
            <label>
              行情源
              <select value={preferences.dataSource} onChange={(event) => updatePreferences({ dataSource: event.target.value as AppPreferences["dataSource"] })}>
                <option value="akshare">AKShare</option>
                <option value="tushare">Tushare Pro</option>
              </select>
            </label>
            <label className="settings-wide">
              Tushare Token
              <input value={preferences.tushareToken} onChange={(event) => updatePreferences({ tushareToken: event.target.value })} placeholder="本地保存，后续接入 Tushare 时使用" />
            </label>
          </div>
          <div className="settings-summary">
            <span>当前行情源：{preferences.dataSource === "akshare" ? "AKShare" : "Tushare Pro"}</span>
            <span>当前复权：{adjustLabel(preferences.adjustType)}</span>
          </div>
        </section>

        <section className="panel settings-panel">
          <div className="section-header">
            <h2>数据质量</h2>
            <button className="text-button" onClick={handleSync} type="button">
              <RefreshCw size={15} />
              重新同步
            </button>
          </div>
          <label>
            标的
            <select value={selectedInstrumentId ?? ""} onChange={(event) => setSelectedInstrumentId(Number(event.target.value) || null)}>
              <option value="">请选择</option>
              {instruments.map((instrument) => (
                <option key={instrument.id} value={instrument.id ?? ""}>
                  {instrument.code} {instrument.name}
                </option>
              ))}
            </select>
          </label>
          <DataQualityView quality={dataQuality} />
        </section>

        <section className="panel settings-panel settings-template-list">
          <div className="section-header">
            <h2>费率模板</h2>
            <button
              className="text-button"
              onClick={() => {
                setSelectedTemplateId(null);
                setFeeForm(emptyFeeForm);
              }}
              type="button"
            >
              新建
            </button>
          </div>
          <div className="template-list">
            {feeTemplates.length ? (
              feeTemplates.map((template) => (
                <button className={template.id === selectedTemplateId ? "active" : ""} key={template.id} onClick={() => setSelectedTemplateId(template.id)} type="button">
                  <strong>{template.name}</strong>
                  <span>
                    {template.assetType === "stock" ? "股票" : "ETF"} / {template.commissionMode === "fixed" ? `固定 ${template.fixedCommission}` : `佣金 ${template.commissionRate}%`}
                  </span>
                </button>
              ))
            ) : (
              <p className="empty-copy">暂无费率模板。</p>
            )}
          </div>
        </section>

        <section className="panel settings-panel">
          <div className="section-header">
            <h2>{selectedTemplateId ? "编辑模板" : "新建模板"}</h2>
            <CreditCard size={18} />
          </div>
          <div className="settings-grid">
            <label className="settings-wide">
              模板名称
              <input value={feeForm.name} onChange={(event) => setFeeForm((current) => ({ ...current, name: event.target.value }))} />
            </label>
            <label>
              成本类型
              <select value={feeForm.assetType} onChange={(event) => setFeeForm((current) => ({ ...current, assetType: event.target.value as FeeTemplateInput["assetType"] }))}>
                <option value="stock">股票</option>
                <option value="etf">ETF</option>
              </select>
            </label>
            <label>
              佣金模式
              <select value={feeForm.commissionMode} onChange={(event) => setFeeForm((current) => ({ ...current, commissionMode: event.target.value as FeeTemplateInput["commissionMode"] }))}>
                <option value="rate">按比例</option>
                <option value="fixed">固定手续费</option>
              </select>
            </label>
            {feeForm.commissionMode === "fixed" ? (
              <NumberField label="固定手续费" value={feeForm.fixedCommission} onChange={(value) => setFeeForm((current) => ({ ...current, fixedCommission: value }))} step={0.01} />
            ) : (
              <>
                <NumberField label="佣金费率(%)" value={feeForm.commissionRate} onChange={(value) => setFeeForm((current) => ({ ...current, commissionRate: value }))} step={0.001} />
                <NumberField label="最低佣金" value={feeForm.minCommission} onChange={(value) => setFeeForm((current) => ({ ...current, minCommission: value }))} step={0.01} />
              </>
            )}
            <NumberField label="卖出印花税率(%)" value={feeForm.stampTaxRate} onChange={(value) => setFeeForm((current) => ({ ...current, stampTaxRate: value }))} step={0.001} />
            <NumberField label="过户费率(%)" value={feeForm.transferRate} onChange={(value) => setFeeForm((current) => ({ ...current, transferRate: value }))} step={0.001} />
          </div>
          <div className="settings-actions">
            <button className="primary-button" onClick={handleSaveTemplate} type="button">
              <Save size={15} />
              保存模板
            </button>
            <button className="icon-button danger-button" disabled={!selectedTemplateId} onClick={handleDeleteTemplate} type="button" aria-label="删除模板">
              <Trash2 size={16} />
            </button>
          </div>
        </section>
      </div>
    </section>
  );
}

function DataQualityView({ quality }: { quality: DataQuality | null }) {
  if (!quality) {
    return <p className="empty-copy">请选择已入库标的。</p>;
  }

  return (
    <div className="quality-block">
      <div className="stat-grid">
        <article>
          <span>K 线数量</span>
          <strong>{quality.totalRows.toLocaleString("zh-CN")}</strong>
        </article>
        <article>
          <span>缺口数量</span>
          <strong>{quality.missingWeekdays.length.toLocaleString("zh-CN")}</strong>
        </article>
        <article>
          <span>首个交易日</span>
          <strong>{quality.firstTradeDate ?? "-"}</strong>
        </article>
        <article>
          <span>最新交易日</span>
          <strong>{quality.latestTradeDate ?? "-"}</strong>
        </article>
      </div>
      <div className="quality-dates">
        <span>疑似缺口/停牌</span>
        <div>
          {quality.possibleSuspendedDates.length ? quality.possibleSuspendedDates.slice(0, 18).map((date) => <em key={date}>{date}</em>) : <em>暂无</em>}
        </div>
      </div>
    </div>
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

function toForm(template: FeeTemplate): FeeTemplateInput {
  return {
    name: template.name,
    assetType: template.assetType,
    commissionMode: template.commissionMode,
    commissionRate: template.commissionRate,
    fixedCommission: template.fixedCommission,
    minCommission: template.minCommission,
    stampTaxRate: template.stampTaxRate,
    transferRate: template.transferRate,
    config: template.config,
  };
}

function adjustLabel(value: AdjustType) {
  return (
    {
      none: "不复权",
      qfq: "前复权",
      hfq: "后复权",
    } satisfies Record<AdjustType, string>
  )[value];
}
