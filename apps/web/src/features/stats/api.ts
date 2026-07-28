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
  tag_stats: Array<{
    tag: string;
    count: number;
    pnl: number;
    symbol_code?: string | null;
    symbol_name?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    review_id?: number | null;
  }>;
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
  operation_count: number;
  trade_day_span: number;
  win_count: number;
  max_profit_rate: number;
  max_loss_rate: number;
  /** 持仓期盯市权益偏移（现金从 0）；前端加初始资产后算最大回撤 */
  mtm_equity_curve: number[];
};

export async function loadStatsSummary(markBasis: string = "low"): Promise<StatsSummary> {
  const params = new URLSearchParams({ mark_basis: markBasis });
  return apiJson(`${API_BASE}/api/stats/summary?${params.toString()}`);
}
