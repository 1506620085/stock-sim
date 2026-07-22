/**
 * tradeExcel
 * 复盘买卖记录 / 区间复盘记录的 Excel 导入导出（ExcelJS，按需加载）。
 */
import type ExcelJS from "exceljs";
import type { Instrument, TradeRecord, TradeReview } from "./types";

export const REPLAY_EXCEL_VERSION = "stock-sim-replay-excel-v1";
export const TRADE_SHEET_NAME = "买卖记录";
export const REVIEW_SHEET_NAME = "复盘记录";
export const GUIDE_SHEET_NAME = "说明";

async function loadExcelJS() {
  const mod = await import("exceljs");
  return mod.default;
}

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFE8F1F4" },
};

const HEADER_FONT: Partial<ExcelJS.Font> = {
  bold: true,
  color: { argb: "FF176C8F" },
  size: 11,
};

const TRADE_HEADERS = [
  "成交ID",
  "日期",
  "方向",
  "价格",
  "数量",
  "手续费",
  "定价规则",
  "笔记",
] as const;

const REVIEW_HEADERS = [
  "复盘ID",
  "标题",
  "标签",
  "笔记",
  "起点成交ID",
  "终点成交ID",
  "投入",
  "收入",
  "费用",
  "盈亏",
  "收益率(%)",
  "最大浮亏",
  "起点日期",
  "终点日期",
  "指标快照JSON",
] as const;

export type ReplayExcelTrade = {
  exportId: number | null;
  tradeDate: string;
  side: "buy" | "sell";
  price: number;
  quantity: number;
  fee: number;
  priceRule: string;
  note: string | null;
};

export type ReplayExcelReview = {
  title: string;
  note: string | null;
  tags: string[];
  metricsSnapshot: Record<string, unknown>;
  startExportId: number | null;
  endExportId: number | null;
};

export type ReplayExcelPayload = {
  trades: ReplayExcelTrade[];
  reviews: ReplayExcelReview[];
};

function sideLabel(side: "buy" | "sell") {
  return side === "buy" ? "买入" : "卖出";
}

function parseSide(value: unknown): "buy" | "sell" {
  const text = String(value ?? "")
    .trim()
    .toLowerCase();
  if (text === "买入" || text === "buy") return "buy";
  if (text === "卖出" || text === "sell") return "sell";
  throw new Error(`无法识别方向「${String(value ?? "")}」，请填写买入或卖出`);
}

function toNumber(value: unknown, field: string): number {
  if (value == null || value === "") return 0;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value instanceof Date) throw new Error(`${field} 应为数字`);
  const parsed = Number(String(value).replace(/,/g, "").trim());
  if (!Number.isFinite(parsed)) throw new Error(`${field} 不是有效数字：${String(value)}`);
  return parsed;
}

function toOptionalInt(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.trunc(parsed);
}

function toDateText(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const text = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(text)) {
    const [y, m, d] = text.split("/");
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  // Excel serial date
  const serial = Number(text);
  if (Number.isFinite(serial) && serial > 20000 && serial < 80000) {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    epoch.setUTCDate(epoch.getUTCDate() + Math.floor(serial));
    const y = epoch.getUTCFullYear();
    const m = String(epoch.getUTCMonth() + 1).padStart(2, "0");
    const d = String(epoch.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  throw new Error(`日期格式无效：${String(value ?? "")}，请使用 YYYY-MM-DD`);
}

function styleHeaderRow(row: ExcelJS.Row, columnCount: number) {
  row.height = 22;
  for (let index = 1; index <= columnCount; index += 1) {
    const cell = row.getCell(index);
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { vertical: "middle", horizontal: "center" };
  }
}

function applyColumnWidths(sheet: ExcelJS.Worksheet, widths: number[]) {
  widths.forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });
}

function metricNumber(snapshot: Record<string, unknown>, key: string): number | "" {
  const value = snapshot[key];
  return typeof value === "number" && Number.isFinite(value) ? value : "";
}

function metricText(snapshot: Record<string, unknown>, key: string): string {
  const value = snapshot[key];
  return value == null ? "" : String(value);
}

