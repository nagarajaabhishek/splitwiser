import { normalizeLabel } from "@/lib/engine/agent";
import { normalizedBillDraftSchema, type NormalizedBillDraft } from "@/lib/schemas/bill";
import { inferMerchantProfile } from "@/lib/vision/merchant-templates";

export interface VisionProvider {
  extractBill(
    file: File,
    options?: {
      retryMissingOnly?: boolean;
      knownLineHints?: string[];
    },
  ): Promise<NormalizedBillDraft>;
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
  itemsSoldCount?: number;
  items: ParsedVisionItem[];
};

export function normalizeVisionDraft(input: ParsedVisionDraft): NormalizedBillDraft {
  const merchantProfile = inferMerchantProfile(input.merchantName ?? "");
  const rawItems = input.items
    .map((item, index) => {
      const label = item.label.trim() || `Item ${index + 1}`;
      const quantity = Math.max(1, Math.round(item.quantity ?? 1));
      const lineTotalCentsRaw = Math.max(0, Math.round(item.lineTotal * 100));
      const rawLineText = item.rawLineText?.trim();
      const upc = item.upc?.trim() || undefined;
      const itemCode = item.itemCode?.trim() || undefined;
      const department = item.department?.trim() || undefined;
      return {
        id: `item-${index + 1}`,
        label,
        normalizedLabel: normalizeLabel(label),
        quantity,
        lineTotalCentsRaw,
        originalLabel: label,
        rawLineText: rawLineText || undefined,
        upc: upc ?? null,
        itemCode: itemCode ?? null,
        department: department ?? null,
      };
    })
    .filter((item) => item.lineTotalCentsRaw > 0);

  const reportedSubtotalCents = input.subtotal !== undefined ? Math.max(0, Math.round(input.subtotal * 100)) : undefined;
  const reportedTaxCents = input.tax !== undefined ? Math.max(0, Math.round(input.tax * 100)) : 0;
  const reportedTotalCents = input.total !== undefined ? Math.max(0, Math.round(input.total * 100)) : undefined;
  const expectedSubtotalCents =
    reportedSubtotalCents ?? (reportedTotalCents !== undefined ? Math.max(0, reportedTotalCents - reportedTaxCents) : undefined);

  const itemsSubtotalAssumingLineTotal = rawItems.reduce((sum, item) => sum + item.lineTotalCentsRaw, 0);
  const itemsSubtotalAssumingUnitPrice =
    rawItems.reduce((sum, item) => sum + (item.quantity > 1 ? item.lineTotalCentsRaw * item.quantity : item.lineTotalCentsRaw), 0);

  const deltaAssumingLineTotal =
    expectedSubtotalCents !== undefined ? Math.abs(itemsSubtotalAssumingLineTotal - expectedSubtotalCents) : 0;
  const deltaAssumingUnitPrice =
    expectedSubtotalCents !== undefined ? Math.abs(itemsSubtotalAssumingUnitPrice - expectedSubtotalCents) : 0;

  const treatLineTotalAsUnitPrice =
    expectedSubtotalCents !== undefined &&
    itemsSubtotalAssumingUnitPrice > 0 &&
    deltaAssumingUnitPrice + 50 < deltaAssumingLineTotal;

  const normalizedItems = rawItems.map((item) => {
    const lineTotalCents = treatLineTotalAsUnitPrice && item.quantity > 1 ? item.lineTotalCentsRaw * item.quantity : item.lineTotalCentsRaw;
    const unitPriceCents = Math.round(lineTotalCents / item.quantity);
    return {
      id: item.id,
      label: item.label,
      normalizedLabel: item.normalizedLabel,
      quantity: item.quantity,
      unitPriceCents,
      lineTotalCents,
      originalLabel: item.originalLabel,
      rawLineText: item.rawLineText,
      upc: item.upc,
      itemCode: item.itemCode,
      department: item.department,
      enrichment: {
        source: "none" as const,
        needsReview: false,
      },
    };
  });

  // Keep repeated lines as-is. Identical label+price rows can be legitimate multi-buys.
  const itemsSubtotalCents = normalizedItems.reduce((sum, item) => sum + item.lineTotalCents, 0);

  let subtotalCents =
    itemsSubtotalCents > 0
      ? itemsSubtotalCents
      : reportedSubtotalCents ??
        (reportedTotalCents !== undefined ? Math.max(0, reportedTotalCents - reportedTaxCents) : itemsSubtotalCents);
  if (subtotalCents === 0 && itemsSubtotalCents > 0) subtotalCents = itemsSubtotalCents;

  const totalFromParts = subtotalCents + reportedTaxCents;
  const totalSeed = reportedTotalCents ?? totalFromParts;
  const reportedTotalFloor = Math.max(totalSeed, subtotalCents);
  let taxCents = reportedTaxCents;
  let totalCents = reportedTotalFloor;

  // Reconcile to ensure strict schema consistency.
  if (totalCents < subtotalCents) {
    totalCents = subtotalCents + taxCents;
  }
  if (subtotalCents + taxCents !== totalCents) {
    taxCents = Math.max(0, totalCents - subtotalCents);
    totalCents = subtotalCents + taxCents;
  }

  return normalizedBillDraftSchema.parse({
    merchantName: merchantProfile.normalizedMerchantName || input.merchantName?.trim() || "Unknown Merchant",
    billDate: input.billDate ? new Date(input.billDate).toISOString() : new Date().toISOString(),
    subtotalCents,
    taxCents,
    totalCents,
    receiptItemCount:
      input.itemsSoldCount !== undefined && Number.isFinite(input.itemsSoldCount)
        ? Math.max(1, Math.round(input.itemsSoldCount))
        : undefined,
    items:
      normalizedItems.length > 0
        ? normalizedItems
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
