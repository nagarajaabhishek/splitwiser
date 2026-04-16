type WalmartTokenResponse = {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
};

type WalmartSearchItem = {
  usItemId?: string | number;
  itemId?: string | number;
  productName?: string;
  title?: string;
  imageUrl?: string;
  thumbnailUrl?: string;
  upc?: string;
  gtin?: string;
};

type WalmartSearchResponse = {
  items?: WalmartSearchItem[];
  results?: WalmartSearchItem[];
};

export type WalmartCatalogLookupResult = {
  name: string;
  provider: "walmart";
  confidence: number;
  imageUrl?: string;
  upc?: string;
  gtin?: string;
  catalogItemId?: string;
};

function basicAuth(value: string): string {
  return Buffer.from(value).toString("base64");
}

function env(key: string): string {
  return process.env[key]?.trim() ?? "";
}

function baseUrl(): string {
  return env("WALMART_BASE_URL") || "https://marketplace.walmartapis.com";
}

async function fetchWalmartAccessToken(signal: AbortSignal): Promise<string> {
  const clientId = env("WALMART_CLIENT_ID");
  const clientSecret = env("WALMART_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    throw new Error("WALMART_CREDENTIALS_MISSING");
  }

  const response = await fetch(`${baseUrl()}/v3/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth(`${clientId}:${clientSecret}`)}`,
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      "WM_SVC.NAME": env("WALMART_SERVICE_NAME") || "Walmart Marketplace",
    },
    body: "grant_type=client_credentials",
    signal,
  });
  if (!response.ok) {
    throw new Error(`WALMART_TOKEN_FAILED:${response.status}`);
  }
  const payload = (await response.json()) as WalmartTokenResponse;
  if (!payload.access_token) throw new Error("WALMART_TOKEN_EMPTY");
  return payload.access_token;
}

function firstItem(payload: WalmartSearchResponse): WalmartSearchItem | undefined {
  if (Array.isArray(payload.items) && payload.items.length > 0) return payload.items[0];
  if (Array.isArray(payload.results) && payload.results.length > 0) return payload.results[0];
  return undefined;
}

export async function lookupWalmartByUpc(upc: string): Promise<WalmartCatalogLookupResult | null> {
  const signal = AbortSignal.timeout(Number(env("WALMART_TIMEOUT_MS") || 8000));
  const token = await fetchWalmartAccessToken(signal);
  const response = await fetch(`${baseUrl()}/v3/items/walmart/search?upc=${encodeURIComponent(upc)}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      "WM_CONSUMER.ID": env("WALMART_CLIENT_ID"),
      "WM_MARKET": env("WALMART_MARKET") || "us",
    },
    signal,
  });
  if (!response.ok) {
    throw new Error(`WALMART_SEARCH_FAILED:${response.status}`);
  }
  const payload = (await response.json()) as WalmartSearchResponse;
  const item = firstItem(payload);
  if (!item) return null;

  const name = item.productName?.trim() || item.title?.trim() || "";
  if (!name) return null;
  return {
    name,
    provider: "walmart",
    confidence: 0.95,
    imageUrl: item.imageUrl || item.thumbnailUrl || undefined,
    upc: item.upc,
    gtin: item.gtin,
    catalogItemId: String(item.usItemId ?? item.itemId ?? ""),
  };
}