export async function buildReplayExcelBlob(options: {
  instrument: Instrument;
  sessionId: number;
  trades: TradeRecord[];
  reviews: TradeReview[];
}): Promise<Blob> {
  const ExcelJS = await loadExcelJS();
  const { instrument, sessionId, trades, reviews } = options;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "stock-sim";
  workbook.created = new Date();

  const guide = workbook.addWorksheet(GUIDE_SHEET_NAME, {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  guide.addRow(["字段", "说明"]);
  styleHeaderRow(guide.getRow(1), 2);
  const guideRows: Array<[string, string]> = [
    ["模板版本", REPLAY_EXCEL_VERSION],
    ["适用范围", "当前复盘会话的买卖记录与区间复盘记录"],
    ["标的", `${instrument.code} ${instrument.name}`],
    ["会话ID", String(sessionId)],
    ["导出时间", new Date().toISOString()],
    ["日期格式", "YYYY-MM-DD，例如 2024-01-15"],
    ["方向取值", "买入 / 卖出"],
    ["导入行为", "默认覆盖当前会话已有买卖与复盘记录"],
    ["成交ID", "用于复盘记录关联起止成交；导入时按此映射新 ID"],
    ["性能提示", "请保持单表扁平结构，勿合并单元格"],
  ];
  guideRows.forEach((row) => guide.addRow(row));
  applyColumnWidths(guide, [16, 72]);

  const tradeSheet = workbook.addWorksheet(TRADE_SHEET_NAME, {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  tradeSheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: TRADE_HEADERS.length },
  };
  tradeSheet.addRow([...TRADE_HEADERS]);
  styleHeaderRow(tradeSheet.getRow(1), TRADE_HEADERS.length);

  const orderedTrades = [...trades].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return Number(a.id) - Number(b.id);
  });
  for (const trade of orderedTrades) {
    tradeSheet.addRow([
      Number(trade.id),
      trade.date,
      sideLabel(trade.side),
      trade.price,
      trade.quantity,
      trade.fee,
      trade.priceRule ?? "",
      trade.note ?? "",
    ]);
  }
  applyColumnWidths(tradeSheet, [10, 12, 8, 12, 12, 12, 14, 36]);
  tradeSheet.getColumn(4).numFmt = "0.0000";
  tradeSheet.getColumn(5).numFmt = "#,##0";
  tradeSheet.getColumn(6).numFmt = "0.00";

  const reviewSheet = workbook.addWorksheet(REVIEW_SHEET_NAME, {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  reviewSheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: REVIEW_HEADERS.length },
  };
  reviewSheet.addRow([...REVIEW_HEADERS]);
  styleHeaderRow(reviewSheet.getRow(1), REVIEW_HEADERS.length);

  for (const review of reviews) {
    const snapshot = review.metricsSnapshot ?? {};
    reviewSheet.addRow([
      review.id,
      review.title,
      (review.tags ?? []).join("、"),
      review.note ?? "",
      review.startTradeId ?? "",
      review.endTradeId ?? "",
      metricNumber(snapshot, "invested"),
      metricNumber(snapshot, "proceeds"),
      metricNumber(snapshot, "fee"),
      metricNumber(snapshot, "pnl"),
      metricNumber(snapshot, "pnlRate"),
      metricNumber(snapshot, "maxFloatingLoss"),
      metricText(snapshot, "startDate"),
      metricText(snapshot, "endDate"),
      JSON.stringify(snapshot),
    ]);
  }
  applyColumnWidths(reviewSheet, [10, 18, 18, 36, 12, 12, 12, 12, 10, 12, 12, 12, 12, 12, 28]);
  for (const column of [7, 8, 9, 10, 11, 12]) {
    reviewSheet.getColumn(column).numFmt = "0.00";
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer as ArrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function headerIndexMap(row: ExcelJS.Row): Map<string, number> {
  const map = new Map<string, number>();
  row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const key = String(cell.value ?? "").trim();
    if (key) map.set(key, colNumber);
  });
  return map;
}

function cellValue(row: ExcelJS.Row, map: Map<string, number>, header: string): unknown {
  const index = map.get(header);
  if (!index) return undefined;
  const cell = row.getCell(index);
  return cell.value;
}

