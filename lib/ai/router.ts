import { GeminiProvider } from "@/lib/ai/gemini-provider";
import { OpenAIProvider } from "@/lib/ai/openai-provider";
import type { AIProvider, AIProviderName, AISuggestion } from "@/lib/ai/provider";
import type { Member, NormalizedBillDraft } from "@/lib/schemas/bill";

const providers: Record<AIProviderName, AIProvider> = {
  openai: new OpenAIProvider(),
  gemini: new GeminiProvider(),
};

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("AI provider timeout")), ms);
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

export async function routeAISuggestions(input: {
  draft: NormalizedBillDraft;
  members: Member[];
}): Promise<{ suggestions: AISuggestion[]; source: AIProviderName | "fallback" }> {
  const primary = (process.env.AI_PRIMARY_PROVIDER as AIProviderName) || "openai";
  const fallback = (process.env.AI_FALLBACK_PROVIDER as AIProviderName) || "gemini";
  const timeoutMs = Number(process.env.AI_TIMEOUT_MS ?? 5000);

  try {
    const suggestions = await withTimeout(providers[primary].suggestAssignments(input), timeoutMs);
    return { suggestions, source: primary };
  } catch {
    try {
      const suggestions = await withTimeout(providers[fallback].suggestAssignments(input), timeoutMs);
      return { suggestions, source: fallback };
    } catch {
      return { suggestions: [], source: "fallback" };
    }
  }
}
