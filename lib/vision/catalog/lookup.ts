import { lookupWalmartByUpc } from "@/lib/vision/catalog/walmart";
import { inferMerchantProfile } from "@/lib/vision/merchant-templates";

export type CatalogLookupResult = {
  name: string;
  provider: string;
  confidence: number;
  imageUrl?: string;
  upc?: string;
  gtin?: string;
  catalogItemId?: string;
};

export type CatalogLookupDiagnostics = {
  providerUsed?: string;
  attemptedProviders: string[];
  fallbackReason?: string;
  fallbackUsed: boolean;
  providerScorecard: Array<{ provider: string; latencyMs: number; hit: boolean; error?: string }>;
};

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

/**
 * Open Food Facts — free, no API key.
 * @see https://world.openfoodfacts.org/data
 */
async function lookupOpenFoodFacts(upc: string): Promise<CatalogLookupResult | null> {
  const url = `https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(upc)}.json`;
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) return null;
  const data = (await response.json()) as {
    status?: number;
    product?: { product_name?: string; product_name_en?: string; generic_name?: string };
  };
  if (data.status !== 1 || !data.product) return null;
  const name =
    data.product.product_name_en?.trim() ||
    data.product.product_name?.trim() ||
    data.product.generic_name?.trim() ||
    "";
  if (!name) return null;
  return { name, provider: "openfoodfacts", confidence: 0.92 };
}

/**
 * UPCitemdb — optional API key for higher limits; trial endpoint may work without key for dev.
 */
async function lookupUpcItemDb(upc: string): Promise<CatalogLookupResult | null> {
  const apiKey = process.env.UPCITEMDB_API_KEY;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (apiKey) {
    headers["user_key"] = apiKey;
  }
  const response = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(upc)}`, {
    headers,
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return null;
  const data = (await response.json()) as { code?: string; items?: Array<{ title?: string }> };
  if (data.code !== "OK" || !data.items?.length) return null;
  const title = data.items[0]?.title?.trim();
  if (!title) return null;
  return { name: title, provider: "upcitemdb", confidence: 0.88 };
}

async function lookupWalmart(upc: string): Promise<CatalogLookupResult | null> {
  const approved = (process.env.CATALOG_OFFICIAL_APIS_APPROVED ?? "false") === "true";
  if (!approved) return null;
  const enabled = (process.env.WALMART_CATALOG_ENABLED ?? "false") === "true";
  if (!enabled) return null;
  return lookupWalmartByUpc(upc);
}

type Provider = {
  name: string;
  run: (upc: string) => Promise<CatalogLookupResult | null>;
};

function allProviders(): Provider[] {
  return [
    { name: "walmart", run: lookupWalmart },
    { name: "openfoodfacts", run: lookupOpenFoodFacts },
    { name: "upcitemdb", run: lookupUpcItemDb },
  ];
}

/**
 * Try catalog providers in order until a product name is found.
 */
export async function lookupProductByUpc(rawUpc: string | null | undefined): Promise<CatalogLookupResult | null> {
  const detailed = await lookupProductByUpcDetailed(rawUpc, {});
  return detailed.result;
}

export async function lookupProductByUpcDetailed(
  rawUpc: string | null | undefined,
  options?: { merchantName?: string },
): Promise<{ result: CatalogLookupResult | null; diagnostics: CatalogLookupDiagnostics }> {
  const upc = digitsOnly(rawUpc ?? "");
  if (upc.length < 8) return { result: null, diagnostics: { attemptedProviders: [], fallbackUsed: false, providerScorecard: [] } };

  const attemptedProviders: string[] = [];
  const failures: string[] = [];
  const providerScorecard: Array<{ provider: string; latencyMs: number; hit: boolean; error?: string }> = [];
  const profile = inferMerchantProfile(options?.merchantName ?? "");
  const providersByName = new Map(allProviders().map((provider) => [provider.name, provider]));
  const chain = profile.catalogProviderOrder.map((name) => providersByName.get(name)).filter((entry): entry is Provider => Boolean(entry));

  for (const provider of chain) {
    attemptedProviders.push(provider.name);
    const started = Date.now();
    try {
      const result = await provider.run(upc);
      providerScorecard.push({ provider: provider.name, latencyMs: Date.now() - started, hit: Boolean(result) });
      if (result) {
        return {
          result,
          diagnostics: {
            providerUsed: result.provider,
            attemptedProviders,
            fallbackReason: failures.length > 0 ? failures.join("|") : undefined,
            fallbackUsed: failures.length > 0 || attemptedProviders.length > 1,
            providerScorecard,
          },
        };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${provider.name}:${message}`);
      providerScorecard.push({ provider: provider.name, latencyMs: Date.now() - started, hit: false, error: message });
    }
  }

  return {
    result: null,
    diagnostics: {
      attemptedProviders,
      fallbackReason: failures.length > 0 ? failures.join("|") : undefined,
      fallbackUsed: attemptedProviders.length > 1,
      providerScorecard,
    },
  };
}
