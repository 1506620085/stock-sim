import { API_BASE, apiFetch, apiJson, buildApiUrl } from "../../api/client";
import type { FeeSettings } from "../calculators/calculations";
import type { Instrument } from "../replay/types";

export type AdjustType = "none" | "qfq" | "hfq";
export type DataSource = "akshare" | "tushare";

export type AppPreferences = {
  adjustType: AdjustType;
  dataSource: DataSource;
  tushareToken: string;
};

export type FeeTemplate = {
  id: number;
  name: string;
  assetType: "stock" | "etf";
  commissionMode: "rate" | "fixed";
  commissionRate: number;
  fixedCommission: number;
  minCommission: number;
  stampTaxRate: number;
  transferRate: number;
  config: Record<string, unknown>;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

export type FeeTemplateInput = Omit<FeeTemplate, "id" | "createdAt" | "updatedAt" | "isDefault">;

export type DataQuality = {
  instrumentId: number;
  symbol: string;
  name: string;
  adjustType: AdjustType;
  source: string;
  totalRows: number;
  firstTradeDate: string | null;
  latestTradeDate: string | null;
  lastSyncedAt: string | null;
  missingWeekdays: string[];
  possibleSuspendedDates: string[];
};

export const defaultPreferences: AppPreferences = {
  adjustType: "qfq",
  dataSource: "akshare",
  tushareToken: "",
};

export function loadPreferences(): AppPreferences {
  try {
    const raw = localStorage.getItem("stock-sim.preferences");
    return raw ? { ...defaultPreferences, ...JSON.parse(raw) } : defaultPreferences;
  } catch {
    return defaultPreferences;
  }
}

export function savePreferences(preferences: AppPreferences) {
  localStorage.setItem("stock-sim.preferences", JSON.stringify(preferences));
}

export async function loadFeeTemplates(): Promise<FeeTemplate[]> {
  const items = await apiJson<Record<string, unknown>[]>(`${API_BASE}/api/settings/fee-templates`);
  return items.map(toFeeTemplate);
}

export async function createFeeTemplate(input: FeeTemplateInput): Promise<FeeTemplate> {
  const item = await apiJson<Record<string, unknown>>(`${API_BASE}/api/settings/fee-templates`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(toFeeTemplatePayload(input)),
  });
  return toFeeTemplate(item);
}

