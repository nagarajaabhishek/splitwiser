import test from "node:test";
import assert from "node:assert/strict";
import { computeSettlements } from "@/lib/engine/settlement";

test("computes minimal transfers for balanced group", () => {
  const transfers = computeSettlements([
    { memberId: "a", memberName: "Alex", balanceCents: -700 },
    { memberId: "b", memberName: "Jamie", balanceCents: 500 },
    { memberId: "c", memberName: "Sam", balanceCents: 200 },
  ]);

  assert.equal(transfers.length, 2);
  assert.equal(transfers.reduce((sum, transfer) => sum + transfer.amountCents, 0), 700);
});

test("returns empty when no settlement needed", () => {
  const transfers = computeSettlements([
    { memberId: "a", memberName: "Alex", balanceCents: 0 },
    { memberId: "b", memberName: "Jamie", balanceCents: 0 },
  ]);
  assert.deepEqual(transfers, []);
});
