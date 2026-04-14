import test from "node:test";
import assert from "node:assert/strict";
import { extractWithVisionRouter } from "@/lib/vision/router";
import { normalizeVisionDraft } from "@/lib/vision/provider";

function fakeFile(name: string, type: string) {
  return new File([new Uint8Array([1, 2, 3])], name, { type });
}

test("stub mode returns deterministic draft", async () => {
  process.env.VISION_PROVIDER_MODE = "stub";
  const result = await extractWithVisionRouter(fakeFile("grocer-receipt.png", "image/png"));
  assert.equal(result.providerUsed, "stub");
  assert.equal(result.draft.items.length > 0, true);
});

test("router mode throws when both providers fail", async () => {
  process.env.VISION_PROVIDER_MODE = "router";
  process.env.VISION_PRIMARY_PROVIDER = "gemini";
  process.env.VISION_FALLBACK_PROVIDER = "openai";
  process.env.GEMINI_API_KEY = "";
  process.env.OPENAI_API_KEY = "";

  await assert.rejects(async () => {
    await extractWithVisionRouter(fakeFile("receipt.png", "image/png"));
  });
});

test("normalizeVisionDraft coerces and deduplicates items", () => {
  const draft = normalizeVisionDraft({
    merchantName: "",
    items: [
      { label: "Tea", lineTotal: 2.5, quantity: 1 },
      { label: "Tea", lineTotal: 2.5, quantity: 1 },
      { label: "", lineTotal: 1.0 },
    ],
    tax: 0.3,
  });

  assert.equal(draft.merchantName, "Unknown Merchant");
  assert.equal(draft.items.length, 2);
  assert.equal(draft.totalCents, draft.subtotalCents + draft.taxCents);
});