export async function updateFeeTemplate(id: number, input: FeeTemplateInput): Promise<FeeTemplate> {
  const item = await apiJson<Record<string, unknown>>(`${API_BASE}/api/settings/fee-templates/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(toFeeTemplatePayload(input)),
  });
  return toFeeTemplate(item);
}

export async function deleteFeeTemplate(id: number): Promise<void> {
  await apiFetch(`${API_BASE}/api/settings/fee-templates/${id}`, { method: "DELETE" });
}

export async function setDefaultFeeTemplate(id: number): Promise<FeeTemplate> {
  const item = await apiJson<Record<string, unknown>>(`${API_BASE}/api/settings/fee-templates/${id}/set-default`, {
    method: "POST",
  });
  return toFeeTemplate(item);
}

export async function loadInstruments(keyword = ""): Promise<Instrument[]> {
  const items = await apiJson<Record<string, unknown>[]>(
    buildApiUrl("/api/instruments", keyword.trim() ? { keyword: keyword.trim() } : undefined),
  );
  return items.map(toInstrument);
}

export async function loadDataQuality(instrumentId: number, adjustType: AdjustType): Promise<DataQuality> {
  return toDataQuality(
    await apiJson<Record<string, unknown>>(
      buildApiUrl("/api/settings/data-quality", {
        instrument_id: String(instrumentId),
        adjust: adjustType,
      }),
    ),
  );
}

export async function syncInstrument(instrumentId: number, adjustType: AdjustType): Promise<{ rows_fetched: number; rows_written: number; latest_trade_date: string | null }> {
  return apiJson(buildApiUrl(`/api/instruments/${instrumentId}/sync`, { adjust: adjustType }), { method: "POST" });
}

export function templateToFeeSettings(template: FeeTemplate): FeeSettings {
  return {
    assetType: template.assetType,
    commissionMode: template.commissionMode,
    commissionRate: template.commissionRate,
    fixedCommission: template.fixedCommission,
    minCommission: template.minCommission,
    stampTaxRate: template.stampTaxRate,
    transferRate: template.transferRate,
  };
}

export { feeTemplateLabel, formatFeeTemplateSummary, groupFeeTemplatesByAssetType, resolveFeeTemplate, sortFeeTemplates, toFeeSettingsFromTemplate } from "./feeTemplates";
export type { FeePreferences } from "./feeTemplates";
export { loadFeePreferences, saveFeePreferences } from "./feeTemplates";

function toFeeTemplate(item: Record<string, unknown>): FeeTemplate {
  return {
    id: Number(item.id),
    name: String(item.name ?? ""),
    assetType: item.asset_type === "etf" ? "etf" : "stock",
    commissionMode: configValue(item.config, "commissionMode") === "fixed" ? "fixed" : "rate",
    commissionRate: Number(item.commission_rate ?? 0),
    fixedCommission: Number(configValue(item.config, "fixedCommission") ?? 0),
    minCommission: Number(item.min_commission ?? 0),
    stampTaxRate: Number(item.stamp_tax_rate ?? 0),
    transferRate: Number(item.transfer_rate ?? 0),
    config: (item.config as Record<string, unknown>) ?? {},
    isDefault: Boolean(item.is_default),
    createdAt: String(item.created_at ?? ""),
    updatedAt: String(item.updated_at ?? ""),
  };
}

function toFeeTemplatePayload(input: FeeTemplateInput) {
  return {
    name: input.name,
    asset_type: input.assetType,
    commission_rate: input.commissionRate,
    min_commission: input.minCommission,
    stamp_tax_rate: input.stampTaxRate,
    transfer_rate: input.transferRate,
    config: {
      ...input.config,
      commissionMode: input.commissionMode,
      fixedCommission: input.fixedCommission,
    },
  };
}

function configValue(config: unknown, key: string) {
  return config && typeof config === "object" ? (config as Record<string, unknown>)[key] : undefined;
}

function toInstrument(item: Record<string, unknown>): Instrument {
  const exchange = String(item.exchange ?? "CN") as Instrument["exchange"];
  return {
    id: Number(item.id),
    code: String(item.code ?? ""),
    name: String(item.name ?? ""),
    type: item.asset_type === "etf" ? "ETF" : "股票",
    market: exchange === "SZ" ? "深证" : "上证",
    exchange,
    symbol: String(item.symbol ?? ""),
    assetType: item.asset_type === "etf" ? "etf" : "stock",
    source: "database",
    listDate: item.list_date ? String(item.list_date) : null,
    isActive: Boolean(item.is_active ?? true),
  };
}

function toDataQuality(item: Record<string, unknown>): DataQuality {
  return {
    instrumentId: Number(item.instrument_id),
    symbol: String(item.symbol ?? ""),
    name: String(item.name ?? ""),
    adjustType: String(item.adjust_type ?? "qfq") as AdjustType,
    source: String(item.source ?? "akshare"),
    totalRows: Number(item.total_rows ?? 0),
    firstTradeDate: item.first_trade_date ? String(item.first_trade_date) : null,
    latestTradeDate: item.latest_trade_date ? String(item.latest_trade_date) : null,
    lastSyncedAt: item.last_synced_at ? String(item.last_synced_at) : null,
    missingWeekdays: Array.isArray(item.missing_weekdays) ? item.missing_weekdays.map(String) : [],
    possibleSuspendedDates: Array.isArray(item.possible_suspended_dates) ? item.possible_suspended_dates.map(String) : [],
  };
}
