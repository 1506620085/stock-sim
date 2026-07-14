import { useEffect, useMemo, useState } from "react";
import { NotebookPen, Plus, Trash2 } from "lucide-react";
import { AppSelect } from "../../components/AppSelect";
import { AppNumberStepper } from "../../components/AppNumberStepper";
import { showSuccess } from "../../components/ToastProvider";
import {
  createJournalEntry,
  createTradingRule,
  deleteJournalEntry,
  deleteTradingRule,
  loadJournalEntries,
  loadJournalPeriodSummary,
  loadTradingRules,
  updateJournalEntry,
  updateTradingRule,
} from "./api";
import type {
  JournalEntry,
  JournalEntryInput,
  JournalPeriodSummary,
  JournalSide,
  RuleCategory,
  RuleStatus,
  TradingRule,
  TradingRuleInput,
} from "./types";

type NotesTab = "journal" | "rules" | "period";

const tabs: Array<{ id: NotesTab; label: string }> = [
  { id: "journal", label: "实盘笔记" },
  { id: "rules", label: "操作规则" },
  { id: "period", label: "区间复盘" },
];

const tabMeta: Record<NotesTab, { title: string; description: string }> = {
  journal: {
    title: "实盘笔记",
    description: "记录真实买卖时的思考：为什么买、为什么卖，以及当时情绪与计划。",
  },
  rules: {
    title: "操作规则",
    description: "沉淀仓位、买卖条件与纪律，写笔记时可对照勾选。",
  },
  period: {
    title: "区间复盘",
    description: "按日期区间汇总笔记数量、方向分布、情绪与标签。",
  },
};

const sideOptions: Array<{ label: string; value: JournalSide }> = [
  { label: "买入", value: "buy" },
  { label: "卖出", value: "sell" },
  { label: "观察", value: "watch" },
  { label: "其他", value: "other" },
];

const categoryOptions: Array<{ label: string; value: RuleCategory }> = [
  { label: "仓位", value: "position" },
  { label: "买入条件", value: "buy" },
  { label: "卖出条件", value: "sell" },
  { label: "做 T", value: "t_trade" },
  { label: "情绪管理", value: "emotion" },
  { label: "其他", value: "other" },
];

const statusOptions: Array<{ label: string; value: RuleStatus }> = [
  { label: "生效中", value: "active" },
  { label: "已废弃", value: "archived" },
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
  return categoryOptions.find((item) => item.value === category)?.label ?? category;
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
    emotionScore: null,
    emotionNote: "",
    resultNote: "",
    tags: [],
    ruleIds: [],
  };
}

function emptyRuleForm(): TradingRuleInput {
  return {
    title: "",
    body: "",
    category: "other",
    status: "active",
    tags: [],
  };
}

