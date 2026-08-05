import { PanelRightClose, X } from "lucide-react";
import type { TagOccurrence } from "./tagAggregation";
import { formatTagDate, formatTagSource } from "./tagAggregation";

type Props = {
  items: TagOccurrence[];
  filterTag: string | null;
  open: boolean;
  onClearFilter: () => void;
  onCollapse: () => void;
};

export function TagDetailPanel({ items, filterTag, open, onClearFilter, onCollapse }: Props) {
  if (!open) return null;

  return (
    <aside className="tag-detail-panel" aria-label="错因详情列表">
      <div className="tag-detail-panel-header">
        <div className="tag-detail-panel-title">
          <strong>错因详情列表</strong>
          <span>
            {filterTag ? `筛选：${filterTag}` : "全部标签 · 按发布时间从新到旧"}
            {` · ${items.length}`}
          </span>
        </div>
        <div className="tag-detail-panel-actions">
          {filterTag ? (
            <button onClick={onClearFilter} type="button">
              <X size={14} />
              清除筛选
            </button>
          ) : null}
          <button aria-label="收起错因详情列表" onClick={onCollapse} title="收起详情列表" type="button">
            <PanelRightClose size={15} />
          </button>
        </div>
      </div>

      <div className="tag-detail-panel-body">
        {items.length ? (
          <ul className="tag-detail-occurrence-list">
            {items.map((item, index) => (
              <li key={`${item.review_id ?? "x"}-${item.tag}-${index}`}>
                <div className="tag-detail-occurrence-top">
                  <strong>{item.tag}</strong>
                  <em className={item.pnl >= 0 ? "positive" : "negative"}>{formatSigned(item.pnl)}</em>
                </div>
                <span>{formatTagSource(item)}</span>
                <span className="tag-detail-occurrence-time">
                  发布 {formatTagDate(item.created_at || item.end_date || item.start_date)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty-copy">
            {filterTag ? "该标签暂无详情记录。" : "区间复盘添加标签后，这里会按时间展示详情。"}
          </p>
        )}
      </div>
    </aside>
  );
}

function formatSigned(value: number) {
  const abs = Math.abs(value).toLocaleString("zh-CN", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });
  if (value > 0) return `+${abs}`;
  if (value < 0) return `-${abs}`;
  return abs;
}
