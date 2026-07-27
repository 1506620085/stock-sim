import { useEffect, useMemo, useState } from "react";
import { NotebookPen, Plus, Trash2 } from "lucide-react";
import { AppDatePicker } from "../../components/AppDatePicker";
import { AppSelect } from "../../components/AppSelect";
import { AppNumberStepper } from "../../components/AppNumberStepper";
import { showSuccess } from "../../components/ToastProvider";
import {
  createJournalEntry,
  deleteJournalEntry,
  loadJournalEntries,
  loadJournalPeriodSummary,
  loadTradingRules,
  updateJournalEntry,
} from "./api";
import { KnowledgeBasePanel } from "./KnowledgeBasePanel";
import type {
  JournalEntry,
  JournalEntryInput,
  JournalPeriodSummary,
  JournalSide,
  TradingRule,
} from "./types";

type NotesTab = "journal" | "rules" | "period";

const tabs: Array<{ id: NotesTab; label: string }> = [
  { id: "journal", label: "实盘笔记" },
  { id: "period", label: "区间复盘" },
  { id: "rules", label: "操作规则/总结笔记" },
];

const tabMeta: Record<NotesTab, { title: string; description: string }> = {
  journal: {
    title: "实盘笔记",
    description: "记录真实买卖时的思考：为什么买、为什么卖，以及当时情绪与计划。",
  },
  rules: {
    title: "操作规则/总结笔记",
    description: "树形目录管理规则与总结，富文本编辑并自动保存。",
  },
  period: {
    title: "区间复盘",
    description: "按日期区间汇总笔记数量、方向分布与标签。",
  },
};

