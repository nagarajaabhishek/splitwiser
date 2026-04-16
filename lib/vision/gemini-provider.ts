import type { VisionProvider } from "@/lib/vision/provider";
import { normalizeVisionDraft, type ParsedVisionDraft } from "@/lib/vision/provider";
import { inferMerchantProfile } from "@/lib/vision/merchant-templates";

function buildPrompt(merchantKey: string, retryMissingOnly: boolean, knownLineHints: string[] = []) {
  const retryInstructions = retryMissingOnly
    ? `\nRETRY MODE: Return ONLY purchasable line items that are missing from known lines.\nKnown lines to exclude: ${JSON.stringify(
        knownLineHints,
      )}\nDo not include any line that appears in the known list.`
    : "";
  return `Extract this receipt into strict JSON:
{
  "merchantName": "string",
  "billDate": "ISO date string if visible",
  "subtotal": number,
  "tax": number,
  "total": number,
  "itemsSoldCount": number,
  "items": [{
    "label": "string (short line item name as printed)",
    "lineTotal": number,
    "quantity": number,
    "rawLineText": "string optional full line text if visible and longer than label",
    "upc": "string optional digits-only barcode/UPC if visible on the line or nearby",
    "itemCode": "string optional store SKU if visible",
    "department": "string optional department/category if visible"
  }]
}
Use decimal currency values (e.g. 12.34).
Prefer capturing UPC/barcode digits when present; omit fields you cannot read.
IMPORTANT: list every purchased line item exactly as shown, in receipt order.
Do not merge similar lines, do not deduplicate repeated labels, and do not collapse weighted produce lines.
If the same item appears multiple times, return multiple entries.
For ${merchantKey} receipts, prioritize extracting "itemsSoldCount" from footer lines like "# ITEMS SOLD" and ensure the items array reflects that count when visible.${retryInstructions}`;
}

export class GeminiVisionProvider implements VisionProvider {
  async extractBill(
    file: File,
    options?: {
      retryMissingOnly?: boolean;
      knownLineHints?: string[];
    },
  ) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("VISION_KEY_MISSING:GEMINI");
    }

    const configuredModel = process.env.GEMINI_VISION_MODEL ?? process.env.GEMINI_MODEL ?? "gemini-1.5-flash";
    const merchantKey = inferMerchantProfile(file.name).merchantKey;
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
                  { text: buildPrompt(merchantKey, Boolean(options?.retryMissingOnly), options?.knownLineHints ?? []) },
                  { text: `Merchant template hint: ${merchantKey}` },
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
