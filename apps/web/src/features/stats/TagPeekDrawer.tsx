import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ChevronUp, Search, X } from "lucide-react";
import type { AggregatedTagStat } from "./tagAggregation";
import { formatTagDate, formatTagSource } from "./tagAggregation";

type SortKey = "count" | "share" | "lastSeen" | "tag";
type SortDir = "asc" | "desc";

type Props = {
  items: AggregatedTagStat[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  highlightTag?: string | null;
  onHighlightConsumed?: () => void;
};

const PEEK_HEIGHT = 52;
const EXPANDED_RATIO = 0.62;

export function TagPeekDrawer({ items, open, onOpenChange, highlightTag, onHighlightConsumed }: Props) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("count");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [minCount, setMinCount] = useState(1);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const dragRef = useRef<{ startY: number; open: boolean } | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!highlightTag) return;
    setSelectedTag(highlightTag);
    onOpenChange(true);
    onHighlightConsumed?.();
  }, [highlightTag, onOpenChange, onHighlightConsumed]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = items.filter((item) => {
      if (item.count < minCount) return false;
      if (!q) return true;
      return item.tag.toLowerCase().includes(q);
    });

    const dir = sortDir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      if (sortKey === "tag") return a.tag.localeCompare(b.tag, "zh-CN") * dir;
      if (sortKey === "lastSeen") {
        const av = a.lastSeen ?? "";
        const bv = b.lastSeen ?? "";
        return av.localeCompare(bv) * dir;
      }
      if (sortKey === "share") return (a.share - b.share) * dir;
      return (a.count - b.count) * dir;
    });
  }, [items, minCount, query, sortDir, sortKey]);

  const selected = selectedTag ? items.find((item) => item.tag === selectedTag) ?? null : null;

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(key === "tag" ? "asc" : "desc");
  }

  function onHandlePointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { startY: event.clientY, open };
    setDragOffset(0);
  }

  function onHandlePointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!dragRef.current) return;
    const delta = dragRef.current.startY - event.clientY;
    setDragOffset(delta);
  }

  function onHandlePointerUp(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!dragRef.current) return;
    const delta = dragRef.current.startY - event.clientY;
    const wasOpen = dragRef.current.open;
    dragRef.current = null;
    setDragOffset(0);

    if (Math.abs(delta) < 12) {
      onOpenChange(!wasOpen);
      return;
    }
    onOpenChange(delta > 0);
  }

  const sheetStyle = open
    ? {
        height: `calc(${EXPANDED_RATIO * 100}% + ${Math.max(-40, Math.min(40, dragOffset))}px)`,
      }
    : {
        height: `${Math.max(PEEK_HEIGHT, Math.min(PEEK_HEIGHT + 80, PEEK_HEIGHT + dragOffset))}px`,
      };

  return (
    <>
      <button
        aria-hidden={!open}
        className={`tag-peek-mask${open ? " is-open" : ""}`}
        onClick={() => onOpenChange(false)}
        tabIndex={open ? 0 : -1}
        type="button"
      />

      <div
        aria-expanded={open}
        className={`tag-peek-drawer${open ? " is-open" : ""}`}
        ref={sheetRef}
        style={sheetStyle}
      >
        <button
          aria-label={open ? "收起错因详情列表" : "展开错因详情列表"}
          className="tag-peek-handle"
          onPointerCancel={() => {
            dragRef.current = null;
            setDragOffset(0);
          }}
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={onHandlePointerUp}
          type="button"
        >
          <span className="tag-peek-grip" />
          <strong>错因详情列表</strong>
          <ChevronUp className="tag-peek-chevron" size={16} strokeWidth={2.2} />
          <em>{items.length}</em>
        </button>

        <div className="tag-peek-body">
          <div className="tag-peek-toolbar">
            <label className="tag-peek-search">
              <Search size={14} strokeWidth={2} />
              <input
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索错因标签"
                type="search"
                value={query}
              />
            </label>
            <label className="tag-peek-filter">
              <span>至少</span>
              <select onChange={(event) => setMinCount(Number(event.target.value))} value={minCount}>
                <option value={1}>1 次</option>
                <option value={2}>2 次</option>
                <option value={3}>3 次</option>
                <option value={5}>5 次</option>
              </select>
            </label>
          </div>

          <div className="tag-peek-table-wrap">
            <table className="tag-peek-table">
              <thead>
                <tr>
                  <th>
                    <button onClick={() => toggleSort("tag")} type="button">
                      错因标签{sortHint(sortKey, sortDir, "tag")}
                    </button>
                  </th>
                  <th>
                    <button onClick={() => toggleSort("count")} type="button">
                      次数{sortHint(sortKey, sortDir, "count")}
                    </button>
                  </th>
                  <th>
                    <button onClick={() => toggleSort("share")} type="button">
                      占比{sortHint(sortKey, sortDir, "share")}
                    </button>
                  </th>
                  <th>
                    <button onClick={() => toggleSort("lastSeen")} type="button">
                      最近出现{sortHint(sortKey, sortDir, "lastSeen")}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.length ? (
                  filtered.map((item) => (
                    <tr
                      className={selectedTag === item.tag ? "is-active" : undefined}
                      key={item.tag}
                      onClick={() => setSelectedTag((prev) => (prev === item.tag ? null : item.tag))}
                    >
                      <td>
                        <span className="tag-peek-swatch" style={{ background: item.color }} />
                        {item.tag}
                      </td>
                      <td>{item.count}</td>
                      <td>{item.share.toFixed(1)}%</td>
                      <td>{formatTagDate(item.lastSeen)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="tag-peek-empty" colSpan={4}>
                      没有匹配的错因标签
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {selected ? (
            <div className="tag-peek-detail">
              <div className="tag-peek-detail-header">
                <div>
                  <strong>{selected.tag}</strong>
                  <span>
                    {selected.count} 次 · {selected.share.toFixed(1)}% · 累计盈亏{" "}
                    <em className={selected.totalPnl >= 0 ? "positive" : "negative"}>
                      {formatSigned(selected.totalPnl)}
                    </em>
                  </span>
                </div>
                <button aria-label="关闭详情" onClick={() => setSelectedTag(null)} type="button">
                  <X size={14} />
                </button>
              </div>
              <ul className="tag-peek-occurrence-list">
                {selected.occurrences.map((item, index) => (
                  <li key={`${item.review_id ?? "x"}-${index}`}>
                    <strong>{formatTagSource(item)}</strong>
                    <span>
                      {formatTagDate(item.created_at || item.end_date || item.start_date)}
                      {" · "}
                      <em className={item.pnl >= 0 ? "positive" : "negative"}>{formatSigned(item.pnl)}</em>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}

function sortHint(active: SortKey, dir: SortDir, key: SortKey) {
  if (active !== key) return "";
  return dir === "asc" ? " ↑" : " ↓";
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
