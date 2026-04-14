export type CatalogLookupResult = {
  name: string;
  provider: string;
  confidence: number;
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

/**
 * Try catalog providers in order until a product name is found.
 */
export async function lookupProductByUpc(rawUpc: string | null | undefined): Promise<CatalogLookupResult | null> {
  const upc = digitsOnly(rawUpc ?? "");
  if (upc.length < 8) return null;

  try {
    const off = await lookupOpenFoodFacts(upc);
    if (off) return off;
  } catch {
    // ignore network errors
  }

  try {
    const udb = await lookupUpcItemDb(upc);
    if (udb) return udb;
  } catch {
    // ignore
  }

  return null;
}
