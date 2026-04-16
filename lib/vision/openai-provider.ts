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
    "upc": "string optional digits-only barcode/UPC if visible",
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

export class OpenAIVisionProvider implements VisionProvider {
  async extractBill(
    file: File,
    options?: {
      retryMissingOnly?: boolean;
      knownLineHints?: string[];
    },
  ) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("VISION_KEY_MISSING:OPENAI");
    }

    if (file.type === "application/pdf") {
      throw new Error("VISION_UNSUPPORTED_BY_PROVIDER:OPENAI_PDF");
    }

    const model = process.env.OPENAI_VISION_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini";
    const merchantKey = inferMerchantProfile(file.name).merchantKey;
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
              {
                type: "text",
                text: buildPrompt(merchantKey, Boolean(options?.retryMissingOnly), options?.knownLineHints ?? []),
              },
              { type: "text", text: `Merchant template hint: ${merchantKey}` },
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