export function NotesPage() {
  const [activeTab, setActiveTab] = useState<NotesTab>("journal");
  const activeMeta = tabMeta[activeTab];

  return (
    <section className="notes-page">
      <div className="calculator-page-header">
        <header className="panel calculator-page-meta">
          <div>
            <p className="eyebrow">Journal</p>
            <h1>交易笔记</h1>
          </div>
          <span className="stage-pill">实盘与规则</span>
        </header>
        <div className="panel calculator-page-heading">
          <NotebookPen aria-hidden="true" size={28} />
          <div>
            <p className="eyebrow">Notes</p>
            <h2>{activeMeta.title}</h2>
            <p>{activeMeta.description}</p>
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
      {activeTab === "rules" ? <RulesPanel /> : null}
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
  const [emotionFilter, setEmotionFilter] = useState<string>("all");
  const [modal, setModal] = useState<null | { mode: "new" } | { mode: "edit"; id: number }>(null);
  const [form, setForm] = useState<JournalEntryInput>(emptyJournalForm());
  const [tagsDraft, setTagsDraft] = useState("");
  const [loading, setLoading] = useState(true);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    entries.forEach((entry) => entry.tags.forEach((tag) => set.add(tag)));
    return Array.from(set).sort();
  }, [entries]);

  async function refresh() {
    setLoading(true);
    try {
      const [nextEntries, nextRules] = await Promise.all([
        loadJournalEntries({
          side: sideFilter === "all" ? undefined : sideFilter,
          tag: tagFilter || undefined,
          symbol: symbolFilter || undefined,
          emotionScore: emotionFilter === "all" ? undefined : Number(emotionFilter),
        }),
        loadTradingRules({ status: "active" }),
      ]);
      setEntries(nextEntries);
      setRules(nextRules);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, [sideFilter, tagFilter, symbolFilter, emotionFilter]);

  function openNew() {
    setForm(emptyJournalForm());
    setTagsDraft("");
    setModal({ mode: "new" });
  }

  function openEdit(entry: JournalEntry) {
    setForm({
      entryDate: entry.entryDate,
      side: entry.side,
      symbolName: entry.symbolName ?? "",
      price: entry.price,
      quantity: entry.quantity,
      reason: entry.reason,
      planNote: entry.planNote ?? "",
      emotionScore: entry.emotionScore,
      emotionNote: entry.emotionNote ?? "",
      resultNote: entry.resultNote ?? "",
      tags: entry.tags,
      ruleIds: entry.ruleIds,
    });
    setTagsDraft(entry.tags.join("，"));
    setModal({ mode: "edit", id: entry.id });
  }

  async function handleSave() {
    const payload: JournalEntryInput = {
      ...form,
      symbolCode: null,
      symbolName: form.symbolName || null,
      planNote: form.planNote || null,
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
    await refresh();
  }

  async function handleDelete(id: number) {
    await deleteJournalEntry(id);
    showSuccess("笔记已删除");
    await refresh();
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

        <div className="notes-filters notes-filters-4">
          <label>
            方向
            <AppSelect
              onChange={setSideFilter}
              options={[{ label: "全部", value: "all" }, ...sideOptions]}
              value={sideFilter}
            />
          </label>
          <label>
            情绪
            <AppSelect
              onChange={setEmotionFilter}
              options={[
                { label: "全部", value: "all" },
                ...[1, 2, 3, 4, 5].map((score) => ({ label: `${score} 分`, value: String(score) })),
              ]}
              value={emotionFilter}
            />
          </label>
          <label>
            标签
            <AppSelect
              onChange={setTagFilter}
              options={[{ label: "全部标签", value: "" }, ...allTags.map((tag) => ({ label: tag, value: tag }))]}
              value={tagFilter}
            />
          </label>
          <label>
            标的
            <input placeholder="标的名称" value={symbolFilter} onChange={(event) => setSymbolFilter(event.target.value)} />
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
                  <span className="notes-card-meta">
                    {entry.entryDate}
                    {entry.emotionScore != null ? ` · 情绪 ${entry.emotionScore}/5` : ""}
                  </span>
                </div>
                <div className="notes-card-actions">
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

      {modal ? (
        <div className="settings-modal-backdrop" onClick={() => setModal(null)} role="presentation">
          <div
            aria-labelledby="journal-modal-title"
            aria-modal="true"
            className="settings-modal notes-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="section-header">
              <h2 id="journal-modal-title">{modal.mode === "new" ? "新建实盘笔记" : "编辑实盘笔记"}</h2>
              <button aria-label="关闭" className="text-button" onClick={() => setModal(null)} type="button">
                ×
              </button>
            </div>

            <div className="settings-grid">
              <label>
                日期
                <input type="date" value={form.entryDate} onChange={(event) => setForm((current) => ({ ...current, entryDate: event.target.value }))} />
              </label>
              <label>
                方向
                <AppSelect onChange={(value) => setForm((current) => ({ ...current, side: value }))} options={sideOptions} value={form.side} />
              </label>
              <label>
                标的名称
                <input value={form.symbolName ?? ""} onChange={(event) => setForm((current) => ({ ...current, symbolName: event.target.value }))} />
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
              <label className="settings-wide">
                为什么买/卖
                <textarea
                  rows={4}
                  value={form.reason}
                  onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))}
                />
              </label>
              <label className="settings-wide">
                当时计划 / 失效条件
                <textarea
                  rows={3}
                  value={form.planNote ?? ""}
                  onChange={(event) => setForm((current) => ({ ...current, planNote: event.target.value }))}
                />
              </label>
              <label>
                情绪分（1–5）
                <AppSelect
                  onChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      emotionScore: value === "" ? null : Number(value),
                    }))
                  }
                  options={[
                    { label: "未填写", value: "" },
                    ...[1, 2, 3, 4, 5].map((score) => ({ label: String(score), value: String(score) })),
                  ]}
                  value={form.emotionScore == null ? "" : String(form.emotionScore)}
                />
              </label>
              <label>
                情绪短评
                <input
                  value={form.emotionNote ?? ""}
                  onChange={(event) => setForm((current) => ({ ...current, emotionNote: event.target.value }))}
                />
              </label>
              <label className="settings-wide">
                结果复盘
                <textarea
                  rows={3}
                  value={form.resultNote ?? ""}
                  onChange={(event) => setForm((current) => ({ ...current, resultNote: event.target.value }))}
                />
              </label>
              <label className="settings-wide">
                标签（逗号或空格分隔）
                <input value={tagsDraft} onChange={(event) => setTagsDraft(event.target.value)} placeholder="如：突破，做T，纪律执行" />
              </label>
            </div>

            {rules.length ? (
              <div className="notes-rule-picker">
                <h3>关联规则（可选）</h3>
                <div className="notes-rule-picker-list">
                  {rules.map((rule) => {
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

function RulesPanel() {
  const [rules, setRules] = useState<TradingRule[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [modal, setModal] = useState<null | { mode: "new" } | { mode: "edit"; id: number }>(null);
  const [form, setForm] = useState<TradingRuleInput>(emptyRuleForm());
  const [tagsDraft, setTagsDraft] = useState("");
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    try {
      const next = await loadTradingRules({
        status: statusFilter === "all" ? undefined : statusFilter,
        category: categoryFilter === "all" ? undefined : categoryFilter,
      });
      setRules(next);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, [statusFilter, categoryFilter]);

  function openNew() {
    setForm(emptyRuleForm());
    setTagsDraft("");
    setModal({ mode: "new" });
  }

  function openEdit(rule: TradingRule) {
    setForm({
      title: rule.title,
      body: rule.body,
      category: rule.category,
      status: rule.status,
      tags: rule.tags,
    });
    setTagsDraft(rule.tags.join("，"));
    setModal({ mode: "edit", id: rule.id });
  }

  async function handleSave() {
    const payload: TradingRuleInput = {
      ...form,
      tags: parseTags(tagsDraft),
    };
    if (modal?.mode === "edit") {
      await updateTradingRule(modal.id, payload);
      showSuccess("规则已更新");
    } else {
      await createTradingRule(payload);
      showSuccess("规则已创建");
    }
    setModal(null);
    await refresh();
  }

  async function handleDelete(id: number) {
    await deleteTradingRule(id);
    showSuccess("规则已删除");
    await refresh();
  }

  return (
    <section className="notes-panel">
      <div className="panel">
        <div className="section-header">
          <h2>规则列表</h2>
          <button className="text-button" onClick={openNew} type="button">
            <Plus size={15} />
            新建规则
          </button>
        </div>

        <div className="notes-filters">
          <label>
            状态
            <AppSelect
              onChange={setStatusFilter}
              options={[{ label: "全部", value: "all" }, ...statusOptions]}
              value={statusFilter}
            />
          </label>
          <label>
            分类
            <AppSelect
              onChange={setCategoryFilter}
              options={[{ label: "全部分类", value: "all" }, ...categoryOptions]}
              value={categoryFilter}
            />
          </label>
        </div>

        {loading ? <p className="empty-copy">加载中…</p> : null}
        {!loading && !rules.length ? <p className="empty-copy">暂无操作规则，可以把仓位与买卖纪律写在这里。</p> : null}

        <div className="notes-card-list">
          {rules.map((rule) => (
            <article className="notes-card" key={rule.id}>
              <div className="notes-card-head">
                <div>
                  <strong>{rule.title}</strong>
                  <span className="notes-card-meta">
                    {categoryLabel(rule.category)} · {rule.status === "active" ? "生效中" : "已废弃"}
                  </span>
                </div>
                <div className="notes-card-actions">
                  <button className="text-button" onClick={() => openEdit(rule)} type="button">
                    编辑
                  </button>
                  <button aria-label="删除规则" className="icon-button danger-button" onClick={() => void handleDelete(rule.id)} type="button">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              <p className="notes-card-reason">{rule.body}</p>
              {rule.tags.length ? (
                <div className="notes-tag-row">
                  {rule.tags.map((tag) => (
                    <em key={tag}>{tag}</em>
                  ))}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </div>

      {modal ? (
        <div className="settings-modal-backdrop" onClick={() => setModal(null)} role="presentation">
          <div
            aria-labelledby="rule-modal-title"
            aria-modal="true"
            className="settings-modal notes-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="section-header">
              <h2 id="rule-modal-title">{modal.mode === "new" ? "新建操作规则" : "编辑操作规则"}</h2>
              <button aria-label="关闭" className="text-button" onClick={() => setModal(null)} type="button">
                ×
              </button>
            </div>

            <div className="settings-grid">
              <label className="settings-wide">
                标题
                <input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} />
              </label>
              <label>
                分类
                <AppSelect
                  onChange={(value) => setForm((current) => ({ ...current, category: value }))}
                  options={categoryOptions}
                  value={form.category}
                />
              </label>
              <label>
                状态
                <AppSelect
                  onChange={(value) => setForm((current) => ({ ...current, status: value }))}
                  options={statusOptions}
                  value={form.status}
                />
              </label>
              <label className="settings-wide">
                细则
                <textarea rows={5} value={form.body} onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))} />
              </label>
              <label className="settings-wide">
                标签（逗号或空格分隔）
                <input value={tagsDraft} onChange={(event) => setTagsDraft(event.target.value)} />
              </label>
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
        <div className="notes-filters">
          <label>
            开始日期
            <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </label>
          <label>
            结束日期
            <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
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
            <div className="notes-summary-grid">
              <article>
                <span>笔记条数</span>
                <strong>{summary.entryCount}</strong>
              </article>
              <article>
                <span>情绪均分</span>
                <strong>{summary.emotionAvg == null ? "-" : summary.emotionAvg.toFixed(1)}</strong>
              </article>
              <article>
                <span>含情绪条数</span>
                <strong>{summary.emotionCount}</strong>
              </article>
              <article>
                <span>规则引用次数</span>
                <strong>{summary.ruleRefCount}</strong>
              </article>
            </div>

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
