import type { FeeSettings } from "../calculators/calculations";
import type { FeeTemplate } from "./api";

export type FeePreferences = {
  calculatorTemplateId?: number;
};

const FEE_PREFERENCES_KEY = "stock-sim.fee-preferences";

export function loadFeePreferences(): FeePreferences {
  try {
    const raw = localStorage.getItem(FEE_PREFERENCES_KEY);
    return raw ? (JSON.parse(raw) as FeePreferences) : {};
  } catch {
    return {};
  }
}

export function saveFeePreferences(preferences: FeePreferences) {
  localStorage.setItem(FEE_PREFERENCES_KEY, JSON.stringify(preferences));
}

export function formatFeeTemplateSummary(template: FeeTemplate) {
  const commission =
    template.commissionMode === "fixed"
      ? `固定 ${template.fixedCommission} 元`
      : `万${(template.commissionRate * 100).toFixed(2).replace(/\.?0+$/, "")} / 最低 ${template.minCommission} 元`;
  const stampTax = template.assetType === "stock" ? ` / 印花税 ${template.stampTaxRate}%` : "";
  return `${commission}${stampTax}`;
}

export function resolveFeeTemplate(
  templates: FeeTemplate[],
  assetType: "stock" | "etf",
  options: {
    sessionTemplateId?: number | null;
    preferredTemplateId?: number | null;
  } = {},
) {
  const candidates = templates.filter((template) => template.assetType === assetType);
  if (!candidates.length) return null;

  if (options.sessionTemplateId) {
    const sessionTemplate = candidates.find((template) => template.id === options.sessionTemplateId);
    if (sessionTemplate) return sessionTemplate;
  }

  if (options.preferredTemplateId) {
    const preferredTemplate = candidates.find((template) => template.id === options.preferredTemplateId);
    if (preferredTemplate) return preferredTemplate;
  }

  return candidates.find((template) => template.isDefault) ?? candidates[0] ?? null;
}

export function sortFeeTemplates(templates: FeeTemplate[]) {
  return [...templates].sort((left, right) => {
    if (left.assetType !== right.assetType) return left.assetType.localeCompare(right.assetType);
    if (left.isDefault !== right.isDefault) return left.isDefault ? -1 : 1;
    return left.name.localeCompare(right.name, "zh-CN");
  });
}

export function groupFeeTemplatesByAssetType(templates: FeeTemplate[]) {
  return {
    stock: sortFeeTemplates(templates.filter((template) => template.assetType === "stock")),
    etf: sortFeeTemplates(templates.filter((template) => template.assetType === "etf")),
  };
}

export function feeTemplateLabel(template: FeeTemplate) {
  return `${template.name}${template.isDefault ? "（默认）" : ""} · ${formatFeeTemplateSummary(template)}`;
}

export function toFeeSettingsFromTemplate(template: FeeTemplate): FeeSettings {
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
