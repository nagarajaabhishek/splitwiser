import { GeminiVisionProvider } from "@/lib/vision/gemini-provider";
import { OpenAIVisionProvider } from "@/lib/vision/openai-provider";
import type { VisionProviderName } from "@/lib/vision/provider";
import { StubVisionProvider } from "@/lib/vision/stub-provider";

const providers = {
  stub: new StubVisionProvider(),
  gemini: new GeminiVisionProvider(),
  openai: new OpenAIVisionProvider(),
};

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("VISION_TIMEOUT")), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

export async function extractWithVisionRouter(file: File): Promise<{
  draft: Awaited<ReturnType<typeof providers.stub.extractBill>>;
  providerUsed: VisionProviderName | "fallback";
  fallbackReason?: string;
}> {
  const mode = (process.env.VISION_PROVIDER_MODE ?? "router") as "router" | "stub";
  if (mode === "stub") {
    const draft = await providers.stub.extractBill(file);
    return { draft, providerUsed: "stub" };
  }

  const primary = (process.env.VISION_PRIMARY_PROVIDER ?? "gemini") as VisionProviderName;
  const fallback = (process.env.VISION_FALLBACK_PROVIDER ?? "openai") as VisionProviderName;
  const timeoutMs = Number(process.env.VISION_TIMEOUT_MS ?? 30000);

  try {
    const draft = await withTimeout(providers[primary].extractBill(file), timeoutMs);
    return { draft, providerUsed: primary };
  } catch (primaryError) {
    try {
      const draft = await withTimeout(providers[fallback].extractBill(file), timeoutMs);
      return {
        draft,
        providerUsed: fallback,
        fallbackReason: `${primary}:${String(primaryError)}`,
      };
    } catch (fallbackError) {
      throw new Error(`VISION_ROUTER_FAILED:${primary}:${String(primaryError)}|${fallback}:${String(fallbackError)}`);
    }
  }
}
