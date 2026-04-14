import test from "node:test";
import assert from "node:assert/strict";
import { applyCategorizationToDraft, inferProductCategory } from "@/lib/categorization/infer";
import type { NormalizedBillDraft, NormalizedBillItem } from "@/lib/schemas/bill";

const baseItem = (overrides: Partial<NormalizedBillItem>): NormalizedBillItem => ({
  id: "i1",
  label: "Item",
  normalizedLabel: "item",
  quantity: 1,
  unitPriceCents: 100,
  lineTotalCents: 100,
  ...overrides,
});

test("inferProductCategory uses department when present", () => {
  const r = inferProductCategory(
    baseItem({
      label: "Milk",
      normalizedLabel: "milk",
      department: "DAIRY",
    }),
  );
  assert.equal(r.category, "Dairy & Eggs");
  assert.equal(r.source, "department");
});

test("inferProductCategory uses keywords for produce", () => {
  const r = inferProductCategory(
    baseItem({
      label: "Bananas",
      normalizedLabel: "bananas",
    }),
  );
  assert.equal(r.category, "Produce");
});

test("applyCategorizationToDraft sets expense and product categories", () => {
  const draft: NormalizedBillDraft = {
    merchantName: "Starbucks Coffee",
    billDate: new Date().toISOString(),
    currency: "USD",
    subtotalCents: 500,
    taxCents: 50,
    totalCents: 550,
    items: [
      baseItem({ id: "a", label: "Latte", normalizedLabel: "latte", lineTotalCents: 550, unitPriceCents: 550 }),
    ],
  };
  const out = applyCategorizationToDraft(draft);
  assert.ok(out.expenseCategory);
  assert.ok(out.items[0]?.productCategory);
});
