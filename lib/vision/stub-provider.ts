import type { VisionProvider } from "@/lib/vision/provider";
import { normalizeLabel } from "@/lib/engine/agent";
import type { NormalizedBillDraft } from "@/lib/schemas/bill";

function buildDraft(merchantName: string, rawItems: Array<{ label: string; cents: number }>, taxCents: number): NormalizedBillDraft {
  const items = rawItems.map((item, index) => ({
    id: `item-${index + 1}`,
    label: item.label,
    normalizedLabel: normalizeLabel(item.label),
    quantity: 1,
    unitPriceCents: item.cents,
    lineTotalCents: item.cents,
  }));
  const subtotalCents = items.reduce((sum, item) => sum + item.lineTotalCents, 0);
  return {
    merchantName,
    billDate: new Date().toISOString(),
    subtotalCents,
    taxCents,
    totalCents: subtotalCents + taxCents,
    items,
  };
}

export class StubVisionProvider implements VisionProvider {
  async extractBill(file: File): Promise<NormalizedBillDraft> {
    const lower = file.name.toLowerCase();

    if (lower.includes("grocer")) {
      return buildDraft(
        "Green Basket Grocer",
        [
          { label: "Almond Milk", cents: 549 },
          { label: "Eggs", cents: 399 },
          { label: "Sourdough Bread", cents: 699 },
          { label: "Avocado", cents: 299 },
        ],
        154,
      );
    }

    if (lower.includes("dinner") || lower.includes("restaurant")) {
      return buildDraft(
        "Moonlight Kitchen",
        [
          { label: "Spicy Udon", cents: 1499 },
          { label: "Miso Glaze Tofu", cents: 1299 },
          { label: "Yuzu Soda", cents: 499 },
        ],
        264,
      );
    }

    return buildDraft(
      "Demo Merchant",
      [
        { label: "Item A", cents: 899 },
        { label: "Item B", cents: 1299 },
        { label: "Item C", cents: 599 },
      ],
      251,
    );
  }
}
