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

    const configuredModel = process.env.GEMINI_VISION_MODEL ?? process.env.GEMINI_MODEL ?? "gemini-1.5-flash";
    const candidateModels = [
      configuredModel,
      "gemini-2.0-flash",
      "gemini-2.0-flash-lite",
      "gemini-1.5-flash",
      "gemini-1.5-flash-latest",
      "gemini-1.5-pro",
    ];
    const bytes = Buffer.from(await file.arrayBuffer()).toString("base64");

    let response: Response | null = null;
    let lastError = "";
    for (const model of candidateModels) {
      // Try a model fallback chain since some accounts/regions do not expose all model ids.
      response = await fetch(
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

      if (response.ok) break;
      lastError = `model=${model},status=${response.status}`;
      if (response.status !== 404) break;
    }

    if (!response || !response.ok) {
      throw new Error(`VISION_PROVIDER_ERROR:GEMINI:${lastError || "unknown"}`);
    }

    const json = await response.json();
    let text = json.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error("VISION_EMPTY_RESPONSE:GEMINI");
    }
    text = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/, "");
    const parsed = JSON.parse(text) as ParsedVisionDraft;
    return normalizeVisionDraft(parsed);
  }
}
