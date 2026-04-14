import { extractWithVisionRouter } from "@/lib/vision/router";
import type { VisionProvider } from "@/lib/vision/provider";
import { StubVisionProvider } from "@/lib/vision/stub-provider";

export function getVisionProvider(): VisionProvider {
  return new StubVisionProvider();
}

export { extractWithVisionRouter };
