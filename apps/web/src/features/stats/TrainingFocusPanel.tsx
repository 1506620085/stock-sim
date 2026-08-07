import type { TrainingFocusItem } from "./trainingFocus";

type Props = {
  items: TrainingFocusItem[];
  activeTag: string | null;
  onSelectTag: (tag: string) => void;
  onViewAllTags: () => void;
  onGoReplay: () => void;
};

export function TrainingFocusPanel({
  items,
  activeTag,
  onSelectTag,
  onViewAllTags,
  onGoReplay,
}: Props) {
  const primary = items[0] ?? null;

  return (
    <div className="training-focus-panel">
      {primary ? (
        <div className="training-focus-hero">
          <span className="training-focus-hero-label">优先警惕</span>
          <strong>
            {primary.tag}
            <em>
              {" "}
              · {primary.count} 次 · <span className={pnlTone(primary.totalPnl)}>{formatSignedPnl(primary.totalPnl)}</span>
            </em>
          </strong>
        </div>
      ) : null}

      {items.length ? (
        <div className="training-focus-list">
          {items.map((item) => {
            const active = item.tag === activeTag;
            return (
              <button
                aria-pressed={active}
                className={`training-focus-item${active ? " is-active" : ""}`}
                key={item.tag}
                onClick={() => onSelectTag(item.tag)}
                type="button"
              >
                <span className="training-focus-item-main">
                  <i aria-hidden="true" style={{ background: item.color }} />
                  <strong>{item.tag}</strong>
                  <em className={pnlTone(item.totalPnl)}>
                    {item.count}次 · {formatSignedPnl(item.totalPnl)}
                  </em>
                </span>
                <span className="training-focus-item-meta">{item.latestSource}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="empty-copy training-focus-empty">
          还没有错因标签。完成区间复盘并打上标签后，这里会提示下次最该盯的问题。
        </p>
      )}

      <div className="training-focus-actions">
        {items.length ? (
          <button className="text-button" onClick={onViewAllTags} type="button">
            查看全部错因
          </button>
        ) : (
          <button className="text-button" onClick={onGoReplay} type="button">
            去复盘并给区间打标签
          </button>
        )}
      </div>
    </div>
  );
}

function formatSignedPnl(value: number) {
  const abs = Math.abs(value).toLocaleString("zh-CN", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  });
  if (value > 0) return `+${abs}`;
  if (value < 0) return `−${abs}`;
  return abs;
}

function pnlTone(value: number) {
  if (value > 0) return "positive";
  if (value < 0) return "negative";
  return undefined;
}
