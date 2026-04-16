import { normalizeLabel } from "@/lib/engine/agent";
import { applyCategorizationToDraft } from "@/lib/categorization/infer";
import type { NormalizedBillDraft, NormalizedBillItem } from "@/lib/schemas/bill";
import { lookupProductByUpcDetailed } from "@/lib/vision/catalog/lookup";
import { listLabelCorrections } from "@/lib/db/label-corrections";
import { inferMerchantProfile } from "@/lib/vision/merchant-templates";

type LabelNormalizationSuggestion = {
  input: string;
  output: string;
  confidence: number;
  needsReview?: boolean;
};

export type LabelNormalizationDiagnostics = {
  providerUsed: "heuristic" | "openai" | "gemini" | "fallback" | "catalog" | "memory";
  usedAI: boolean;
  replacedCount: number;
  confidenceThreshold: number;
  fallbackReason?: string;
  catalogMatches: number;
  catalogProvidersUsed: string[];
  catalogFallbackReason?: string;
  catalogFallbackUsed?: boolean;
  catalogProviderScorecard?: Array<{ provider: string; latencyMs: number; hit: boolean; error?: string }>;
  nameReviewCount: number;
  memoryMatches: number;
  merchantTemplate?: string;
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
  const parsed = JSON.parse(text) as
    | { suggestions?: LabelNormalizationSuggestion[] }
    | LabelNormalizationSuggestion[];
  return Array.isArray(parsed) ? parsed : Array.isArray(parsed.suggestions) ? parsed.suggestions : [];
}

