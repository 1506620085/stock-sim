import { API_BASE, extractErrorMessage } from "../../api/client";

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
};

export async function loadStatsSummary(): Promise<StatsSummary> {
  const response = await fetch(`${API_BASE}/api/stats/summary`);
  if (!response.ok) {
    throw new Error(await extractErrorMessage(response));
  }

  return response.json();
}
