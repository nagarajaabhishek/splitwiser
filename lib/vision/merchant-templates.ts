type MerchantKey = "walmart" | "costco" | "target" | "kroger" | "unknown";

export type MerchantProfile = {
  merchantKey: MerchantKey;
  normalizedMerchantName: string;
  catalogProviderOrder: string[];
};

function norm(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

function includesAny(haystack: string, needles: string[]): boolean {
  return needles.some((needle) => haystack.includes(needle));
}

export function inferMerchantProfile(merchantName: string): MerchantProfile {
  const normalized = norm(merchantName);
  const walmart = includesAny(normalized, ["walmart", "wal-mart", "wm supercenter"]);
  const costco = includesAny(normalized, ["costco", "costco wholesale"]);
  const target = includesAny(normalized, ["target"]);
  const kroger = includesAny(normalized, ["kroger", "ralphs", "fred meyer", "king soopers"]);

  if (walmart) {
    return {
      merchantKey: "walmart",
      normalizedMerchantName: "Walmart",
      catalogProviderOrder: ["walmart", "openfoodfacts", "upcitemdb"],
    };
  }
  if (costco) {
    return {
      merchantKey: "costco",
      normalizedMerchantName: "Costco",
      catalogProviderOrder: ["openfoodfacts", "upcitemdb", "walmart"],
    };
  }
  if (target) {
    return {
      merchantKey: "target",
      normalizedMerchantName: "Target",
      catalogProviderOrder: ["openfoodfacts", "upcitemdb", "walmart"],
    };
  }
  if (kroger) {
    return {
      merchantKey: "kroger",
      normalizedMerchantName: "Kroger",
      catalogProviderOrder: ["openfoodfacts", "upcitemdb", "walmart"],
    };
  }
  return {
    merchantKey: "unknown",
    normalizedMerchantName: merchantName.trim() || "Unknown Merchant",
    catalogProviderOrder: ["openfoodfacts", "upcitemdb", "walmart"],
  };
}
