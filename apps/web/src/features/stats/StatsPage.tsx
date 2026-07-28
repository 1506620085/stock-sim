import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BarChart3, CalendarDays, ListChecks, NotebookPen, TrendingUp } from "lucide-react";
import { FieldHelpTip } from "../../components/FieldHelpTip";
import { loadPreferences } from "../settings/api";
import { loadStatsSummary, type StatsSummary } from "./api";

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
  closed_pnl_curve: [],
};

export function StatsPage() {
  const [summary, setSummary] = useState<StatsSummary>(emptySummary);
  const preferences = useMemo(() => loadPreferences(), []);

  useEffect(() => {
    let cancelled = false;
    loadStatsSummary()
      .then((data) => {
        if (!cancelled) setSummary(data);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

  const totalPnl = summary.realized_pnl + preferences.settledCashAdjustment;
  const returnRate = preferences.startingCash > 0 ? (totalPnl / preferences.startingCash) * 100 : 0;
  const maxDrawdownRate = computeMaxDrawdownRate(preferences.startingCash, summary.closed_pnl_curve);

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
          <div className="stats-overview-grid">
            {overviewMetrics.map((item) => (
              <article className="stats-overview-item" key={item.label}>
                <span>{item.label}</span>
                <strong className={item.tone}>{item.value}</strong>
              </article>
            ))}
          </div>
          <div className="stats-bars">
            <BarRow
              kind="profit"
              label="平均盈利"
              value={summary.average_profit}
              max={Math.max(Math.abs(summary.average_profit), Math.abs(summary.average_loss), 1)}
            />
            <BarRow
              kind="loss"
              label="平均亏损"
              value={summary.average_loss}
              max={Math.max(Math.abs(summary.average_profit), Math.abs(summary.average_loss), 1)}
            />
          </div>
        </section>

        <section className="panel stats-panel">
          <div className="section-header">
            <h2>错因标签</h2>
            <span>{summary.tag_stats.length}</span>
          </div>
          <div className="tag-stat-list">
            {summary.tag_stats.length ? (
              summary.tag_stats.map((item, index) => (
                <article key={`${item.review_id ?? "tag"}-${item.tag}-${index}`}>
                  <div className="tag-stat-main">
                    <strong>{item.tag}</strong>
                    <span>{formatTagSource(item)}</span>
                  </div>
                  <em className={item.pnl >= 0 ? "positive" : "negative"}>{formatNumber(item.pnl)}</em>
                </article>
              ))
            ) : (
              <p className="empty-copy">区间复盘添加标签后，这里会显示问题分布。</p>
            )}
          </div>
        </section>

        <section className="panel stats-panel">
          <div className="section-header">
            <h2>复盘日历</h2>
            <CalendarDays size={18} />
          </div>
          <div className="calendar-list">
            {summary.calendar.length ? (
              summary.calendar.map((item) => (
                <article key={item.date}>
                  <strong>{item.date}</strong>
                  <span>{item.sessions} 次复盘 / {item.trades} 笔交易</span>
                </article>
              ))
            ) : (
              <p className="empty-copy">开始创建复盘 session 后，这里会出现训练日历。</p>
            )}
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
        {tip ? <FieldHelpTip aria-label={tipAriaLabel ?? `${label}说明`} tip={tip} /> : null}
      </div>
      <strong>{value}</strong>
      {meta ? <em>{meta}</em> : null}
    </article>
  );
}

function BarRow({
  kind,
  label,
  max,
  value,
}: {
  kind: "profit" | "loss";
  label: string;
  max: number;
  value: number;
}) {
  const width = Math.min(100, (Math.abs(value) / max) * 100);
  return (
    <article className={`stats-bar-card stats-bar-card--${kind}`}>
      <div className="stats-bar-card-head">
        <span>{label}</span>
        <strong className={kind === "profit" ? "positive" : "negative"}>{formatNumber(value)}</strong>
      </div>
      <div className="stats-bar-track" aria-hidden="true">
        <i className={kind === "profit" ? "positive-bg" : "negative-bg"} style={{ width: `${width}%` }} />
      </div>
    </article>
  );
}

function computeMaxDrawdownRate(startingCash: number, curve: number[]) {
  if (!(startingCash > 0) || !curve.length) return 0;
  let peak = startingCash;
  let maxDrawdown = 0;
  for (const cumulativePnl of curve) {
    const equity = startingCash + cumulativePnl;
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

function formatTagSource(item: StatsSummary["tag_stats"][number]) {
  const stock = [item.symbol_name, item.symbol_code].filter(Boolean).join(" ") || "未知标的";
  if (item.start_date && item.end_date) {
    return item.start_date === item.end_date
      ? `${stock} · ${item.start_date}`
      : `${stock} · ${item.start_date} ~ ${item.end_date}`;
  }
  if (item.start_date || item.end_date) {
    return `${stock} · ${item.start_date ?? "?"} ~ ${item.end_date ?? "?"}`;
  }
  return `${stock} · 区间未知`;
}
