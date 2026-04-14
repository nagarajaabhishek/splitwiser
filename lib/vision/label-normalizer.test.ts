import test from "node:test";
import assert from "node:assert/strict";
import { normalizeLabel } from "@/lib/engine/agent";
import { heuristicNormalizeProductLabel, normalizeDraftLabels } from "@/lib/vision/label-normalizer";
import type { NormalizedBillDraft } from "@/lib/schemas/bill";

test("heuristic normalizer expands common receipt abbreviations", () => {
  assert.equal(heuristicNormalizeProductLabel("BNLS CK BRS"), "Boneless Chicken Breast");
  assert.equal(heuristicNormalizeProductLabel("GV ASPARTAM"), "Great Value Aspartame");
});

test("normalizeDraftLabels applies heuristics when AI disabled", async () => {
  process.env.VISION_LABEL_AI_ENABLED = "false";

  const draft: NormalizedBillDraft = {
    merchantName: "Demo",
    billDate: new Date().toISOString(),
    currency: "USD",
    subtotalCents: 500,
    taxCents: 50,
    totalCents: 550,
    items: [
      {
        id: "item-1",
        label: "BNLS CK BRS",
        normalizedLabel: normalizeLabel("BNLS CK BRS"),
        quantity: 1,
        unitPriceCents: 500,
        lineTotalCents: 500,
      },
    ],
  };

  const result = await normalizeDraftLabels(draft);
  assert.equal(result.diagnostics.providerUsed, "heuristic");
  assert.equal(result.diagnostics.replacedCount, 1);
  assert.equal(result.draft.items[0].label, "Boneless Chicken Breast");
});
