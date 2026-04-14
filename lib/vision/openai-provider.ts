import type { VisionProvider } from "@/lib/vision/provider";
import { normalizeVisionDraft, type ParsedVisionDraft } from "@/lib/vision/provider";

function buildPrompt() {
  return `Extract this receipt into strict JSON:
{
  "merchantName": "string",
  "billDate": "ISO date string if visible",
  "subtotal": number,
  "tax": number,
  "total": number,
  "items": [{ "label": "string", "lineTotal": number, "quantity": number }]
}
Use decimal currency values (e.g. 12.34).`;
}

export class OpenAIVisionProvider implements VisionProvider {
  async extractBill(file: File) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("VISION_KEY_MISSING:OPENAI");
    }

    if (file.type === "application/pdf") {
      throw new Error("VISION_UNSUPPORTED_BY_PROVIDER:OPENAI_PDF");
    }

    const model = process.env.OPENAI_VISION_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini";
    const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    const dataUrl = `data:${file.type || "image/png"};base64,${base64}`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: buildPrompt() },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`VISION_PROVIDER_ERROR:OPENAI:${response.status}`);
    }

    const json = await response.json();
    const text = json.choices?.[0]?.message?.content;
    if (!text) {
      throw new Error("VISION_EMPTY_RESPONSE:OPENAI");
    }
    const parsed = JSON.parse(text) as ParsedVisionDraft;
    return normalizeVisionDraft(parsed);
  }
}
