import type { NormalizedBillDraft } from "@/lib/schemas/bill";

export interface VisionProvider {
  extractBill(file: File): Promise<NormalizedBillDraft>;
}
