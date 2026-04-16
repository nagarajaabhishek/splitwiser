import { NextResponse } from "next/server";
import { billUploadBatchResponseSchema, billUploadResponseSchema } from "@/lib/schemas/bill";
import { extractWithVisionRouter } from "@/lib/vision";
import { normalizeDraftLabels } from "@/lib/vision/label-normalizer";
import { verifyParsedDraft } from "@/lib/vision/verification";

const MAX_FILES = 10;

function toUploadCode(message: string): string {
  if (message.includes("UPLOAD_UNSUPPORTED_MIME")) return "UPLOAD_UNSUPPORTED_MIME";
  if (message.includes("UPLOAD_FILE_TOO_LARGE")) return "UPLOAD_FILE_TOO_LARGE";
  if (message.includes("VISION_ROUTER_FAILED")) return "UPLOAD_PARSE_FAILED";
  return "UPLOAD_PARSE_FAILED";
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const list = formData.getAll("files");
    const fallbackSingle = formData.get("file");
    const incoming = list.length > 0 ? list : fallbackSingle ? [fallbackSingle] : [];
    const files = incoming.filter((entry): entry is File => entry instanceof File);

    if (files.length === 0) {
      return NextResponse.json({ error: "A receipt file is required.", code: "UPLOAD_FILE_REQUIRED" }, { status: 400 });
    }

    if (files.length > MAX_FILES) {
      return NextResponse.json(
        { error: `Too many files. Maximum is ${MAX_FILES}.`, code: "UPLOAD_TOO_MANY_FILES" },
        { status: 400 },
      );
    }

    const maxMb = Number(process.env.VISION_MAX_UPLOAD_MB ?? 12);
    const maxBytes = maxMb * 1024 * 1024;

    const successes: Array<{
      fileName: string;
      source: string;
      draft: ReturnType<typeof billUploadResponseSchema.parse>["draft"];
      diagnostics: {
        providerUsed: string;
        fallbackReason?: string;
        labelNormalization?: {
          providerUsed: string;
          usedAI: boolean;
          replacedCount: number;
          confidenceThreshold: number;
          fallbackReason?: string;
          catalogMatches?: number;
          catalogProvidersUsed?: string[];
          catalogFallbackReason?: string;
          catalogFallbackUsed?: boolean;
          catalogProviderScorecard?: Array<{ provider: string; latencyMs: number; hit: boolean; error?: string }>;
          nameReviewCount?: number;
          memoryMatches?: number;
          merchantTemplate?: string;
        };
        parseVerification?: {
          itemCount: number;
          receiptItemCount?: number;
          itemCountDelta: number;
          duplicateLineGroups: number;
          duplicateLineExamples: string[];
          subtotalFromItemsCents: number;
          subtotalDeltaCents: number;
          quantityAnomalyCount: number;
          severity: "none" | "soft" | "hard";
          hardReviewRequired: boolean;
          needsReview: boolean;
          reasons: string[];
        };
        hybridRecall?: {
          enabled: boolean;
          passCount: number;
          postPassItemCounts: number[];
          secondaryProviderUsed: boolean;
          retryTriggered: boolean;
          remainingDelta?: number;
          mergeKept: number;
          mergeDropped: number;
          traces: Array<{ pass: "primary" | "secondary" | "retry"; provider: string; itemCount: number }>;
        };
      };
    }> = [];
    const failures: Array<{ fileName: string; code: string; error: string }> = [];

    for (const file of files) {
      const allowedMime = file.type.startsWith("image/") || file.type === "application/pdf";
      if (!allowedMime) {
        failures.push({
          fileName: file.name,
          code: "UPLOAD_UNSUPPORTED_MIME",
          error: "Unsupported file type. Use image or PDF.",
        });
        continue;
      }

      if (file.size > maxBytes) {
        failures.push({
          fileName: file.name,
          code: "UPLOAD_FILE_TOO_LARGE",
          error: `File too large. Limit is ${maxMb}MB.`,
        });
        continue;
      }

      try {
        const { draft, providerUsed, fallbackReason, hybridDiagnostics } = await extractWithVisionRouter(file);
        const normalized = await normalizeDraftLabels(draft);
        const verification = verifyParsedDraft(normalized.draft);
        const payload = billUploadResponseSchema.parse({ source: providerUsed, draft: verification.draft });
        successes.push({
          fileName: file.name,
          source: payload.source,
          draft: payload.draft,
          diagnostics: {
            providerUsed,
            fallbackReason,
            labelNormalization: normalized.diagnostics,
            parseVerification: verification.diagnostics,
            hybridRecall: hybridDiagnostics
              ? {
                  ...hybridDiagnostics,
                  traces: hybridDiagnostics.traces.map((trace) => ({ ...trace, provider: trace.provider })),
                }
              : undefined,
          },
        });
        const pv = verification.diagnostics;
        console.info(
          "[upload-metrics]",
          JSON.stringify({
            fileName: file.name,
            providerUsed,
            catalogProvidersUsed: normalized.diagnostics.catalogProvidersUsed,
            catalogFallbackUsed: normalized.diagnostics.catalogFallbackUsed ?? false,
            severity: pv.severity,
            hardReviewRequired: pv.hardReviewRequired,
            parseNeedsReview: pv.needsReview,
            itemCountDelta: pv.itemCountDelta,
            subtotalDeltaCents: pv.subtotalDeltaCents,
          }),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "Upload processing failed.";
        failures.push({
          fileName: file.name,
          code: toUploadCode(message),
          error: message,
        });
      }
    }

    if (successes.length === 0) {
      return NextResponse.json(
        {
          error: failures[0]?.error ?? "Upload processing failed.",
          code: failures[0]?.code ?? "UPLOAD_PARSE_FAILED",
          successes: [],
          failures,
        },
        { status: 400 },
      );
    }

    const batchPayload = billUploadBatchResponseSchema.parse({
      successes,
      failures,
    });
    return NextResponse.json(batchPayload, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload processing failed.";
    return NextResponse.json({ error: message, code: "UPLOAD_PARSE_FAILED" }, { status: 500 });
  }
}
