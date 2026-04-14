import type { AIProvider, AISuggestion } from "@/lib/ai/provider";
import type { Member, NormalizedBillDraft } from "@/lib/schemas/bill";

function buildPrompt(draft: NormalizedBillDraft, members: Member[]) {
  return {
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "You assign receipt items to members. Return strict JSON array of objects: itemId, suggestedMemberIds, mode, memberWeights, confidence, reason.",
      },
      {
        role: "user",
        content: JSON.stringify({
          members,
          items: draft.items.map((item) => ({ id: item.id, label: item.label, amount: item.lineTotalCents })),
        }),
      },
    ],
    response_format: { type: "json_object" },
  };
}

export class OpenAIProvider implements AIProvider {
  readonly name = "openai" as const;

  async suggestAssignments(input: { draft: NormalizedBillDraft; members: Member[] }): Promise<AISuggestion[]> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is missing");
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(buildPrompt(input.draft, input.members)),
    });

    if (!response.ok) {
      throw new Error(`OpenAI provider error: ${response.status}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content;
    const parsed = typeof text === "string" ? JSON.parse(text) : text;
    return Array.isArray(parsed?.suggestions) ? parsed.suggestions : Array.isArray(parsed) ? parsed : [];
  }
}
