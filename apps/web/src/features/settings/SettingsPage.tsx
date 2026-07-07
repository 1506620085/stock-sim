import { useEffect, useState } from "react";
import { Database, RefreshCw, Save, Trash2 } from "lucide-react";
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
  const [templateModal, setTemplateModal] = useState<null | { mode: "new" } | { mode: "edit"; templateId: number }>(null);
  const [deleteConfirmTemplate, setDeleteConfirmTemplate] = useState<FeeTemplate | null>(null);
  const [modalFeeForm, setModalFeeForm] = useState<FeeTemplateInput>(emptyFeeForm);
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [selectedInstrumentId, setSelectedInstrumentId] = useState<number | null>(null);
  const [dataQuality, setDataQuality] = useState<DataQuality | null>(null);

  const editingTemplateId = templateModal?.mode === "edit" ? templateModal.templateId : null;

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadFeeTemplates(), loadInstruments()])
      .then(([templates, instrumentItems]) => {
        if (cancelled) return;
        setFeeTemplates(templates);
        setInstruments(instrumentItems);
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
    if (!templateModal && !deleteConfirmTemplate) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (deleteConfirmTemplate) {
        setDeleteConfirmTemplate(null);
        return;
      }
      setTemplateModal(null);
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [deleteConfirmTemplate, templateModal]);

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

  function openNewTemplateModal() {
    setModalFeeForm({ ...emptyFeeForm });
    setTemplateModal({ mode: "new" });
  }

  function openEditTemplateModal(template: FeeTemplate) {
    setModalFeeForm(toForm(template));
    setTemplateModal({ mode: "edit", templateId: template.id });
  }

  function closeTemplateModal() {
    setTemplateModal(null);
  }

  async function handleSaveTemplate() {
    try {
      const saved =
        templateModal?.mode === "edit"
          ? await updateFeeTemplate(templateModal.templateId, modalFeeForm)
          : await createFeeTemplate(modalFeeForm);
      setFeeTemplates((items) => [saved, ...items.filter((item) => item.id !== saved.id)].sort((a, b) => a.assetType.localeCompare(b.assetType) || a.name.localeCompare(b.name)));
      setTemplateModal(null);
      showSuccess("费率模板已保存");
    } catch {
      // apiFetch 已弹出错误提示
    }
  }

  async function handleDeleteTemplate(templateId: number) {
    try {
      await deleteFeeTemplate(templateId);
      setFeeTemplates((items) => items.filter((item) => item.id !== templateId));
      if (editingTemplateId === templateId) {
        setTemplateModal(null);
      }
      setDeleteConfirmTemplate(null);
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
            <button className="text-button" onClick={openNewTemplateModal} type="button">
              新建
            </button>
          </div>
          <div className="template-list">
            {feeTemplates.length ? (
              feeTemplates.map((template) => (
                <div className={`template-list-item${editingTemplateId === template.id ? " active" : ""}`} key={template.id}>
                  <div className="template-list-main">
                    <strong>{template.name}</strong>
                    <span>
                      {template.assetType === "stock" ? "股票" : "ETF"} / {template.commissionMode === "fixed" ? `固定 ${template.fixedCommission}` : `佣金 ${template.commissionRate}%`}
                    </span>
                  </div>
                  <div className="template-list-actions">
                    <button className="text-button template-edit-button" onClick={() => openEditTemplateModal(template)} type="button">
                      编辑
                    </button>
                    <button
                      aria-label={`删除模板 ${template.name}`}
                      className="icon-button danger-button template-delete-button"
                      onClick={() => setDeleteConfirmTemplate(template)}
                      type="button"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <p className="empty-copy">暂无费率模板。</p>
            )}
          </div>
        </section>
      </div>

      {templateModal ? (
        <div className="settings-modal-backdrop" onClick={closeTemplateModal} role="presentation">
          <div
            aria-labelledby="template-modal-title"
            aria-modal="true"
            className="settings-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="section-header">
              <h2 id="template-modal-title">{templateModal.mode === "new" ? "新建模板" : "编辑模板"}</h2>
              <button aria-label="关闭" className="text-button" onClick={closeTemplateModal} type="button">
                ×
              </button>
            </div>
            <FeeTemplateFormFields form={modalFeeForm} onChange={setModalFeeForm} />
            <div className="settings-actions">
              <button className="text-button" onClick={closeTemplateModal} type="button">
                取消
              </button>
              <button className="primary-button" onClick={handleSaveTemplate} type="button">
                <Save size={15} />
                保存模板
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteConfirmTemplate ? (
        <div className="settings-modal-backdrop" onClick={() => setDeleteConfirmTemplate(null)} role="presentation">
          <div
            aria-labelledby="delete-template-title"
            aria-modal="true"
            className="settings-modal settings-confirm-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <h2 id="delete-template-title">删除模板</h2>
            <p className="settings-confirm-copy">
              确定删除「{deleteConfirmTemplate.name}」吗？删除后无法恢复。
            </p>
            <div className="settings-actions">
              <button className="text-button" onClick={() => setDeleteConfirmTemplate(null)} type="button">
                取消
              </button>
              <button className="primary-button danger-confirm-button" onClick={() => void handleDeleteTemplate(deleteConfirmTemplate.id)} type="button">
                删除
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function FeeTemplateFormFields({
  form,
  onChange,
}: {
  form: FeeTemplateInput;
  onChange: (next: FeeTemplateInput | ((current: FeeTemplateInput) => FeeTemplateInput)) => void;
}) {
  return (
    <div className="settings-grid">
      <label className="settings-wide">
        模板名称
        <input value={form.name} onChange={(event) => onChange((current) => ({ ...current, name: event.target.value }))} />
      </label>
      <label>
        成本类型
        <select value={form.assetType} onChange={(event) => onChange((current) => ({ ...current, assetType: event.target.value as FeeTemplateInput["assetType"] }))}>
          <option value="stock">股票</option>
          <option value="etf">ETF</option>
        </select>
      </label>
      <label>
        佣金模式
        <select value={form.commissionMode} onChange={(event) => onChange((current) => ({ ...current, commissionMode: event.target.value as FeeTemplateInput["commissionMode"] }))}>
          <option value="rate">按比例</option>
          <option value="fixed">固定手续费</option>
        </select>
      </label>
      {form.commissionMode === "fixed" ? (
        <NumberField label="固定手续费" value={form.fixedCommission} onChange={(value) => onChange((current) => ({ ...current, fixedCommission: value }))} step={0.01} />
      ) : (
        <>
          <NumberField label="佣金费率(%)" value={form.commissionRate} onChange={(value) => onChange((current) => ({ ...current, commissionRate: value }))} step={0.001} />
          <NumberField label="最低佣金" value={form.minCommission} onChange={(value) => onChange((current) => ({ ...current, minCommission: value }))} step={0.01} />
        </>
      )}
      <NumberField label="卖出印花税率(%)" value={form.stampTaxRate} onChange={(value) => onChange((current) => ({ ...current, stampTaxRate: value }))} step={0.001} />
      <NumberField label="过户费率(%)" value={form.transferRate} onChange={(value) => onChange((current) => ({ ...current, transferRate: value }))} step={0.001} />
    </div>
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
