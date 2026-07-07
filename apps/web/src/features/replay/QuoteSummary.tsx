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
    { label: "今开", value: formatQuotePrice(quote.open) },
    { label: "最高", value: formatQuotePrice(quote.high) },
    { label: "最低", value: formatQuotePrice(quote.low) },
    { label: "换手率", value: formatTurnoverRate(quote.turnoverRate) },
    { label: "总手", value: formatCompactNumber(quote.volume, "手") },
    { label: "成交额", value: formatCompactNumber(quote.amount) },
    { label: "总市值", value: formatCompactNumber(quote.marketCap) },
    { label: "流通市值", value: formatCompactNumber(quote.floatMarketCap) },
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
    </section>
  );
}
