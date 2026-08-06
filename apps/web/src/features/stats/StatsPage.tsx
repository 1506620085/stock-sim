import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BarChart3, ListChecks, NotebookPen, TrendingUp } from "lucide-react";
import { FieldHelpTip } from "../../components/FieldHelpTip";
import { loadPreferences } from "../settings/api";
import { loadStatsSummary, type StatsSummary } from "./api";
import { TagDetailPanel } from "./TagDetailPanel";
import { TagDonutChart } from "./TagDonutChart";
import { TagPeekDrawer } from "./TagPeekDrawer";
import { aggregateTagStats, listTagOccurrences } from "./tagAggregation";

const emptySummary: StatsSummary = {
  total_sessions: 0,
  total_trades: 0,
  buy_count: 0,
  sell_count: 0,
  win_rate: 0,
  realized_pnl: 0,
  average_profit: 0,
  average_loss: 0,
  profit_loss_ratio: 0,
  review_count: 0,
  calendar: [],
  tag_stats: [],
  recent_reviews: [],
  journal_entry_count: 0,
  journal_emotion_avg: null,
  journal_rule_ref_count: 0,
  journal_tag_stats: [],
  recent_journal_entries: [],
  operation_count: 0,
  trade_day_span: 0,
  win_count: 0,
  max_profit_rate: 0,
  max_loss_rate: 0,
  mtm_equity_curve: [],
};