function parseTags(value: unknown): string[] {
  const text = String(value ?? "").trim();
  if (!text) return [];
  return text
    .split(/[,，、|]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseMetricsSnapshot(row: ExcelJS.Row, map: Map<string, number>): Record<string, unknown> {
  const raw = cellValue(row, map, "指标快照JSON");
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      // fall through to column rebuild
    }
  }
  const snapshot: Record<string, unknown> = {};
  const invested = cellValue(row, map, "投入");
  const proceeds = cellValue(row, map, "收入");
  const fee = cellValue(row, map, "费用");
  const pnl = cellValue(row, map, "盈亏");
  const pnlRate = cellValue(row, map, "收益率(%)") ?? cellValue(row, map, "收益率");
  const maxFloatingLoss = cellValue(row, map, "最大浮亏");
  const startDate = cellValue(row, map, "起点日期");
  const endDate = cellValue(row, map, "终点日期");
  if (invested !== undefined && invested !== "") snapshot.invested = toNumber(invested, "投入");
  if (proceeds !== undefined && proceeds !== "") snapshot.proceeds = toNumber(proceeds, "收入");
  if (fee !== undefined && fee !== "") snapshot.fee = toNumber(fee, "费用");
  if (pnl !== undefined && pnl !== "") snapshot.pnl = toNumber(pnl, "盈亏");
  if (pnlRate !== undefined && pnlRate !== "") snapshot.pnlRate = toNumber(pnlRate, "收益率");
  if (maxFloatingLoss !== undefined && maxFloatingLoss !== "") {
    snapshot.maxFloatingLoss = toNumber(maxFloatingLoss, "最大浮亏");
  }
  if (startDate) snapshot.startDate = String(startDate);
  if (endDate) snapshot.endDate = String(endDate);
  return snapshot;
}

export async function parseReplayExcelFile(file: File): Promise<ReplayExcelPayload> {
  const ExcelJS = await loadExcelJS();
  const workbook = new ExcelJS.Workbook();
  const buffer = await file.arrayBuffer();
  await workbook.xlsx.load(buffer);

  const tradeSheet = workbook.getWorksheet(TRADE_SHEET_NAME);
  if (!tradeSheet) {
    throw new Error(`缺少工作表「${TRADE_SHEET_NAME}」`);
  }
  const tradeHeader = headerIndexMap(tradeSheet.getRow(1));
  for (const header of ["日期", "方向", "价格", "数量"] as const) {
    if (!tradeHeader.has(header)) {
      throw new Error(`买卖记录缺少必要列「${header}」`);
    }
  }

  const trades: ReplayExcelTrade[] = [];
  tradeSheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const dateRaw = cellValue(row, tradeHeader, "日期");
    const sideRaw = cellValue(row, tradeHeader, "方向");
    if ((dateRaw == null || dateRaw === "") && (sideRaw == null || sideRaw === "")) return;
    trades.push({
      exportId: toOptionalInt(cellValue(row, tradeHeader, "成交ID")),
      tradeDate: toDateText(dateRaw),
      side: parseSide(sideRaw),
      price: toNumber(cellValue(row, tradeHeader, "价格"), "价格"),
      quantity: toNumber(cellValue(row, tradeHeader, "数量"), "数量"),
      fee: toNumber(cellValue(row, tradeHeader, "手续费") ?? 0, "手续费"),
      priceRule: String(cellValue(row, tradeHeader, "定价规则") ?? "").trim() || "import",
      note: String(cellValue(row, tradeHeader, "笔记") ?? "").trim() || null,
    });
  });

  const reviews: ReplayExcelReview[] = [];
  const reviewSheet = workbook.getWorksheet(REVIEW_SHEET_NAME);
  if (reviewSheet) {
    const reviewHeader = headerIndexMap(reviewSheet.getRow(1));
    if (!reviewHeader.has("标题")) {
      throw new Error(`复盘记录缺少必要列「标题」`);
    }
    reviewSheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return;
      const title = String(cellValue(row, reviewHeader, "标题") ?? "").trim();
      if (!title) return;
      reviews.push({
        title,
        note: String(cellValue(row, reviewHeader, "笔记") ?? "").trim() || null,
        tags: parseTags(cellValue(row, reviewHeader, "标签")),
        metricsSnapshot: parseMetricsSnapshot(row, reviewHeader),
        startExportId: toOptionalInt(cellValue(row, reviewHeader, "起点成交ID")),
        endExportId: toOptionalInt(cellValue(row, reviewHeader, "终点成交ID")),
      });
    });
  }

  return { trades, reviews };
}

export function buildReplayExcelFilename(code: string) {
  const stamp = new Date().toISOString().slice(0, 10);
  return `复盘_${code}_${stamp}.xlsx`;
}
