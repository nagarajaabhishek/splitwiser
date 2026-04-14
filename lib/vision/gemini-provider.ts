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

export class GeminiVisionProvider implements VisionProvider {
  async extractBill(file: File) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("VISION_KEY_MISSING:GEMINI");
    }

    const model = process.env.GEMINI_VISION_MODEL ?? process.env.GEMINI_MODEL ?? "gemini-1.5-flash";
    const bytes = Buffer.from(await file.arrayBuffer()).toString("base64");
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: buildPrompt() },
                { inline_data: { mime_type: file.type || "application/octet-stream", data: bytes } },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json",
          },
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`VISION_PROVIDER_ERROR:GEMINI:${response.status}`);
    }

    const json = await response.json();
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error("VISION_EMPTY_RESPONSE:GEMINI");
    }
    const parsed = JSON.parse(text) as ParsedVisionDraft;
    return normalizeVisionDraft(parsed);
  }
}
