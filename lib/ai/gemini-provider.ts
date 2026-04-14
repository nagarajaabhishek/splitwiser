import type { AIProvider, AISuggestion } from "@/lib/ai/provider";
import type { Member, NormalizedBillDraft } from "@/lib/schemas/bill";

function buildPrompt(draft: NormalizedBillDraft, members: Member[]) {
  return `Return strict JSON with key "suggestions" for assigning items to members.
Each suggestion object: itemId, suggestedMemberIds, mode(single|equal|custom), memberWeights(optional), confidence(0..1), reason.
Input: ${JSON.stringify({
    members,
    items: draft.items.map((item) => ({ id: item.id, label: item.label, amount: item.lineTotalCents })),
  })}`;
}

export class GeminiProvider implements AIProvider {
  readonly name = "gemini" as const;

  async suggestAssignments(input: { draft: NormalizedBillDraft; members: Member[] }): Promise<AISuggestion[]> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is missing");
    }

    const model = process.env.GEMINI_MODEL ?? "gemini-1.5-flash";
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: buildPrompt(input.draft, input.members) }] }],
          generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`Gemini provider error: ${response.status}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    const parsed = typeof text === "string" ? JSON.parse(text) : text;
    return Array.isArray(parsed?.suggestions) ? parsed.suggestions : Array.isArray(parsed) ? parsed : [];
  }
}
