import { normalizeLabel } from "@/lib/engine/agent";
import type { NormalizedBillDraft } from "@/lib/schemas/bill";

type LabelNormalizationSuggestion = {
  input: string;
  output: string;
  confidence: number;
};

export type LabelNormalizationDiagnostics = {
  providerUsed: "heuristic" | "openai" | "gemini" | "fallback";
  usedAI: boolean;
  replacedCount: number;
  confidenceThreshold: number;
  fallbackReason?: string;
};

const TOKEN_MAP: Record<string, string> = {
  BNLS: "BONELESS",
  BLS: "BONELESS",
  CK: "CHICKEN",
  CHKN: "CHICKEN",
  CHIX: "CHICKEN",
  BRS: "BREAST",
  BRST: "BREAST",
  ASPARTAM: "ASPARTAME",
  TRPICAN: "TROPICANA",
  PK: "PACK",
  OZ: "OUNCE",
  LB: "POUND",
  GV: "GREAT VALUE",
};

function titleCase(text: string): string {
  return text
    .toLowerCase()
    .split(" ")
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(" ");
}

export function heuristicNormalizeProductLabel(label: string): string {
  const cleaned = label
    .replace(/[^A-Za-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return label;

  const expanded = cleaned
    .split(" ")
    .map((token) => TOKEN_MAP[token.toUpperCase()] ?? token)
    .join(" ");

  return titleCase(expanded);
}

function parseOpenAIResponse(data: unknown): LabelNormalizationSuggestion[] {
  const text =
    typeof data === "object" && data !== null
      ? (data as { choices?: Array<{ message?: { content?: string } }> }).choices?.[0]?.message?.content
      : undefined;
  if (!text) return [];
  const parsed = JSON.parse(text) as { suggestions?: LabelNormalizationSuggestion[] } | LabelNormalizationSuggestion[];
  return Array.isArray(parsed) ? parsed : Array.isArray(parsed.suggestions) ? parsed.suggestions : [];
}

async function normalizeWithOpenAI(labels: string[]): Promise<LabelNormalizationSuggestion[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY missing");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You normalize abbreviated grocery receipt labels. Return strict JSON with key suggestions containing array of {input, output, confidence}. Keep original if uncertain.",
        },
        {
          role: "user",
          content: JSON.stringify({ labels }),
        },
      ],
    }),
  });
  if (!response.ok) throw new Error(`OPENAI_NORMALIZE_FAILED:${response.status}`);
  return parseOpenAIResponse(await response.json());
}

function parseGeminiResponse(data: unknown): LabelNormalizationSuggestion[] {
  const text =
    typeof data === "object" && data !== null
      ? (data as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }).candidates?.[0]?.content?.parts?.[0]
          ?.text
      : undefined;
  if (!text) return [];
  const parsed = JSON.parse(text) as { suggestions?: LabelNormalizationSuggestion[] } | LabelNormalizationSuggestion[];
  return Array.isArray(parsed) ? parsed : Array.isArray(parsed.suggestions) ? parsed.suggestions : [];
}

async function normalizeWithGemini(labels: string[]): Promise<LabelNormalizationSuggestion[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY missing");
  const model = process.env.GEMINI_MODEL ?? "gemini-1.5-flash";
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              text: `Normalize abbreviated grocery receipt labels. Return JSON { "suggestions": [{ "input": "...", "output": "...", "confidence": 0.0 }] }. Keep original if uncertain. Labels: ${JSON.stringify(
                labels,
              )}`,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json",
      },
    }),
  });
  if (!response.ok) throw new Error(`GEMINI_NORMALIZE_FAILED:${response.status}`);
  return parseGeminiResponse(await response.json());
}

export async function normalizeDraftLabels(
  draft: NormalizedBillDraft,
): Promise<{ draft: NormalizedBillDraft; diagnostics: LabelNormalizationDiagnostics }> {
  const confidenceThreshold = Number(process.env.VISION_LABEL_CONFIDENCE_THRESHOLD ?? 0.8);
  const aiEnabled = (process.env.VISION_LABEL_AI_ENABLED ?? "true") === "true";
  const heuristicLabels = draft.items.map((item) => heuristicNormalizeProductLabel(item.label));

  let providerUsed: LabelNormalizationDiagnostics["providerUsed"] = "heuristic";
  let fallbackReason: string | undefined;
  let usedAI = false;
  let aiSuggestions: LabelNormalizationSuggestion[] = [];

  if (aiEnabled) {
    try {
      aiSuggestions = await normalizeWithOpenAI(draft.items.map((item) => item.label));
      providerUsed = "openai";
      usedAI = true;
    } catch (openAIError) {
      try {
        aiSuggestions = await normalizeWithGemini(draft.items.map((item) => item.label));
        providerUsed = "gemini";
        usedAI = true;
        fallbackReason = `openai:${String(openAIError)}`;
      } catch (geminiError) {
        providerUsed = "fallback";
        fallbackReason = `openai:${String(openAIError)}|gemini:${String(geminiError)}`;
      }
    }
  }

  const aiByInput = new Map(
    aiSuggestions
      .filter((entry) => typeof entry.input === "string" && typeof entry.output === "string")
      .map((entry) => [normalizeLabel(entry.input), entry]),
  );

  let replacedCount = 0;
  const items = draft.items.map((item, index) => {
    const aiMatch = aiByInput.get(normalizeLabel(item.label));
    const heuristic = heuristicLabels[index];
    const aiCandidate =
      aiMatch && aiMatch.confidence >= confidenceThreshold && aiMatch.output.trim().length > 0 ? aiMatch.output.trim() : null;
    const nextLabel = aiCandidate ?? heuristic;
    if (nextLabel !== item.label) replacedCount += 1;
    return {
      ...item,
      label: nextLabel,
      normalizedLabel: normalizeLabel(nextLabel),
    };
  });

  return {
    draft: {
      ...draft,
      items,
    },
    diagnostics: {
      providerUsed,
      usedAI,
      replacedCount,
      confidenceThreshold,
      fallbackReason,
    },
  };
}
