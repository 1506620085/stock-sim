import { FieldHelpTip } from "../../components/FieldHelpTip";
import {
  buildMarketQuote,
  formatCompactNumber,
  formatQuoteChange,
  formatQuotePercent,
  formatQuotePrice,
  formatTurnoverRate,
  type QuoteDirection,
} from "./marketQuote";
import type { KLineBar } from "./types";

type Props = {
  bars: KLineBar[];
  barIndex: number;
};

const directionClass: Record<QuoteDirection, string> = {
  up: "quote-up",
  down: "quote-down",
  flat: "quote-flat",
};

export function QuoteSummary({ bars, barIndex }: Props) {
  const quote = buildMarketQuote(bars, barIndex);
  if (!quote) return null;

  const metrics = [
    { label: "最高", value: formatQuotePrice(quote.high) },
    { label: "今开", value: formatQuotePrice(quote.open) },
    { label: "换手率", value: formatTurnoverRate(quote.turnoverRate) },
    { label: "最低", value: formatQuotePrice(quote.low) },
    { label: "总手", value: formatCompactNumber(quote.volume, "手") },
    { label: "成交额", value: formatCompactNumber(quote.amount) },
  ];

  return (
    <section aria-label="行情摘要" className="quote-summary">
      <div className="quote-summary-price-block">
        <strong className={`quote-summary-price ${directionClass[quote.direction]}`}>{formatQuotePrice(quote.price)}</strong>
        <div className={`quote-summary-change ${directionClass[quote.direction]}`}>
          <span>{formatQuoteChange(quote.change)}</span>
          <span>{formatQuotePercent(quote.changePercent)}</span>
        </div>
      </div>

      <div className="quote-summary-grid">
        {metrics.map((metric) => (
          <div className="quote-summary-metric" key={metric.label}>
            <span className="quote-summary-label">{metric.label}</span>
            <span className="quote-summary-value">{metric.value}</span>
          </div>
        ))}
      </div>

      <div className="quote-summary-help">
        <FieldHelpTip
          aria-label="买卖点标记说明"
          mode="click"
          placement="top-left"
          size={15}
          tip={
            <div className="marker-legend">
              <p className="marker-legend-title">K 线标记说明</p>
              <div className="marker-legend-row">
                <span className="trade-marker-tag buy">B</span>
                <span>买入标记，红色，显示在对应 K 线下方</span>
              </div>
              <div className="marker-legend-row">
                <span className="trade-marker-tag sell">S</span>
                <span>卖出标记，蓝色，显示在对应 K 线上方</span>
              </div>
              <div className="marker-legend-row">
                <span className="trade-marker-tag pain">L</span>
                <span>最差低点，青色，标记持仓期间最低价</span>
              </div>
            </div>
          }
        />
      </div>
    </section>
  );
}
