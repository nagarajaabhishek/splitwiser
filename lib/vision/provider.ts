import { normalizeLabel } from "@/lib/engine/agent";
import { normalizedBillDraftSchema, type NormalizedBillDraft } from "@/lib/schemas/bill";

export interface VisionProvider {
  extractBill(file: File): Promise<NormalizedBillDraft>;
}

export type VisionProviderName = "stub" | "gemini" | "openai";

export type ParsedVisionItem = {
  label: string;
  lineTotal: number;
  quantity?: number;
  /** Full line as printed on receipt when different from short label */
  rawLineText?: string;
  /** UPC/EAN digits if visible */
  upc?: string;
  /** Store SKU or internal item code if visible */
  itemCode?: string;
  /** Department/category code or name if visible */
  department?: string;
};

export type ParsedVisionDraft = {
  merchantName?: string;
  billDate?: string;
  subtotal?: number;
  tax?: number;
  total?: number;
  items: ParsedVisionItem[];
};

export function normalizeVisionDraft(input: ParsedVisionDraft): NormalizedBillDraft {
  const normalizedItems = input.items
    .map((item, index) => {
      const label = item.label.trim() || `Item ${index + 1}`;
      const lineTotalCents = Math.max(0, Math.round(item.lineTotal * 100));
      const quantity = Math.max(1, Math.round(item.quantity ?? 1));
      const unitPriceCents = Math.round(lineTotalCents / quantity);
      const rawLineText = item.rawLineText?.trim();
      const upc = item.upc?.trim() || undefined;
      const itemCode = item.itemCode?.trim() || undefined;
      const department = item.department?.trim() || undefined;
      return {
        id: `item-${index + 1}`,
        label,
        normalizedLabel: normalizeLabel(label),
        quantity,
        unitPriceCents,
        lineTotalCents,
        originalLabel: label,
        rawLineText: rawLineText || undefined,
        upc: upc ?? null,
        itemCode: itemCode ?? null,
        department: department ?? null,
        enrichment: {
          source: "none" as const,
          needsReview: false,
        },
      };
    })
    .filter((item) => item.lineTotalCents > 0);

  const uniqueItems = normalizedItems.filter(
    (item, index, arr) =>
      arr.findIndex((entry) => entry.label.toLowerCase() === item.label.toLowerCase() && entry.lineTotalCents === item.lineTotalCents) ===
      index,
  );

  // Use summed item totals as source of truth; model-reported subtotal/tax/total often drifts.
  const itemsSubtotalCents = uniqueItems.reduce((sum, item) => sum + item.lineTotalCents, 0);
  const reportedSubtotalCents = input.subtotal !== undefined ? Math.max(0, Math.round(input.subtotal * 100)) : itemsSubtotalCents;
  const subtotalCents = itemsSubtotalCents > 0 ? itemsSubtotalCents : reportedSubtotalCents;

  const reportedTaxCents = input.tax !== undefined ? Math.max(0, Math.round(input.tax * 100)) : 0;
  const reportedTotalCents = input.total !== undefined ? Math.max(0, Math.round(input.total * 100)) : subtotalCents + reportedTaxCents;
  let taxCents = reportedTaxCents;
  let totalCents = reportedTotalCents;

  // Reconcile to ensure strict schema consistency.
  if (totalCents < subtotalCents) {
    totalCents = subtotalCents + taxCents;
  }
  if (subtotalCents + taxCents !== totalCents) {
    taxCents = Math.max(0, totalCents - subtotalCents);
    totalCents = subtotalCents + taxCents;
  }

  return normalizedBillDraftSchema.parse({
    merchantName: input.merchantName?.trim() || "Unknown Merchant",
    billDate: input.billDate ? new Date(input.billDate).toISOString() : new Date().toISOString(),
    subtotalCents,
    taxCents,
    totalCents,
    items:
      uniqueItems.length > 0
        ? uniqueItems
        : [
            {
              id: "item-1",
              label: "Unknown item",
              normalizedLabel: "unknown item",
              quantity: 1,
              unitPriceCents: subtotalCents,
              lineTotalCents: subtotalCents,
              originalLabel: "Unknown item",
              enrichment: { source: "none" as const, needsReview: true, confidence: 0.3 },
            },
          ],
  });
}