async function normalizeWithOpenAI(merchantName: string, items: NormalizedBillItem[]): Promise<LabelNormalizationSuggestion[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY missing");

  const payload = items.map((item) => ({
    input: item.originalLabel ?? item.label,
    rawLineText: item.rawLineText ?? null,
    upc: item.upc ?? null,
    itemCode: item.itemCode ?? null,
    department: item.department ?? null,
  }));

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
            "You expand abbreviated or truncated retail receipt lines into clearer product names. Return strict JSON with key suggestions: array of {input, output, confidence, needsReview}. Each input must match an item input string exactly. Set needsReview true when unsure. Keep output close to input if uncertain (confidence under 0.6).",
        },
        {
          role: "user",
          content: JSON.stringify({ merchantName, items: payload }),
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

async function normalizeWithGemini(merchantName: string, items: NormalizedBillItem[]): Promise<LabelNormalizationSuggestion[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY missing");
  const model = process.env.GEMINI_MODEL ?? "gemini-1.5-flash";
  const payload = items.map((item) => ({
    input: item.originalLabel ?? item.label,
    rawLineText: item.rawLineText ?? null,
    upc: item.upc ?? null,
    itemCode: item.itemCode ?? null,
    department: item.department ?? null,
  }));

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              text: `Expand abbreviated retail receipt lines into clearer product names. Return JSON { "suggestions": [{ "input": "...", "output": "...", "confidence": 0.0, "needsReview": false }] }. Input strings must match exactly. Merchant: ${merchantName}. Data: ${JSON.stringify(
                payload,
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
  const nameReviewThreshold = Number(process.env.VISION_NAME_REVIEW_THRESHOLD ?? 0.85);
  const aiEnabled = (process.env.VISION_LABEL_AI_ENABLED ?? "true") === "true";
  const catalogEnabled = (process.env.VISION_CATALOG_LOOKUP_ENABLED ?? "true") === "true";
  const merchantProfile = inferMerchantProfile(draft.merchantName);
  let memoryMap = new Map<string, { correctedLabel: string; confidence: number; uses: number }>();
  try {
    memoryMap = await listLabelCorrections({
      merchantName: draft.merchantName,
      sourceLabels: draft.items.map((item) => item.originalLabel ?? item.label),
    });
  } catch {
    // Label memory is a best-effort enhancement; parsing should still continue without DB access.
  }
  const memoryMatches = memoryMap.size;

  const catalogLookups = await Promise.all(
    draft.items.map((item) =>
      catalogEnabled && item.upc
        ? lookupProductByUpcDetailed(item.upc, { merchantName: merchantProfile.normalizedMerchantName })
        : Promise.resolve({
            result: null,
            diagnostics: { attemptedProviders: [] as string[], fallbackReason: undefined, fallbackUsed: false, providerScorecard: [] },
          }),
    ),
  );
  const catalogHits = catalogLookups.map((lookup) => lookup.result);
  const catalogProvidersUsed = [...new Set(catalogHits.map((hit) => hit?.provider).filter((entry): entry is string => Boolean(entry)))];
  const catalogFallbackReason = catalogLookups.map((lookup) => lookup.diagnostics.fallbackReason).find((entry) => Boolean(entry));
  const catalogFallbackUsed = catalogLookups.some((lookup) => lookup.diagnostics.fallbackUsed);
  const catalogProviderScorecard = catalogLookups.flatMap((lookup) => lookup.diagnostics.providerScorecard);

  const catalogMatches = catalogHits.filter(Boolean).length;

  const needsAiMask = catalogHits.map((hit) => !hit);
  const itemsForAi = draft.items.filter((_, index) => needsAiMask[index]).map((item) => ({
    ...item,
    originalLabel: item.originalLabel ?? item.label,
  }));

  let providerUsed: LabelNormalizationDiagnostics["providerUsed"] = catalogMatches > 0 ? "catalog" : memoryMatches > 0 ? "memory" : "heuristic";
  let fallbackReason: string | undefined;
  let usedAI = false;
  let aiSuggestions: LabelNormalizationSuggestion[] = [];

  if (aiEnabled && itemsForAi.length > 0) {
    try {
      aiSuggestions = await normalizeWithOpenAI(draft.merchantName, itemsForAi);
      providerUsed = "openai";
      usedAI = true;
    } catch (openAIError) {
      try {
        aiSuggestions = await normalizeWithGemini(draft.merchantName, itemsForAi);
        providerUsed = "gemini";
        usedAI = true;
        fallbackReason = `openai:${String(openAIError)}`;
      } catch (geminiError) {
        providerUsed = catalogMatches > 0 ? "catalog" : "fallback";
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
  let nameReviewCount = 0;

  const items = draft.items.map((item, index) => {
    const ocr = item.originalLabel ?? item.label;
    const memoryHit = memoryMap.get(normalizeLabel(ocr));
    if (memoryHit) {
      const nextLabel = memoryHit.correctedLabel.trim();
      const next = {
        ...item,
        label: nextLabel,
        normalizedLabel: normalizeLabel(nextLabel),
        originalLabel: ocr,
        enrichment: {
          source: "memory" as const,
          confidence: Math.max(0.85, Math.min(0.99, memoryHit.confidence)),
          needsReview: false,
          suggestedLabel: nextLabel,
        },
      };
      if (next.label !== item.label) replacedCount += 1;
      return next;
    }
    const catalog = catalogHits[index];
    if (catalog) {
      const next = {
        ...item,
        label: catalog.name,
        normalizedLabel: normalizeLabel(catalog.name),
        originalLabel: ocr,
        enrichment: {
          source: "catalog" as const,
          catalogProvider: catalog.provider,
          catalogProductName: catalog.name,
          confidence: catalog.confidence,
          needsReview: false,
          suggestedLabel: catalog.name,
        },
      };
      if (next.label !== item.label) replacedCount += 1;
      return next;
    }

    const heuristic = heuristicNormalizeProductLabel(ocr);
    const aiMatch = aiByInput.get(normalizeLabel(ocr));

    if (aiMatch && aiMatch.confidence >= confidenceThreshold && aiMatch.output.trim().length > 0) {
      const needsNameReview =
        aiMatch.needsReview === true ||
        aiMatch.confidence < nameReviewThreshold ||
        (aiMatch.confidence < 0.95 && (ocr.length < 12 || ocr.split(/\s+/).length < 2));
      if (needsNameReview) nameReviewCount += 1;
      const nextLabel = aiMatch.output.trim();
      const next = {
        ...item,
        label: nextLabel,
        normalizedLabel: normalizeLabel(nextLabel),
        originalLabel: ocr,
        enrichment: {
          source: "ai" as const,
          confidence: aiMatch.confidence,
          needsReview: needsNameReview,
          suggestedLabel: nextLabel,
        },
      };
      if (next.label !== item.label) replacedCount += 1;
      return next;
    }

    if (aiMatch && aiMatch.output.trim().length > 0) {
      nameReviewCount += 1;
      const nextLabel = aiMatch.output.trim();
      return {
        ...item,
        label: nextLabel,
        normalizedLabel: normalizeLabel(nextLabel),
        originalLabel: ocr,
        enrichment: {
          source: "ai" as const,
          confidence: aiMatch.confidence,
          needsReview: true,
          suggestedLabel: nextLabel,
        },
      };
    }

    nameReviewCount += 1;
    const next = {
      ...item,
      label: heuristic,
      normalizedLabel: normalizeLabel(heuristic),
      originalLabel: ocr,
      enrichment: {
        source: "heuristic" as const,
        confidence: 0.55,
        needsReview: true,
        suggestedLabel: heuristic,
      },
    };
    if (next.label !== item.label) replacedCount += 1;
    return next;
  });

  const withCategories = applyCategorizationToDraft({
    ...draft,
    items,
  });

  return {
    draft: withCategories,
    diagnostics: {
      providerUsed,
      usedAI,
      replacedCount,
      confidenceThreshold,
      fallbackReason,
      catalogMatches,
      catalogProvidersUsed,
      catalogFallbackReason,
      catalogFallbackUsed,
      catalogProviderScorecard,
      nameReviewCount,
      memoryMatches,
      merchantTemplate: merchantProfile.merchantKey,
    },
  };
}
