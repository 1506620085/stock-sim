import { useEffect, useState } from "react";
import { Database, RefreshCw, Save, Trash2 } from "lucide-react";
import { AppSelect } from "../../components/AppSelect";
import { AppNumberStepper } from "../../components/AppNumberStepper";
import { showInfo, showSuccess } from "../../components/ToastProvider";
import type { Instrument } from "../replay/types";
import {
  createFeeTemplate,
  deleteFeeTemplate,
  formatFeeTemplateSummary,
  groupFeeTemplatesByAssetType,
  loadDataQuality,
  loadFeeTemplates,
  loadInstruments,
  loadPreferences,
  savePreferences,
  setDefaultFeeTemplate,
  sortFeeTemplates,
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
  const templateGroups = groupFeeTemplatesByAssetType(feeTemplates);

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
      setFeeTemplates((items) => sortFeeTemplates([saved, ...items.filter((item) => item.id !== saved.id)]));
      setTemplateModal(null);
      showSuccess("费率模板已保存");
    } catch {
      // apiFetch 已弹出错误提示
    }
  }

  async function handleSetDefault(templateId: number) {
    try {
      const saved = await setDefaultFeeTemplate(templateId);
      setFeeTemplates((items) =>
        sortFeeTemplates(
          items.map((item) =>
            item.assetType === saved.assetType ? { ...item, isDefault: item.id === saved.id } : item,
          ),
        ),
      );
      showSuccess("已设为默认模板");
    } catch {
      // apiFetch 已弹出错误提示
    }
  }

  function requestDeleteTemplate(template: FeeTemplate) {
    if (template.isDefault) {
      showInfo("默认模板不能删除，请先将其他模板设为默认。");
      return;
    }
    setDeleteConfirmTemplate(template);
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
              <AppSelect
                onChange={(value) => updatePreferences({ adjustType: value })}
                options={[
                  { label: "不复权", value: "none" },
                  { label: "前复权", value: "qfq" },
                  { label: "后复权", value: "hfq" },
                ]}
                value={preferences.adjustType}
              />
            </label>
            <label>
              行情源
              <AppSelect
                onChange={(value) => updatePreferences({ dataSource: value })}
                options={[
                  { label: "AKShare", value: "akshare" },
                  { label: "Tushare Pro", value: "tushare" },
                ]}
                value={preferences.dataSource}
              />
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
            <AppSelect
              onChange={(value) => setSelectedInstrumentId(Number(value))}
              options={instruments
                .filter((instrument) => instrument.id != null)
                .map((instrument) => ({
                  label: `${instrument.code} ${instrument.name}`,
                  value: instrument.id as number,
                }))}
              placeholder="请选择"
              searchable
              value={selectedInstrumentId}
            />
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
              <>
                <TemplateGroup
                  editingTemplateId={editingTemplateId}
                  items={templateGroups.stock}
                  label="股票费率"
                  onDelete={requestDeleteTemplate}
                  onEdit={openEditTemplateModal}
                  onSetDefault={handleSetDefault}
                />
                <TemplateGroup
                  editingTemplateId={editingTemplateId}
                  items={templateGroups.etf}
                  label="ETF 费率"
                  onDelete={requestDeleteTemplate}
                  onEdit={openEditTemplateModal}
                  onSetDefault={handleSetDefault}
                />
              </>
            ) : (
              <p className="empty-copy">暂无费率模板。</p>
            )}
          </div>
        </section>
      </div>

      {templateModal ? (
        <div className="settings-modal-backdrop" role="presentation">
          <div
            aria-labelledby="template-modal-title"
            aria-modal="true"
            className="settings-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="section-header">
              <h2 id="template-modal-title">{templateModal.mode === "new" ? "新建模板" : "编辑模板"}</h2>
            </div>
            <FeeTemplateFormFields form={modalFeeForm} onChange={setModalFeeForm} />
            <div className="settings-actions">
              <button className="secondary-button" onClick={closeTemplateModal} type="button">
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
        <div className="settings-modal-backdrop" role="presentation">
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
              <button className="secondary-button" onClick={() => setDeleteConfirmTemplate(null)} type="button">
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

function TemplateGroup({
  editingTemplateId,
  items,
  label,
  onDelete,
  onEdit,
  onSetDefault,
}: {
  editingTemplateId: number | null;
  items: FeeTemplate[];
  label: string;
  onDelete: (template: FeeTemplate) => void;
  onEdit: (template: FeeTemplate) => void;
  onSetDefault: (templateId: number) => void;
}) {
  if (!items.length) {
    return (
      <section className="template-group">
        <h3 className="template-group-title">{label}</h3>
        <p className="empty-copy">暂无模板。</p>
      </section>
    );
  }

  return (
    <section className="template-group">
      <h3 className="template-group-title">{label}</h3>
      {items.map((template) => (
        <div className={`template-list-item${editingTemplateId === template.id ? " active" : ""}`} key={template.id}>
          <div className="template-list-main">
            <div className="template-list-title">
              <strong>{template.name}</strong>
              {template.isDefault ? <span className="template-default-badge">默认</span> : null}
            </div>
            <span>{formatFeeTemplateSummary(template)}</span>
          </div>
          <div className="template-list-actions">
            {!template.isDefault ? (
              <button className="text-button template-default-button" onClick={() => onSetDefault(template.id)} type="button">
                设为默认
              </button>
            ) : null}
            <button className="text-button template-edit-button" onClick={() => onEdit(template)} type="button">
              编辑
            </button>
            <button
              aria-label={`删除模板 ${template.name}`}
              className="icon-button danger-button template-delete-button"
              disabled={template.isDefault}
              onClick={() => onDelete(template)}
              type="button"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      ))}
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
        <AppSelect
          onChange={(value) => onChange((current) => ({ ...current, assetType: value }))}
          options={[
            { label: "股票", value: "stock" },
            { label: "ETF", value: "etf" },
          ]}
          value={form.assetType}
        />
      </label>
      <label>
        佣金模式
        <AppSelect
          onChange={(value) => onChange((current) => ({ ...current, commissionMode: value }))}
          options={[
            { label: "按比例", value: "rate" },
            { label: "固定手续费", value: "fixed" },
          ]}
          value={form.commissionMode}
        />
      </label>
      {form.commissionMode === "fixed" ? (
        <AppNumberStepper
          label="固定手续费"
          onChange={(value) => onChange((current) => ({ ...current, fixedCommission: value ?? 0 }))}
          step={0.01}
          value={form.fixedCommission}
        />
      ) : (
        <>
          <AppNumberStepper
            label="佣金费率(%)"
            normalizeToStep
            onChange={(value) => onChange((current) => ({ ...current, commissionRate: value ?? 0 }))}
            step={0.00001}
            value={form.commissionRate}
          />
          <AppNumberStepper
            label="最低佣金"
            onChange={(value) => onChange((current) => ({ ...current, minCommission: value ?? 0 }))}
            step={0.01}
            value={form.minCommission}
          />
        </>
      )}
      <AppNumberStepper
        label="卖出印花税率(%)"
        normalizeToStep
        onChange={(value) => onChange((current) => ({ ...current, stampTaxRate: value ?? 0 }))}
        step={0.00001}
        value={form.stampTaxRate}
      />
      <AppNumberStepper
        label="过户费率(%)"
        normalizeToStep
        onChange={(value) => onChange((current) => ({ ...current, transferRate: value ?? 0 }))}
        step={0.00001}
        value={form.transferRate}
      />
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
