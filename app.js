const instruments = [
  { code: "600519", name: "贵州茅台", type: "股票", market: "上证" },
  { code: "510300", name: "沪深300ETF", type: "ETF", market: "上证" },
  { code: "159915", name: "创业板ETF", type: "ETF", market: "深证" },
  { code: "000001", name: "平安银行", type: "股票", market: "深证" },
  { code: "513500", name: "标普500ETF", type: "ETF", market: "上证" },
];

const storeKey = "stock-replay-mvp-state";
const state = loadState();
const canvas = document.querySelector("#priceChart");
const ctx = canvas.getContext("2d");

let activeCode = state.activeCode || instruments[0].code;
let selectedIndex = 210;
let hoverIndex = null;
let chartLayout = null;

function loadState() {
  const fallback = {
    watchlist: ["600519", "510300"],
    activeCode: "600519",
    trades: {},
  };
  try {
    return { ...fallback, ...JSON.parse(localStorage.getItem(storeKey) || "{}") };
  } catch {
    return fallback;
  }
}

function saveState() {
  localStorage.setItem(
    storeKey,
    JSON.stringify({
      watchlist: state.watchlist,
      activeCode,
      trades: state.trades,
    }),
  );
}

function seededRandom(seed) {
  let value = seed % 2147483647;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

function generateBars(instrument) {
  const seed = instrument.code.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const rand = seededRandom(seed);
  const bars = [];
  let close = instrument.type === "ETF" ? 3 + rand() * 2 : 18 + rand() * 120;
  const date = new Date("2023-01-02T00:00:00");

  while (bars.length < 360) {
    const day = date.getDay();
    if (day !== 0 && day !== 6) {
      const trend = Math.sin(bars.length / 24) * 0.012 + Math.cos(bars.length / 51) * 0.008;
      const drift = (rand() - 0.48) * 0.045 + trend;
      const open = close * (1 + (rand() - 0.5) * 0.018);
      close = Math.max(0.5, open * (1 + drift));
      const high = Math.max(open, close) * (1 + rand() * 0.028);
      const low = Math.min(open, close) * (1 - rand() * 0.028);
      const volume = Math.round((instrument.type === "ETF" ? 1800000 : 600000) * (0.65 + rand()));
      bars.push({
        date: date.toISOString().slice(0, 10),
        open,
        high,
        low,
        close,
        volume,
      });
    }
    date.setDate(date.getDate() + 1);
  }
  return bars;
}

const marketData = Object.fromEntries(instruments.map((item) => [item.code, generateBars(item)]));

function movingAverage(values, period) {
  return values.map((_, index) => {
    if (index + 1 < period) return null;
    const slice = values.slice(index + 1 - period, index + 1);
    return slice.reduce((sum, value) => sum + value, 0) / period;
  });
}

function ema(values, period) {
  const k = 2 / (period + 1);
  let previous = values[0];
  return values.map((value, index) => {
    previous = index === 0 ? value : value * k + previous * (1 - k);
    return previous;
  });
}

function calculateIndicators(bars) {
  const closes = bars.map((bar) => bar.close);
  const highs = bars.map((bar) => bar.high);
  const lows = bars.map((bar) => bar.low);
  const maFast = Number(document.querySelector("#maFast").value || 5);
  const maMid = Number(document.querySelector("#maMid").value || 10);
  const maSlow = Number(document.querySelector("#maSlow").value || 20);
  const ma = {
    fast: movingAverage(closes, maFast),
    mid: movingAverage(closes, maMid),
    slow: movingAverage(closes, maSlow),
  };

  const bollMid = movingAverage(closes, maSlow);
  const boll = closes.map((_, index) => {
    if (index + 1 < maSlow) return null;
    const slice = closes.slice(index + 1 - maSlow, index + 1);
    const mid = bollMid[index];
    const variance = slice.reduce((sum, value) => sum + (value - mid) ** 2, 0) / maSlow;
    const std = Math.sqrt(variance);
    return { upper: mid + std * 2, mid, lower: mid - std * 2 };
  });

  const rsv = closes.map((close, index) => {
    const start = Math.max(0, index - 8);
    const high = Math.max(...highs.slice(start, index + 1));
    const low = Math.min(...lows.slice(start, index + 1));
    return high === low ? 50 : ((close - low) / (high - low)) * 100;
  });
  let kValue = 50;
  let dValue = 50;
  const kdj = rsv.map((value) => {
    kValue = (2 / 3) * kValue + (1 / 3) * value;
    dValue = (2 / 3) * dValue + (1 / 3) * kValue;
    return { k: kValue, d: dValue, j: 3 * kValue - 2 * dValue };
  });

  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const dif = closes.map((_, index) => ema12[index] - ema26[index]);
  const dea = ema(dif, 9);
  const macd = closes.map((_, index) => ({
    dif: dif[index],
    dea: dea[index],
    bar: (dif[index] - dea[index]) * 2,
  }));

  return { ma, boll, kdj, macd, maPeriods: [maFast, maMid, maSlow] };
}

function getActiveInstrument() {
  return instruments.find((item) => item.code === activeCode) || instruments[0];
}

function getVisibleBars() {
  const bars = marketData[activeCode];
  const hideFuture = document.querySelector("#hideFuture").checked;
  const end = hideFuture ? selectedIndex + 1 : bars.length;
  const start = Math.max(0, end - 160);
  return { bars: bars.slice(start, end), start, end };
}

function currency(value) {
  if (!Number.isFinite(value)) return "-";
  return value.toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function percent(value) {
  if (!Number.isFinite(value)) return "-";
  return `${value.toFixed(2)}%`;
}

function activeToggles() {
  return new Set(
    [...document.querySelectorAll(".indicator-toggle")]
      .filter((input) => input.checked)
      .map((input) => input.value),
  );
}

function replayTrades() {
  const trades = [...(state.trades[activeCode] || [])].sort((a, b) => a.index - b.index);
  let qty = 0;
  let cost = 0;
  let realized = 0;
  const lots = [];

  for (const trade of trades) {
    if (trade.side === "buy") {
      qty += trade.quantity;
      cost += trade.price * trade.quantity + trade.fee;
      lots.push({ quantity: trade.quantity, price: trade.price, fee: trade.fee });
    } else {
      let remaining = trade.quantity;
      let basis = 0;
      while (remaining > 0 && lots.length) {
        const lot = lots[0];
        const useQty = Math.min(remaining, lot.quantity);
        basis += lot.price * useQty + (lot.fee * useQty) / lot.quantity;
        lot.quantity -= useQty;
        remaining -= useQty;
        if (lot.quantity <= 0) lots.shift();
      }
      const sellQty = trade.quantity - remaining;
      qty -= sellQty;
      cost -= basis;
      realized += trade.price * sellQty - trade.fee - basis;
    }
  }

  return { trades, qty, cost, realized, avgCost: qty > 0 ? cost / qty : 0 };
}

function currentPain(position) {
  if (!position.qty) return { floating: 0, maxPain: 0, total: position.realized, pressure: 0 };
  const bars = marketData[activeCode];
  const current = bars[selectedIndex];
  const firstBuy = position.trades.find((trade) => trade.side === "buy");
  const lows = bars.slice(firstBuy.index, selectedIndex + 1).map((bar) => bar.low);
  const lowest = Math.min(...lows);
  const floating = (current.close - position.avgCost) * position.qty;
  const maxPain = (lowest - position.avgCost) * position.qty;
  const pressure = Math.min(100, Math.abs(Math.min(maxPain, 0)) / Math.max(position.cost, 1) * 100 * 4);
  return { floating, maxPain, total: position.realized + floating, pressure };
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  canvas.width = Math.floor(rect.width * scale);
  canvas.height = Math.floor(rect.height * scale);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
}

function drawLine(points, color, width = 1.5) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  let started = false;
  for (const point of points) {
    if (!point || !Number.isFinite(point.y)) continue;
    if (!started) {
      ctx.moveTo(point.x, point.y);
      started = true;
    } else {
      ctx.lineTo(point.x, point.y);
    }
  }
  ctx.stroke();
  ctx.restore();
}

function drawChart() {
  resizeCanvas();
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  ctx.clearRect(0, 0, width, height);

  const instrument = getActiveInstrument();
  const { bars, start, end } = getVisibleBars();
  const fullBars = marketData[activeCode];
  const indicators = calculateIndicators(fullBars);
  const toggles = activeToggles();
  const priceHeight = height * 0.55;
  const volumeHeight = toggles.has("volume") ? height * 0.14 : 0;
  const kdjHeight = toggles.has("kdj") ? height * 0.14 : 0;
  const macdHeight = toggles.has("macd") ? height * 0.15 : 0;
  const pad = { left: 58, right: 18, top: 20, bottom: 24 };
  const chartWidth = width - pad.left - pad.right;
  const candleWidth = Math.max(3, chartWidth / bars.length * 0.58);
  const xFor = (i) => pad.left + (i + 0.5) * (chartWidth / bars.length);
  const values = bars.flatMap((bar) => [bar.high, bar.low]);

  if (toggles.has("ma")) {
    for (const list of Object.values(indicators.ma)) {
      values.push(...list.slice(start, end).filter(Boolean));
    }
  }
  if (toggles.has("boll")) {
    for (const item of indicators.boll.slice(start, end)) {
      if (item) values.push(item.upper, item.lower);
    }
  }

  const minPrice = Math.min(...values);
  const maxPrice = Math.max(...values);
  const priceRange = maxPrice - minPrice || 1;
  const yPrice = (value) => pad.top + (maxPrice - value) / priceRange * (priceHeight - pad.top - 10);

  chartLayout = { start, end, bars, xFor, yPrice, pad, chartWidth, candleWidth };

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  drawGrid(width, height, pad.left);

  bars.forEach((bar, localIndex) => {
    const x = xFor(localIndex);
    const color = bar.close >= bar.open ? "#d83a31" : "#15845f";
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, yPrice(bar.high));
    ctx.lineTo(x, yPrice(bar.low));
    ctx.stroke();
    const yOpen = yPrice(bar.open);
    const yClose = yPrice(bar.close);
    ctx.fillRect(x - candleWidth / 2, Math.min(yOpen, yClose), candleWidth, Math.max(1, Math.abs(yClose - yOpen)));
  });

  if (toggles.has("boll")) {
    drawLine(indicators.boll.slice(start, end).map((item, i) => item && { x: xFor(i), y: yPrice(item.upper) }), "#8e63a9", 1);
    drawLine(indicators.boll.slice(start, end).map((item, i) => item && { x: xFor(i), y: yPrice(item.mid) }), "#a78b35", 1);
    drawLine(indicators.boll.slice(start, end).map((item, i) => item && { x: xFor(i), y: yPrice(item.lower) }), "#8e63a9", 1);
  }

  if (toggles.has("ma")) {
    const colors = ["#176c8f", "#c58b1c", "#5f6fa8"];
    Object.values(indicators.ma).forEach((line, lineIndex) => {
      drawLine(line.slice(start, end).map((value, i) => value && { x: xFor(i), y: yPrice(value) }), colors[lineIndex], 1.6);
    });
  }

  drawTradeMarkers(start, end);
  drawSelectedMarker();
  drawAxisLabels(minPrice, maxPrice, priceHeight, width);

  let offsetY = priceHeight + 12;
  if (toggles.has("volume")) {
    drawVolume(bars, xFor, offsetY, volumeHeight, candleWidth);
    offsetY += volumeHeight + 12;
  }
  if (toggles.has("kdj")) {
    drawOscillator(indicators.kdj.slice(start, end), xFor, offsetY, kdjHeight, ["k", "d", "j"], ["#176c8f", "#c58b1c", "#8e63a9"], "KDJ");
    offsetY += kdjHeight + 12;
  }
  if (toggles.has("macd")) {
    drawMacd(indicators.macd.slice(start, end), xFor, offsetY, macdHeight);
  }

  document.querySelector("#activeMeta").textContent = `${instrument.market} · ${instrument.type} · ${bars[0].date} 至 ${bars[bars.length - 1].date}`;
  document.querySelector("#activeTitle").textContent = `${instrument.code} ${instrument.name}`;
  document.querySelector("#dateRange").textContent = `当前复盘日：${fullBars[selectedIndex].date}`;
  document.querySelector("#selectedDate").textContent = fullBars[selectedIndex].date;
}

