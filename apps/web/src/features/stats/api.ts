import { API_BASE, apiJson } from "../../api/client";

export type StatsSummary = {
  total_sessions: number;
  total_trades: number;
  buy_count: number;
  sell_count: number;
  win_rate: number;
  realized_pnl: number;
  average_profit: number;
  average_loss: number;
  profit_loss_ratio: number;
  review_count: number;
  calendar: Array<{ date: string; sessions: number; trades: number }>;
  tag_stats: Array<{ tag: string; count: number; pnl: number }>;
  recent_reviews: Array<{ id: number; title: string; note: string | null; tags: string[]; metrics_snapshot: Record<string, unknown>; created_at: string }>;
  journal_entry_count: number;
  journal_emotion_avg: number | null;
  journal_rule_ref_count: number;
  journal_tag_stats: Array<{ tag: string; count: number }>;
  recent_journal_entries: Array<{
    id: number;
    entry_date: string;
    side: string;
    symbol_code: string | null;
    symbol_name: string | null;
    reason: string;
    emotion_score: number | null;
    tags: string[];
  }>;
};

export async function loadStatsSummary(): Promise<StatsSummary> {
  return apiJson(`${API_BASE}/api/stats/summary`);
}