const sideOptions: Array<{ label: string; value: JournalSide }> = [
  { label: "买入", value: "buy" },
  { label: "卖出", value: "sell" },
  { label: "观察", value: "watch" },
  { label: "其他", value: "other" },
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoIso(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

function sideLabel(side: string) {
  return sideOptions.find((item) => item.value === side)?.label ?? side;
}

function categoryLabel(category: string) {
  const labels: Record<string, string> = {
    position: "仓位",
    buy: "买入条件",
    sell: "卖出条件",
    t_trade: "做 T",
    emotion: "情绪管理",
    other: "其他",
  };
  return labels[category] ?? category;
}

function parseTags(raw: string) {
  return raw
    .split(/[,，\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function emptyJournalForm(): JournalEntryInput {
  return {
    entryDate: todayIso(),
    side: "buy",
    symbolName: "",
    price: null,
    quantity: null,
    reason: "",
    planNote: "",
    emotionNote: "",
    resultNote: "",
    tags: [],
    ruleIds: [],
  };
}

export function NotesPage() {
  const [activeTab, setActiveTab] = useState<NotesTab>("journal");
  const activeMeta = tabMeta[activeTab];

  return (
    <section className="notes-page">
      <div className="calculator-page-header">
        <header className="panel calculator-page-meta">
          <div className="calculator-page-meta-title">
            <h1>交易笔记</h1>
            <p className="eyebrow calculator-page-meta-eyebrow">Journal</p>
          </div>
          <span className="stage-pill">实盘与规则</span>
        </header>
        <div className="panel calculator-page-heading">
          <NotebookPen aria-hidden="true" size={28} />
          <div className="calculator-page-heading-main">
            <div className="calculator-page-heading-title">
              <h2>{activeMeta.title}</h2>
              <p className="eyebrow calculator-page-heading-eyebrow">Notes</p>
            </div>
            <p className="calculator-page-heading-desc">{activeMeta.description}</p>
          </div>
        </div>
      </div>

      <div className="panel calculators-tabs" role="tablist" aria-label="笔记类型">
        {tabs.map((tab) => (
          <button
            aria-selected={activeTab === tab.id}
            className={activeTab === tab.id ? "active" : ""}
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            role="tab"
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "journal" ? <JournalPanel /> : null}
      {activeTab === "rules" ? <KnowledgeBasePanel /> : null}
      {activeTab === "period" ? <PeriodPanel /> : null}
    </section>
  );
}

function JournalPanel() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [rules, setRules] = useState<TradingRule[]>([]);
  const [sideFilter, setSideFilter] = useState<string>("all");
  const [tagFilter, setTagFilter] = useState("");
  const [symbolFilter, setSymbolFilter] = useState("");
  const [modal, setModal] = useState<null | { mode: "new" } | { mode: "edit"; id: number }>(null);
  const [viewEntry, setViewEntry] = useState<JournalEntry | null>(null);
  const [form, setForm] = useState<JournalEntryInput>(emptyJournalForm());
  const [tagsDraft, setTagsDraft] = useState("");
  const [symbolNameError, setSymbolNameError] = useState("");
  const [allSymbols, setAllSymbols] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    entries.forEach((entry) => entry.tags.forEach((tag) => set.add(tag)));
    return Array.from(set).sort();
  }, [entries]);

  const symbolOptions = useMemo(
    () => [{ label: "全部标的", value: "", emphasis: true }, ...allSymbols.map((name) => ({ label: name, value: name }))],
    [allSymbols],
  );

  const activeRules = useMemo(
    () => rules.filter((rule) => rule.nodeType === "doc" && rule.status === "active"),
    [rules],
  );

  async function refreshSymbolCatalog() {
    const items = await loadJournalEntries();
    const names = Array.from(
      new Set(items.map((entry) => (entry.symbolName ?? "").trim()).filter(Boolean)),
    ).sort((left, right) => left.localeCompare(right, "zh-CN"));
    setAllSymbols(names);
  }

  async function refresh() {
    setLoading(true);
    try {
      const [nextEntries, nextRules] = await Promise.all([
        loadJournalEntries({
          side: sideFilter === "all" ? undefined : sideFilter,
          tag: tagFilter || undefined,
          symbol: symbolFilter || undefined,
        }),
        loadTradingRules(),
      ]);
      setEntries(nextEntries);
      setRules(nextRules);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshSymbolCatalog();
  }, []);

  useEffect(() => {
    void refresh();
  }, [sideFilter, tagFilter, symbolFilter]);

  function openNew() {
    setViewEntry(null);
    setForm(emptyJournalForm());
    setTagsDraft("");
    setSymbolNameError("");
    setModal({ mode: "new" });
  }

  function openView(entry: JournalEntry) {
    setModal(null);
    setViewEntry(entry);
  }

  function openEdit(entry: JournalEntry) {
    setViewEntry(null);
    setForm({
      entryDate: entry.entryDate,
      side: entry.side,
      symbolName: entry.symbolName ?? "",
      price: entry.price,
      quantity: entry.quantity,
      reason: entry.reason,
      planNote: entry.planNote ?? "",
      emotionNote: entry.emotionNote ?? "",
      resultNote: entry.resultNote ?? "",
      tags: entry.tags,
      ruleIds: entry.ruleIds,
    });
    setTagsDraft(entry.tags.join("，"));
    setSymbolNameError("");
    setModal({ mode: "edit", id: entry.id });
  }

  async function handleSave() {
    const symbolName = (form.symbolName ?? "").trim();
    if (!symbolName) {
      setSymbolNameError("请填写标的名称");
      return;
    }
    setSymbolNameError("");

    const payload: JournalEntryInput = {
      ...form,
      symbolCode: null,
      symbolName,
      planNote: form.planNote || null,
      emotionScore: null,
      emotionNote: form.emotionNote || null,
      resultNote: form.resultNote || null,
      tags: parseTags(tagsDraft),
      ruleIds: form.ruleIds ?? [],
    };
    if (modal?.mode === "edit") {
      await updateJournalEntry(modal.id, payload);
      showSuccess("笔记已更新");
    } else {
      await createJournalEntry(payload);
      showSuccess("笔记已创建");
    }
    setModal(null);
    await Promise.all([refresh(), refreshSymbolCatalog()]);
  }

  async function handleDelete(id: number) {
    await deleteJournalEntry(id);
    showSuccess("笔记已删除");
    await Promise.all([refresh(), refreshSymbolCatalog()]);
  }

  function toggleRule(ruleId: number) {
    setForm((current) => {
      const currentIds = current.ruleIds ?? [];
      const next = currentIds.includes(ruleId) ? currentIds.filter((id) => id !== ruleId) : [...currentIds, ruleId];
      return { ...current, ruleIds: next };
    });
  }

  return (
    <section className="notes-panel">
      <div className="panel">
        <div className="section-header">
          <h2>笔记列表</h2>
          <button className="text-button" onClick={openNew} type="button">
            <Plus size={15} />
            新建笔记
          </button>
        </div>

        <div className="notes-filters">
          <label>
            方向
            <AppSelect
              onChange={setSideFilter}
              options={[{ label: "全部", value: "all" }, ...sideOptions]}
              value={sideFilter}
            />
          </label>
          <label>
            标签
            <AppSelect
              onChange={setTagFilter}
              options={[{ label: "全部标签", value: "", emphasis: true }, ...allTags.map((tag) => ({ label: tag, value: tag }))]}
              value={tagFilter}
            />
          </label>
          <label>
            标的
            <AppSelect
              allowQueryValue
              onChange={setSymbolFilter}
              options={symbolOptions}
              placeholder="搜索或选择标的"
              searchable
              value={symbolFilter}
            />
          </label>
        </div>

        {loading ? <p className="empty-copy">加载中…</p> : null}
        {!loading && !entries.length ? <p className="empty-copy">暂无实盘笔记，点击「新建笔记」开始记录。</p> : null}

        <div className="notes-card-list">
          {entries.map((entry) => (
            <article className="notes-card" key={entry.id}>
              <div className="notes-card-head">
                <div>
                  <strong>
                    {sideLabel(entry.side)}
                    {entry.symbolName ? ` · ${entry.symbolName}` : ""}
                  </strong>
                  <span className="notes-card-meta">{entry.entryDate}</span>
                </div>
                <div className="notes-card-actions">
                  <button className="text-button" onClick={() => openView(entry)} type="button">
                    查看
                  </button>
                  <button className="text-button" onClick={() => openEdit(entry)} type="button">
                    编辑
                  </button>
                  <button aria-label="删除笔记" className="icon-button danger-button" onClick={() => void handleDelete(entry.id)} type="button">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              <p className="notes-card-reason">{entry.reason}</p>
              {entry.tags.length ? (
                <div className="notes-tag-row">
                  {entry.tags.map((tag) => (
                    <em key={tag}>{tag}</em>
                  ))}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </div>

      {viewEntry ? (
        <div className="settings-modal-backdrop" role="presentation">
          <div
            aria-labelledby="journal-view-title"
            aria-modal="true"
            className="settings-modal notes-modal notes-view-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="section-header">
              <h2 id="journal-view-title">查看实盘笔记</h2>
            </div>

            <div className="notes-modal-body">
              <div className="notes-view-meta">
                <div>
                  <span>日期</span>
                  <strong>{viewEntry.entryDate}</strong>
                </div>
                <div>
                  <span>方向</span>
                  <strong>{sideLabel(viewEntry.side)}</strong>
                </div>
                <div>
                  <span>标的名称</span>
                  <strong>{viewEntry.symbolName || "—"}</strong>
                </div>
                <div>
                  <span>价格</span>
                  <strong>{viewEntry.price != null ? String(viewEntry.price) : "—"}</strong>
                </div>
                <div>
                  <span>数量</span>
                  <strong>{viewEntry.quantity != null ? String(viewEntry.quantity) : "—"}</strong>
                </div>
              </div>

              <div className="notes-view-sections">
                <section>
                  <h3>为什么买/卖</h3>
                  <p>{viewEntry.reason?.trim() ? viewEntry.reason : "未填写"}</p>
                </section>
                <div className="notes-view-split">
                  <section>
                    <h3>当时计划 / 失效条件</h3>
                    <p>{viewEntry.planNote?.trim() ? viewEntry.planNote : "未填写"}</p>
                  </section>
                  <section>
                    <h3>当时情绪</h3>
                    <p>{viewEntry.emotionNote?.trim() ? viewEntry.emotionNote : "未填写"}</p>
                  </section>
                </div>
                <section>
                  <h3>结果复盘</h3>
                  <p>{viewEntry.resultNote?.trim() ? viewEntry.resultNote : "未填写"}</p>
                </section>
                <section>
                  <h3>标签</h3>
                  {viewEntry.tags.length ? (
                    <div className="notes-tag-row">
                      {viewEntry.tags.map((tag) => (
                        <em key={tag}>{tag}</em>
                      ))}
                    </div>
                  ) : (
                    <p>未填写</p>
                  )}
                </section>
                {viewEntry.ruleIds.length ? (
                  <section>
                    <h3>关联规则</h3>
                    <ul className="notes-view-rules">
                      {viewEntry.ruleIds.map((ruleId) => {
                        const rule = rules.find((item) => item.id === ruleId);
                        return (
                          <li key={ruleId}>
                            {rule ? (
                              <>
                                {rule.title}
                                <em>{categoryLabel(rule.category)}</em>
                              </>
                            ) : (
                              `规则 #${ruleId}`
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ) : null}
              </div>
            </div>

            <div className="settings-actions">
              <button className="secondary-button" onClick={() => setViewEntry(null)} type="button">
                取消
              </button>
              <button className="primary-button" onClick={() => openEdit(viewEntry)} type="button">
                去编辑
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {modal ? (
        <div className="settings-modal-backdrop" role="presentation">
          <div
            aria-labelledby="journal-modal-title"
            aria-modal="true"
            className="settings-modal notes-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="section-header">
              <h2 id="journal-modal-title">{modal.mode === "new" ? "新建实盘笔记" : "编辑实盘笔记"}</h2>
            </div>

            <div className="notes-modal-body">
              <div className="settings-grid notes-modal-form">
                <div className="notes-modal-meta">
                  <label>
                    日期
                    <AppDatePicker
                      onChange={(date) => setForm((current) => ({ ...current, entryDate: date }))}
                      placeholder="选择日期"
                      value={form.entryDate}
                    />
                  </label>
                  <label>
                    方向
                    <AppSelect onChange={(value) => setForm((current) => ({ ...current, side: value }))} options={sideOptions} value={form.side} />
                  </label>
                  <label className={symbolNameError ? "notes-field-invalid" : undefined}>
                    标的名称
                    <input
                      value={form.symbolName ?? ""}
                      onChange={(event) => {
                        setSymbolNameError("");
                        setForm((current) => ({ ...current, symbolName: event.target.value }));
                      }}
                    />
                    {symbolNameError ? <span className="notes-field-error">{symbolNameError}</span> : null}
                  </label>
                  <AppNumberStepper
                    label="价格（可选）"
                    onChange={(value) => setForm((current) => ({ ...current, price: value }))}
                    step={0.001}
                    value={form.price ?? null}
                  />
                  <AppNumberStepper
                    label="数量（可选）"
                    normalizeToStep
                    onChange={(value) => setForm((current) => ({ ...current, quantity: value }))}
                    step={100}
                    value={form.quantity ?? null}
                  />
                </div>
                <label className="settings-wide notes-modal-grow notes-modal-reason-field">
                  为什么买/卖（可选）
                  <textarea
                    value={form.reason}
                    onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))}
                  />
                </label>
                <div className="notes-modal-reason-row settings-wide notes-modal-grow">
                  <label className="notes-modal-grow">
                    当时计划 / 失效条件（可选）
                    <textarea
                      value={form.planNote ?? ""}
                      onChange={(event) => setForm((current) => ({ ...current, planNote: event.target.value }))}
                    />
                  </label>
                  <label className="notes-modal-grow">
                    当时情绪（可选）
                    <textarea
                      value={form.emotionNote ?? ""}
                      onChange={(event) => setForm((current) => ({ ...current, emotionNote: event.target.value }))}
                      placeholder="如：冷静、犹豫、追高焦虑"
                    />
                  </label>
                </div>
                <label className="settings-wide notes-modal-grow">
                  结果复盘（可选）
                  <textarea
                    value={form.resultNote ?? ""}
                    onChange={(event) => setForm((current) => ({ ...current, resultNote: event.target.value }))}
                  />
                </label>
                <label className="settings-wide notes-modal-tags">
                  标签（可选，逗号或空格分隔）
                  <input value={tagsDraft} onChange={(event) => setTagsDraft(event.target.value)} placeholder="如：突破，做T，纪律执行" />
                </label>
              </div>

              {activeRules.length ? (
                <div className="notes-rule-picker">
                  <h3>关联规则（可选）</h3>
                  <div className="notes-rule-picker-list">
                    {activeRules.map((rule) => {
                      const checked = (form.ruleIds ?? []).includes(rule.id);
                      return (
                        <label className="check-row" key={rule.id}>
                          <input checked={checked} onChange={() => toggleRule(rule.id)} type="checkbox" />
                          <span>
                            {rule.title}
                            <em>{categoryLabel(rule.category)}</em>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="settings-actions">
              <button className="secondary-button" onClick={() => setModal(null)} type="button">
                取消
              </button>
              <button className="primary-button" onClick={() => void handleSave()} type="button">
                保存
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function PeriodPanel() {
  const [startDate, setStartDate] = useState(daysAgoIso(30));
  const [endDate, setEndDate] = useState(todayIso());
  const [summary, setSummary] = useState<JournalPeriodSummary | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleQuery() {
    setLoading(true);
    try {
      const next = await loadJournalPeriodSummary(startDate, endDate);
      setSummary(next);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void handleQuery();
  }, []);

  return (
    <section className="notes-panel">
      <div className="panel">
        <div className="section-header">
          <h2>区间汇总</h2>
        </div>
        <div className="notes-filters notes-period-filters">
          <article className="notes-period-count">
            <span>笔记条数</span>
            <strong>{loading ? "…" : summary ? summary.entryCount : "—"}</strong>
          </article>
          <label>
            开始日期
            <AppDatePicker onChange={setStartDate} placeholder="开始日期" value={startDate} />
          </label>
          <label>
            结束日期
            <AppDatePicker onChange={setEndDate} placeholder="结束日期" value={endDate} />
          </label>
          <div className="notes-filter-action">
            <button className="primary-button" onClick={() => void handleQuery()} type="button">
              查询
            </button>
          </div>
        </div>

        {loading ? <p className="empty-copy">汇总中…</p> : null}

        {summary && !loading ? (
          <>
            <div className="notes-period-stats-row">
              <div className="notes-summary-block">
                <h3>方向分布</h3>
                {summary.sideStats.length ? (
                  <div className="notes-tag-row">
                    {summary.sideStats.map((item) => (
                      <em key={item.side}>
                        {sideLabel(item.side)} {item.count}
                      </em>
                    ))}
                  </div>
                ) : (
                  <p className="empty-copy">该区间暂无笔记。</p>
                )}
              </div>

              <div className="notes-summary-block">
                <h3>标签分布</h3>
                {summary.tagStats.length ? (
                  <div className="notes-tag-row">
                    {summary.tagStats.map((item) => (
                      <em key={item.tag}>
                        {item.tag} {item.count}
                      </em>
                    ))}
                  </div>
                ) : (
                  <p className="empty-copy">该区间暂无标签。</p>
                )}
              </div>
            </div>

            <div className="notes-summary-block">
              <h3>区间笔记</h3>
              <div className="notes-card-list">
                {summary.entries.map((entry) => (
                  <article className="notes-card" key={entry.id}>
                    <div className="notes-card-head">
                      <div>
                        <strong>
                          {sideLabel(entry.side)}
                          {entry.symbolName ? ` · ${entry.symbolName}` : ""}
                        </strong>
                        <span className="notes-card-meta">{entry.entryDate}</span>
                      </div>
                    </div>
                    <p className="notes-card-reason">{entry.reason}</p>
                  </article>
                ))}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}
