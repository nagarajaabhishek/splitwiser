import type { NormalizedBillDraft } from "@/lib/schemas/bill";
import type { VisionProvider } from "@/lib/vision/provider";
import { StubVisionProvider } from "@/lib/vision/stub-provider";

class PlaceholderVisionProvider implements VisionProvider {
  async extractBill(file: File): Promise<NormalizedBillDraft> {
    void file;
    throw new Error("Vision provider not configured. Set VISION_PROVIDER=stub or wire a real provider.");
  }
}

export function getVisionProvider(): VisionProvider {
  const provider = process.env.VISION_PROVIDER ?? "stub";
  if (provider === "stub") {
    return new StubVisionProvider();
  }
  return new PlaceholderVisionProvider();
}
