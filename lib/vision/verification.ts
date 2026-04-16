import type { NormalizedBillDraft } from "@/lib/schemas/bill";

export type ParseVerificationDiagnostics = {
  itemCount: number;
  receiptItemCount?: number;
  itemCountDelta: number;
  duplicateLineGroups: number;
  duplicateLineExamples: string[];
  subtotalFromItemsCents: number;
  subtotalDeltaCents: number;
  quantityAnomalyCount: number;
  severity: "none" | "soft" | "hard";
  hardReviewRequired: boolean;
  needsReview: boolean;
  reasons: string[];
};

const SUBTOTAL_DELTA_REVIEW_CENTS = 50;
const SUBTOTAL_DELTA_HARD_CENTS = 200;
const ITEM_COUNT_HARD_DELTA = 2;

function countQuantityAnomalies(draft: NormalizedBillDraft): number {
  return draft.items.filter((item) => {
    if (item.quantity <= 1) return false;
    if (item.lineTotalCents < item.quantity) return true;
    const unit = item.lineTotalCents / item.quantity;
    return unit < 5;
  }).length;
}

export function verifyParsedDraft(draft: NormalizedBillDraft): { draft: NormalizedBillDraft; diagnostics: ParseVerificationDiagnostics } {
  const subtotalFromItemsCents = draft.items.reduce((sum, item) => sum + item.lineTotalCents, 0);
  const subtotalDeltaCents = Math.abs(subtotalFromItemsCents - draft.subtotalCents);
  const receiptItemCount = draft.receiptItemCount;
  const itemCountDelta = receiptItemCount ? Math.max(0, receiptItemCount - draft.items.length) : 0;
  const quantityAnomalyCount = countQuantityAnomalies(draft);

  const duplicateMap = new Map<string, number>();
  for (const item of draft.items) {
    const key = `${item.normalizedLabel}|${item.lineTotalCents}`;
    duplicateMap.set(key, (duplicateMap.get(key) ?? 0) + 1);
  }
  const duplicateEntries = [...duplicateMap.entries()].filter(([, count]) => count > 1);
  const duplicateLineGroups = duplicateEntries.length;
  const duplicateLineExamples = duplicateEntries.slice(0, 3).map(([key, count]) => {
    const [label, cents] = key.split("|");
    return `${label} x${count} @ $${(Number(cents) / 100).toFixed(2)}`;
  });

  const reasons: string[] = [];
  if (subtotalDeltaCents >= SUBTOTAL_DELTA_REVIEW_CENTS) {
    reasons.push(
      `Item subtotal differs from receipt subtotal by $${(subtotalDeltaCents / 100).toFixed(2)}. Some items may be missing or mis-read.`,
    );
  }
  if (itemCountDelta >= 1) {
    reasons.push(`Receipt indicates ${receiptItemCount} items sold, but ${draft.items.length} were parsed.`);
  }
  if (quantityAnomalyCount > 0) {
    reasons.push("Some multi-quantity lines look suspicious. Verify quantity and unit/line totals.");
  }
  if (duplicateLineGroups > 0) {
    reasons.push(
      "Receipt contains repeated identical lines. Verify quantity/duplicates before finalizing.",
    );
  }

  const hardReviewRequired =
    subtotalDeltaCents >= SUBTOTAL_DELTA_HARD_CENTS ||
    itemCountDelta >= ITEM_COUNT_HARD_DELTA ||
    quantityAnomalyCount >= 2;
  const severity: "none" | "soft" | "hard" = reasons.length === 0 ? "none" : hardReviewRequired ? "hard" : "soft";
  const needsReview = reasons.length > 0;
  if (!needsReview) {
    return {
      draft,
      diagnostics: {
        itemCount: draft.items.length,
        receiptItemCount,
        itemCountDelta,
        duplicateLineGroups,
        duplicateLineExamples,
        subtotalFromItemsCents,
        subtotalDeltaCents,
        quantityAnomalyCount,
        severity,
        hardReviewRequired,
        needsReview: false,
        reasons: [],
      },
    };
  }

  return {
    draft: {
      ...draft,
      items: draft.items.map((item) => ({
        ...item,
        enrichment: {
          ...(item.enrichment ?? { source: "none" as const }),
          needsReview: true,
          confidence: item.enrichment?.confidence ?? 0.45,
          suggestedLabel: item.enrichment?.suggestedLabel ?? item.label,
        },
      })),
    },
    diagnostics: {
      itemCount: draft.items.length,
      receiptItemCount,
      itemCountDelta,
      duplicateLineGroups,
      duplicateLineExamples,
      subtotalFromItemsCents,
      subtotalDeltaCents,
      quantityAnomalyCount,
      severity,
      hardReviewRequired,
      needsReview,
      reasons,
    },
  };
}
