/**
 * reviewTagHistory
 * 区间复盘标签历史：仅在成功保存复盘后写入，本地持久化并去重。
 */

const STORAGE_KEY = "stock-sim.review-tag-history";

function normalizeTag(raw: string) {
  return raw.trim().replace(/\s+/g, " ");
}

function uniquePreserveOrder(items: string[]) {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const item of items) {
    const tag = normalizeTag(item);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    next.push(tag);
  }
  return next;
}

export function loadReviewTagHistory(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return uniquePreserveOrder(parsed.map((item) => String(item ?? "")));
  } catch {
    return [];
  }
}

export function saveReviewTagHistory(tags: string[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(uniquePreserveOrder(tags)));
}

/** 将本次保存使用的标签合并进历史（新标签靠前）。 */
export function mergeReviewTagHistory(tags: string[]): string[] {
  const incoming = uniquePreserveOrder(tags);
  if (!incoming.length) return loadReviewTagHistory();
  const existing = loadReviewTagHistory().filter((tag) => !incoming.includes(tag));
  const next = [...incoming, ...existing];
  saveReviewTagHistory(next);
  return next;
}

export function removeReviewTagFromHistory(tag: string): string[] {
  const next = loadReviewTagHistory().filter((item) => item !== normalizeTag(tag));
  saveReviewTagHistory(next);
  return next;
}

/** 用已加载的复盘记录回填历史（兼容旧数据，去重）。 */
export function hydrateReviewTagHistoryFromReviews(reviews: Array<{ tags?: string[] | null }>): string[] {
  const fromReviews = uniquePreserveOrder(reviews.flatMap((review) => review.tags ?? []));
  if (!fromReviews.length) return loadReviewTagHistory();
  return mergeReviewTagHistory(fromReviews);
}
