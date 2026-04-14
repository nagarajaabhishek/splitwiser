import test from "node:test";
import assert from "node:assert/strict";
import { calculateMemberTotals } from "@/lib/engine/calculator";

const members = [
  { id: "m1", name: "Alex" },
  { id: "m2", name: "Jamie" },
  { id: "m3", name: "Sam" },
];

test("reconciles totals exactly to expected bill amount", () => {
  const result = calculateMemberTotals({
    items: [
      { id: "i1", label: "A", normalizedLabel: "a", quantity: 1, unitPriceCents: 1001, lineTotalCents: 1001 },
      { id: "i2", label: "B", normalizedLabel: "b", quantity: 1, unitPriceCents: 2002, lineTotalCents: 2002 },
    ],
    assignments: [
      { itemId: "i1", memberIds: ["m1"] },
      { itemId: "i2", memberIds: ["m2", "m3"] },
    ],
    members,
    taxCents: 333,
    expectedTotalCents: 3336,
  });

  assert.equal(result.totalCents, 3336);
  assert.equal(result.memberTotals.reduce((sum, m) => sum + m.totalCents, 0), 3336);
});

test("allocates zero tax without drift", () => {
  const result = calculateMemberTotals({
    items: [
      { id: "i1", label: "A", normalizedLabel: "a", quantity: 1, unitPriceCents: 500, lineTotalCents: 500 },
      { id: "i2", label: "B", normalizedLabel: "b", quantity: 1, unitPriceCents: 500, lineTotalCents: 500 },
    ],
    assignments: [
      { itemId: "i1", memberIds: ["m1"] },
      { itemId: "i2", memberIds: ["m2"] },
    ],
    members: members.slice(0, 2),
    taxCents: 0,
    expectedTotalCents: 1000,
  });

  assert.deepEqual(
    result.memberTotals.map((entry) => entry.taxCents),
    [0, 0],
  );
  assert.equal(result.totalCents, 1000);
});

test("handles equal split remainder correctly", () => {
  const result = calculateMemberTotals({
    items: [{ id: "i1", label: "Shared", normalizedLabel: "shared", quantity: 1, unitPriceCents: 1001, lineTotalCents: 1001 }],
    assignments: [{ itemId: "i1", memberIds: ["m1", "m2", "m3"], mode: "equal" }],
    members,
    taxCents: 0,
    expectedTotalCents: 1001,
  });

  const totals = result.memberTotals.map((entry) => entry.subtotalCents).sort((a, b) => b - a);
  assert.deepEqual(totals, [334, 334, 333]);
});

test("handles custom weighted split and tax reconciliation", () => {
  const result = calculateMemberTotals({
    items: [
      { id: "i1", label: "Large", normalizedLabel: "large", quantity: 1, unitPriceCents: 2000, lineTotalCents: 2000 },
      { id: "i2", label: "Solo", normalizedLabel: "solo", quantity: 1, unitPriceCents: 500, lineTotalCents: 500 },
    ],
    assignments: [
      {
        itemId: "i1",
        memberIds: ["m1", "m2"],
        mode: "custom",
        memberWeights: [
          { memberId: "m1", weight: 80 },
          { memberId: "m2", weight: 20 },
        ],
      },
      { itemId: "i2", memberIds: ["m3"], mode: "single" },
    ],
    members,
    taxCents: 125,
    expectedTotalCents: 2625,
  });

  assert.equal(result.totalCents, 2625);
  assert.equal(result.memberTotals.reduce((sum, entry) => sum + entry.totalCents, 0), 2625);
  const m1 = result.memberTotals.find((entry) => entry.memberId === "m1");
  const m2 = result.memberTotals.find((entry) => entry.memberId === "m2");
  assert.ok((m1?.subtotalCents ?? 0) > (m2?.subtotalCents ?? 0));
});