export function StatsPage() {
  const [summary, setSummary] = useState<StatsSummary>(emptySummary);
  const [tagDrawerOpen, setTagDrawerOpen] = useState(false);
  const [tagDetailOpen, setTagDetailOpen] = useState(true);
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const preferences = useMemo(() => loadPreferences(), []);
  const aggregatedTags = useMemo(() => aggregateTagStats(summary.tag_stats), [summary.tag_stats]);
  const detailOccurrences = useMemo(
    () => listTagOccurrences(summary.tag_stats, filterTag),
    [summary.tag_stats, filterTag],
  );

  function selectTagFilter(tag: string) {
    setFilterTag(tag);
    setTagDetailOpen(true);
    setTagDrawerOpen(false);
  }

  useEffect(() => {
    let cancelled = false;
    loadStatsSummary(preferences.replaySellPriceBasis)
      .then((data) => {
        if (!cancelled) setSummary(data);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [preferences.replaySellPriceBasis]);

  const capitalBase = preferences.startingCash + preferences.settledCashAdjustment;
  const totalPnl = summary.realized_pnl + preferences.settledCashAdjustment;
  const returnRate = preferences.startingCash > 0 ? (totalPnl / preferences.startingCash) * 100 : 0;
  const maxDrawdownRate = computeMaxDrawdownRate(capitalBase, summary.mtm_equity_curve);

  const overviewMetrics = [
    {
      label: "总盈亏",
      value: formatSignedNumber(totalPnl),
      tone: toneOf(totalPnl),
    },
    {
      label: "操作次数/天数",
      value: `${summary.operation_count}/${summary.trade_day_span}`,
    },
    {
      label: "最大盈利",
      value: formatSignedPercent(summary.max_profit_rate),
      tone: toneOf(summary.max_profit_rate),
    },
    {
      label: "收益率",
      value: formatSignedPercent(returnRate),
      tone: toneOf(returnRate),
    },
    {
      label: "盈利次数",
      value: summary.win_count.toLocaleString("zh-CN"),
    },
    {
      label: "最大亏损",
      value: formatSignedPercent(summary.max_loss_rate),
      tone: toneOf(summary.max_loss_rate),
    },
    {
      label: "成功率",
      value: `${summary.win_rate.toFixed(2)}%`,
    },
    {
      label: "最大回撤",
      value: formatSignedPercent(maxDrawdownRate),
      tone: toneOf(maxDrawdownRate),
      tip: "按持仓期间每日市值盯市的账户权益曲线计算：相对曲线上真实出现过的权益峰值，取最大跌幅。与 K 线区间%（相对买入成本的浮盈亏）不是同一指标。估值口径与设置中的卖出成交价一致。",
    },
  ];

  return (
    <section className="stats-page">
      <div className="stats-grid">
        <MetricCard icon={ListChecks} label="复盘次数" value={summary.total_sessions.toLocaleString("zh-CN")} />
        <MetricCard icon={BarChart3} label="交易次数" value={summary.total_trades.toLocaleString("zh-CN")} meta={`买 ${summary.buy_count} / 卖 ${summary.sell_count}`} />
        <MetricCard icon={TrendingUp} label="胜率" value={`${summary.win_rate.toFixed(1)}%`} />
        <MetricCard
          icon={AlertTriangle}
          label="盈亏比"
          tip="盈亏比 = |平均盈利 ÷ 平均亏损|。按每笔平仓（卖出）的已实现盈亏统计；需同时有盈利与亏损平仓样本，否则显示为 -。"
          tipAriaLabel="盈亏比说明"
          value={summary.profit_loss_ratio ? summary.profit_loss_ratio.toFixed(2) : "-"}
          meta={
            summary.profit_loss_ratio
              ? `复盘总结 ${summary.review_count}`
              : summary.average_profit
                ? "暂无亏损平仓样本"
                : "需同时有盈利与亏损平仓"
          }
        />
        <MetricCard
          icon={NotebookPen}
          label="实盘笔记"
          value={summary.journal_entry_count.toLocaleString("zh-CN")}
          meta={`规则引用 ${summary.journal_rule_ref_count}`}
        />
      </div>

      <div className="stats-layout">
        <section className="panel stats-panel">
          <div className="section-header">
            <h2>盈亏概览</h2>
          </div>
          <div className="stats-bars">
            <BarRow label="平均盈利" value={summary.average_profit} max={Math.max(Math.abs(summary.average_profit), Math.abs(summary.average_loss), 1)} />
            <BarRow label="平均亏损" value={summary.average_loss} max={Math.max(Math.abs(summary.average_profit), Math.abs(summary.average_loss), 1)} />
          </div>
          <div className="stats-overview-grid">
            {overviewMetrics.map((item) => (
              <article className="stats-overview-item" key={item.label}>
                <div className="stats-overview-label">
                  <span>{item.label}</span>
                  {"tip" in item && item.tip ? (
                    <FieldHelpTip aria-label={`${item.label}说明`} tip={item.tip} />
                  ) : null}
                </div>
                <strong className={item.tone}>{item.value}</strong>
              </article>
            ))}
          </div>
        </section>

        <section className="panel stats-panel stats-panel-tags">
          <div className="section-header">
            <h2>错因标签</h2>
            <span>{aggregatedTags.length}</span>
          </div>
          <div className={`tag-panel-body${tagDetailOpen ? " is-detail-open" : ""}`}>
            <div className="tag-panel-main">
              <div className="tag-donut-section">
                <TagDonutChart items={aggregatedTags} onSelectTag={selectTagFilter} />
              </div>
              <TagDetailPanel
                filterTag={filterTag}
                items={detailOccurrences}
                onClearFilter={() => setFilterTag(null)}
                onCollapse={() => setTagDetailOpen(false)}
                onExpand={() => setTagDetailOpen(true)}
                open={tagDetailOpen}
              />
            </div>
            <TagPeekDrawer
              activeTag={filterTag}
              items={aggregatedTags}
              onOpenChange={setTagDrawerOpen}
              onSelectTag={selectTagFilter}
              open={tagDrawerOpen}
            />
          </div>
        </section>

        <section className="panel stats-panel">
          <div className="section-header">
            <h2>最近总结</h2>
            <span>{summary.recent_reviews.length}</span>
          </div>
          <div className="recent-review-list">
            {summary.recent_reviews.length ? (
              summary.recent_reviews.map((review) => (
                <article key={review.id}>
                  <strong>{review.title}</strong>
                  <span>{review.tags.join(" / ") || "未标记"}</span>
                  <p>{review.note || "未填写总结"}</p>
                </article>
              ))
            ) : (
              <p className="empty-copy">保存区间复盘后，这里会集中展示最近总结。</p>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}

function MetricCard({
  icon: Icon,
  label,
  meta,
  tip,
  tipAriaLabel,
  value,
}: {
  icon: typeof BarChart3;
  label: string;
  meta?: string;
  tip?: string;
  tipAriaLabel?: string;
  value: string;
}) {
  return (
    <article className="panel metric-card">
      <div className="metric-card-label">
        <Icon size={18} />
        <span>{label}</span>
        {tip ? <FieldHelpTip aria-label={tipAriaLabel ?? `${label}说明`} placement="bottom" tip={tip} /> : null}
      </div>
      <div className="metric-card-value-row">
        <strong>{value}</strong>
        {meta ? <em>{meta}</em> : null}
      </div>
    </article>
  );
}

function BarRow({ label, max, value }: { label: string; max: number; value: number }) {
  const width = Math.min(100, (Math.abs(value) / max) * 100);
  return (
    <div className="stats-bar-row">
      <span>{label}</span>
      <div>
        <i className={value >= 0 ? "positive-bg" : "negative-bg"} style={{ width: `${width}%` }} />
      </div>
      <strong className={value >= 0 ? "positive" : "negative"}>{formatNumber(value)}</strong>
    </div>
  );
}

function computeMaxDrawdownRate(capitalBase: number, mtmEquityCurve: number[]) {
  if (!(capitalBase > 0) || !mtmEquityCurve.length) return 0;
  let peak = Number.NEGATIVE_INFINITY;
  let maxDrawdown = 0;
  for (const offset of mtmEquityCurve) {
    const equity = capitalBase + offset;
    if (equity > peak) peak = equity;
    if (peak > 0) {
      const drawdown = ((equity - peak) / peak) * 100;
      if (drawdown < maxDrawdown) maxDrawdown = drawdown;
    }
  }
  return maxDrawdown;
}

function toneOf(value: number) {
  if (value > 0) return "positive";
  if (value < 0) return "negative";
  return undefined;
}

function formatNumber(value: number) {
  return value.toLocaleString("zh-CN", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });
}

function formatSignedNumber(value: number) {
  const abs = formatNumber(Math.abs(value));
  if (value > 0) return `+${abs}`;
  if (value < 0) return `-${abs}`;
  return abs;
}

function formatSignedPercent(value: number) {
  const abs = Math.abs(value).toFixed(2);
  if (value > 0) return `+${abs}%`;
  if (value < 0) return `-${abs}%`;
  return `+${abs}%`;
}
