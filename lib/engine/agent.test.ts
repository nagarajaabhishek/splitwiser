import test from "node:test";
import assert from "node:assert/strict";
import { runSplitAgentAutonomous } from "@/lib/engine/agent";
import { routeAISuggestions } from "@/lib/ai/router";

const members = [
  { id: "m1", name: "Alex" },
  { id: "m2", name: "Jamie" },
];

const draft = {
  merchantName: "Demo",
  billDate: new Date().toISOString(),
  subtotalCents: 1000,
  taxCents: 100,
  totalCents: 1100,
  items: [{ id: "i1", label: "Unknown Item", normalizedLabel: "unknown item", quantity: 1, unitPriceCents: 1000, lineTotalCents: 1000 }],
};

test("router falls back when providers unavailable", async () => {
  process.env.AI_PRIMARY_PROVIDER = "openai";
  process.env.AI_FALLBACK_PROVIDER = "gemini";
  process.env.OPENAI_API_KEY = "";
  process.env.GEMINI_API_KEY = "";

  const result = await routeAISuggestions({ draft, members });
  assert.equal(result.source, "fallback");
  assert.deepEqual(result.suggestions, []);
});

test("autonomous flow flags low-confidence items for review", async () => {
  process.env.AI_ENABLED = "false";
  process.env.AI_CONFIDENCE_THRESHOLD = "0.8";
  const result = await runSplitAgentAutonomous({
    draft,
    members,
    learnedDefaults: [],
  });

  assert.equal(result.proposals.length, 1);
  assert.equal(result.proposals[0].needsReview, true);
  assert.deepEqual(result.unresolvedReviewItemIds, ["i1"]);
});

test("confirmed review items clear unresolved queue", async () => {
  process.env.AI_ENABLED = "false";
  const result = await runSplitAgentAutonomous({
    draft,
    members,
    learnedDefaults: [],
    confirmedReviewItemIds: ["i1"],
  });

  assert.deepEqual(result.unresolvedReviewItemIds, []);
});

test("dietary conflict applies confidence penalty", async () => {
  process.env.AI_ENABLED = "false";
  process.env.AI_CONFIDENCE_THRESHOLD = "0.8";
  const dietaryMembers = [
    { id: "m1", name: "Alex", dietaryStyle: "vegetarian", allergies: [], exclusions: [] },
    { id: "m2", name: "Jamie", dietaryStyle: null, allergies: [], exclusions: [] },
  ];
  const meatDraft = {
    ...draft,
    items: [{ ...draft.items[0], label: "Chicken Wrap", normalizedLabel: "chicken wrap" }],
  };

  const result = await runSplitAgentAutonomous({
    draft: meatDraft,
    members: dietaryMembers,
    learnedDefaults: [{ memberId: "m1", normalizedLabel: "chicken wrap", confidence: 0.95, uses: 3 }],
  });

  assert.equal(result.proposals[0].confidence < 0.95, true);
  assert.equal(result.proposals[0].reason.includes("dietary mismatch"), true);
});