function drawGrid(width, height, left) {
  ctx.save();
  ctx.strokeStyle = "#edf1ee";
  ctx.lineWidth = 1;
  for (let i = 0; i < 8; i += 1) {
    const y = 24 + i * ((height - 56) / 7);
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(width - 18, y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawAxisLabels(min, max, priceHeight, width) {
  ctx.fillStyle = "#68736e";
  ctx.font = "12px Segoe UI";
  ctx.textAlign = "right";
  ctx.fillText(currency(max), width - 22, 28);
  ctx.fillText(currency((min + max) / 2), width - 22, priceHeight / 2);
  ctx.fillText(currency(min), width - 22, priceHeight - 12);
}

function drawVolume(bars, xFor, y, height, candleWidth) {
  const maxVolume = Math.max(...bars.map((bar) => bar.volume));
  ctx.fillStyle = "#68736e";
  ctx.fillText("成交量", 12, y + 12);
  bars.forEach((bar, i) => {
    const barHeight = (bar.volume / maxVolume) * (height - 22);
    ctx.fillStyle = bar.close >= bar.open ? "rgba(216,58,49,.55)" : "rgba(21,132,95,.55)";
    ctx.fillRect(xFor(i) - candleWidth / 2, y + height - barHeight, candleWidth, barHeight);
  });
}

function drawOscillator(values, xFor, y, height, keys, colors, label) {
  ctx.fillStyle = "#68736e";
  ctx.fillText(label, 12, y + 12);
  const all = values.flatMap((item) => keys.map((key) => item[key]));
  const min = Math.min(...all);
  const max = Math.max(...all);
  const toY = (value) => y + 16 + (max - value) / (max - min || 1) * (height - 24);
  keys.forEach((key, index) => {
    drawLine(values.map((item, i) => ({ x: xFor(i), y: toY(item[key]) })), colors[index], 1.2);
  });
}

function drawMacd(values, xFor, y, height) {
  ctx.fillStyle = "#68736e";
  ctx.fillText("MACD", 12, y + 12);
  const all = values.flatMap((item) => [item.dif, item.dea, item.bar]);
  const min = Math.min(...all);
  const max = Math.max(...all);
  const zero = y + 16 + (max - 0) / (max - min || 1) * (height - 24);
  const toY = (value) => y + 16 + (max - value) / (max - min || 1) * (height - 24);
  values.forEach((item, i) => {
    ctx.fillStyle = item.bar >= 0 ? "rgba(216,58,49,.65)" : "rgba(21,132,95,.65)";
    const barY = toY(item.bar);
    ctx.fillRect(xFor(i) - 2, Math.min(zero, barY), 4, Math.max(1, Math.abs(zero - barY)));
  });
  drawLine(values.map((item, i) => ({ x: xFor(i), y: toY(item.dif) })), "#176c8f", 1.2);
  drawLine(values.map((item, i) => ({ x: xFor(i), y: toY(item.dea) })), "#c58b1c", 1.2);
}

function drawTradeMarkers(start, end) {
  const trades = state.trades[activeCode] || [];
  for (const trade of trades) {
    if (trade.index < start || trade.index >= end) continue;
    const localIndex = trade.index - start;
    const x = chartLayout.xFor(localIndex);
    const y = chartLayout.yPrice(trade.price);
    ctx.save();
    ctx.fillStyle = trade.side === "buy" ? "#d83a31" : "#15845f";
    ctx.beginPath();
    if (trade.side === "buy") {
      ctx.moveTo(x, y - 14);
      ctx.lineTo(x - 7, y - 2);
      ctx.lineTo(x + 7, y - 2);
    } else {
      ctx.moveTo(x, y + 14);
      ctx.lineTo(x - 7, y + 2);
      ctx.lineTo(x + 7, y + 2);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillText(trade.side === "buy" ? "买" : "卖", x + 8, y);
    ctx.restore();
  }
}

function drawSelectedMarker() {
  if (!chartLayout || selectedIndex < chartLayout.start || selectedIndex >= chartLayout.end) return;
  const x = chartLayout.xFor(selectedIndex - chartLayout.start);
  ctx.save();
  ctx.strokeStyle = "#17201c";
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(x, 12);
  ctx.lineTo(x, canvas.clientHeight - 24);
  ctx.stroke();
  ctx.restore();
}

function renderWatchlist() {
  const list = document.querySelector("#watchList");
  const rows = state.watchlist.map((code) => instruments.find((item) => item.code === code)).filter(Boolean);
  document.querySelector("#watchCount").textContent = rows.length;
  list.innerHTML = rows
    .map(
      (item) => `
        <button class="stock-row ${item.code === activeCode ? "active" : ""}" data-code="${item.code}" type="button">
          <span><strong>${item.code} ${item.name}</strong><span>${item.market} · ${item.type}</span></span>
          <span>${marketData[item.code].length}根</span>
        </button>
      `,
    )
    .join("");
}

function renderSearch() {
  const query = document.querySelector("#stockSearch").value.trim().toLowerCase();
  const results = instruments.filter((item) => `${item.code}${item.name}${item.type}`.toLowerCase().includes(query)).slice(0, 5);
  document.querySelector("#searchResults").innerHTML = results
    .map(
      (item) => `
        <button class="stock-row" data-code="${item.code}" type="button">
          <span><strong>${item.code} ${item.name}</strong><span>${item.market} · ${item.type}</span></span>
          <span>${state.watchlist.includes(item.code) ? "已自选" : "可加入"}</span>
        </button>
      `,
    )
    .join("");
}

function renderStats() {
  const position = replayTrades();
  const pain = currentPain(position);
  setText("#positionQty", position.qty.toLocaleString("zh-CN"));
  setText("#avgCost", position.qty ? currency(position.avgCost) : "-");
  setText("#realizedPnl", currency(position.realized), position.realized);
  setText("#floatingPnl", currency(pain.floating), pain.floating);
  setText("#maxPain", currency(pain.maxPain), pain.maxPain);
  setText("#totalPnl", currency(pain.total), pain.total);
  document.querySelector("#painBar").style.width = `${pain.pressure}%`;
}

function setText(selector, text, value = null) {
  const node = document.querySelector(selector);
  node.textContent = text;
  node.classList.remove("positive", "negative");
  if (value > 0) node.classList.add("positive");
  if (value < 0) node.classList.add("negative");
}

function renderTrades() {
  const trades = [...(state.trades[activeCode] || [])].sort((a, b) => b.createdAt - a.createdAt);
  document.querySelector("#tradeCount").textContent = trades.length;
  document.querySelector("#tradeHistory").innerHTML = trades.length
    ? trades
        .map(
          (trade) => `
            <article class="trade-row ${trade.side}">
              <div>
                <strong>${trade.side === "buy" ? "买入" : "卖出"} ${trade.date}</strong>
                <span>${trade.side === "buy" ? "最高价" : "最低价"} ${currency(trade.price)}</span>
              </div>
              <p class="trade-note">${trade.note || "未填写笔记"}</p>
              <span>${trade.quantity.toLocaleString("zh-CN")} 份 · 费用 ${currency(trade.fee)}</span>
            </article>
          `,
        )
        .join("")
    : `<p class="hint">还没有交易记录。选择一根K线后记录买入或卖出。</p>`;
}

function renderAll() {
  const bars = marketData[activeCode];
  selectedIndex = Math.min(selectedIndex, bars.length - 1);
  renderWatchlist();
  renderSearch();
  drawChart();
  renderStats();
  renderTrades();
  saveState();
}

function addToWatchlist(code) {
  if (!state.watchlist.includes(code)) state.watchlist.push(code);
  activeCode = code;
  state.activeCode = code;
  selectedIndex = Math.min(210, marketData[activeCode].length - 1);
  renderAll();
}

document.querySelector("#stockSearch").addEventListener("input", renderSearch);
document.querySelector("#addWatchButton").addEventListener("click", () => {
  const query = document.querySelector("#stockSearch").value.trim().toLowerCase();
  const match = instruments.find((item) => item.code === query || item.name.toLowerCase().includes(query));
  if (match) addToWatchlist(match.code);
});

document.addEventListener("click", (event) => {
  const row = event.target.closest(".stock-row");
  if (!row) return;
  addToWatchlist(row.dataset.code);
});

document.querySelector("#resetIndicators").addEventListener("click", () => {
  document.querySelector("#maFast").value = 5;
  document.querySelector("#maMid").value = 10;
  document.querySelector("#maSlow").value = 20;
  renderAll();
});

document.querySelectorAll("#maFast,#maMid,#maSlow,.indicator-toggle,#hideFuture").forEach((node) => {
  node.addEventListener("change", renderAll);
});

document.querySelector("#prevDay").addEventListener("click", () => {
  selectedIndex = Math.max(0, selectedIndex - 1);
  renderAll();
});

document.querySelector("#nextDay").addEventListener("click", () => {
  selectedIndex = Math.min(marketData[activeCode].length - 1, selectedIndex + 1);
  renderAll();
});

document.querySelector("#tradeForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const side = document.querySelector("input[name='side']:checked").value;
  const quantity = Math.max(1, Number(document.querySelector("#quantity").value || 0));
  const fee = Math.max(0, Number(document.querySelector("#fee").value || 0));
  const bar = marketData[activeCode][selectedIndex];
  const trade = {
    side,
    quantity,
    fee,
    index: selectedIndex,
    date: bar.date,
    price: side === "buy" ? bar.high : bar.low,
    note: document.querySelector("#tradeNote").value.trim(),
    createdAt: Date.now(),
  };
  state.trades[activeCode] = [...(state.trades[activeCode] || []), trade];
  document.querySelector("#tradeNote").value = "";
  renderAll();
});

document.querySelector("#clearTrades").addEventListener("click", () => {
  state.trades[activeCode] = [];
  renderAll();
});

canvas.addEventListener("click", (event) => {
  if (!chartLayout) return;
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const localIndex = Math.round((x - chartLayout.pad.left) / (chartLayout.chartWidth / chartLayout.bars.length) - 0.5);
  if (localIndex < 0 || localIndex >= chartLayout.bars.length) return;
  selectedIndex = chartLayout.start + localIndex;
  renderAll();
});

canvas.addEventListener("mousemove", (event) => {
  if (!chartLayout) return;
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const localIndex = Math.round((x - chartLayout.pad.left) / (chartLayout.chartWidth / chartLayout.bars.length) - 0.5);
  if (localIndex < 0 || localIndex >= chartLayout.bars.length) return;
  hoverIndex = chartLayout.start + localIndex;
  const bar = marketData[activeCode][hoverIndex];
  const indicators = calculateIndicators(marketData[activeCode]);
  const kdj = indicators.kdj[hoverIndex];
  const macd = indicators.macd[hoverIndex];
  document.querySelector("#hoverInfo").textContent =
    `${bar.date} 开${currency(bar.open)} 高${currency(bar.high)} 低${currency(bar.low)} 收${currency(bar.close)} ` +
    `KDJ ${currency(kdj.k)}/${currency(kdj.d)}/${currency(kdj.j)} MACD ${currency(macd.bar)}`;
});

window.addEventListener("resize", drawChart);
renderAll();
