import type { AggregatedTagStat } from "./tagAggregation";
import { formatTagSource } from "./tagAggregation";
import type { StatsSummary } from "./api";

export type TrainingFocusItem = AggregatedTagStat & {
  latestSource: string;
};

/** 次数优先，同次数时亏损更重（totalPnl 更小）靠前。 */
export function pickTrainingFocusTags(tags: AggregatedTagStat[], limit = 3): TrainingFocusItem[] {
  return [...tags]
    .sort((left, right) => {
      if (right.count !== left.count) return right.count - left.count;
      if (left.totalPnl !== right.totalPnl) return left.totalPnl - right.totalPnl;
      return left.tag.localeCompare(right.tag, "zh-CN");
    })
    .slice(0, limit)
    .map((item) => ({
      ...item,
      latestSource: item.occurrences[0] ? formatTagSource(item.occurrences[0]) : "暂无关联复盘",
    }));
}

export function formatTrainingRhythm(calendar: StatsSummary["calendar"]): string {
  const today = startOfLocalDay(new Date());
  const weekStart = new Date(today);
  weekStart.setDate(weekStart.getDate() - 6);

  let weekSessions = 0;
  let latestDay: string | null = null;

  for (const entry of calendar) {
    const day = parseLocalDate(entry.date);
    if (!day) continue;
    if (!latestDay || entry.date > latestDay) latestDay = entry.date;
    if (day >= weekStart && day <= today) {
      weekSessions += entry.sessions;
    }
  }

  if (!latestDay) {
    return weekSessions > 0 ? `本周复盘 ${weekSessions} 次` : "尚未开始复盘";
  }

  const latest = parseLocalDate(latestDay);
  const daysSince = latest ? Math.max(0, Math.round((today.getTime() - latest.getTime()) / 86_400_000)) : null;
  if (daysSince == null) return `本周复盘 ${weekSessions} 次`;
  if (daysSince === 0) return `本周复盘 ${weekSessions} 次 · 今天有练习`;
  if (daysSince === 1) return `本周复盘 ${weekSessions} 次 · 距上次 1 天`;
  return `本周复盘 ${weekSessions} 次 · 距上次 ${daysSince} 天`;
}

function startOfLocalDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function parseLocalDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}
