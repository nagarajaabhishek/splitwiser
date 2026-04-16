import assert from "node:assert/strict";
import test from "node:test";
import { lookupProductByUpcDetailed } from "@/lib/vision/catalog/lookup";

const originalFetch = globalThis.fetch;

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("lookupProductByUpcDetailed returns empty diagnostics for short UPC", async () => {
  const result = await lookupProductByUpcDetailed("123");
  assert.equal(result.result, null);
  assert.deepEqual(result.diagnostics.attemptedProviders, []);
});

test("lookupProductByUpcDetailed uses Walmart first when enabled", async () => {
  process.env.WALMART_CATALOG_ENABLED = "true";
  process.env.WALMART_CLIENT_ID = "demo-client";
  process.env.WALMART_CLIENT_SECRET = "demo-secret";
  process.env.WALMART_BASE_URL = "https://marketplace.walmartapis.com";

  let call = 0;
  globalThis.fetch = (async () => {
    call += 1;
    if (call === 1) return jsonResponse({ access_token: "token" });
    return jsonResponse({ items: [{ productName: "Walmart Bananas", usItemId: "1234", imageUrl: "https://img" }] });
  }) as typeof fetch;

  const result = await lookupProductByUpcDetailed("04100000123");
  assert.equal(result.result?.provider, "walmart");
  assert.equal(result.result?.name, "Walmart Bananas");
  assert.equal(result.diagnostics.providerUsed, "walmart");
  assert.deepEqual(result.diagnostics.attemptedProviders, ["walmart"]);
});

test("lookupProductByUpcDetailed falls back when Walmart fails", async () => {
  process.env.WALMART_CATALOG_ENABLED = "true";
  process.env.WALMART_CLIENT_ID = "demo-client";
  process.env.WALMART_CLIENT_SECRET = "demo-secret";
  process.env.WALMART_BASE_URL = "https://marketplace.walmartapis.com";

  let call = 0;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    call += 1;
    // 1) token ok, 2) walmart search fail, 3) openfoodfacts success
    if (call === 1) return jsonResponse({ access_token: "token" });
    if (call === 2) return jsonResponse({ error: "boom" }, 500);
    if (String(input).includes("openfoodfacts.org")) {
      return jsonResponse({ status: 1, product: { product_name_en: "Fallback Apples" } });
    }
    return jsonResponse({ code: "NOPE" }, 404);
  }) as typeof fetch;

  const result = await lookupProductByUpcDetailed("04100000123");
  assert.equal(result.result?.provider, "openfoodfacts");
  assert.equal(result.diagnostics.providerUsed, "openfoodfacts");
  assert.equal(result.diagnostics.attemptedProviders[0], "walmart");
  assert.match(result.diagnostics.fallbackReason ?? "", /walmart:/);
});

test.after(() => {
  globalThis.fetch = originalFetch;
});
