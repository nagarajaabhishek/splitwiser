import { NextResponse } from "next/server";
import { billUploadBatchResponseSchema, billUploadResponseSchema } from "@/lib/schemas/bill";
import { extractWithVisionRouter } from "@/lib/vision";
import { normalizeDraftLabels } from "@/lib/vision/label-normalizer";
import { verifyParsedDraft } from "@/lib/vision/verification";
/* eslint-disable @typescript-eslint/no-require-imports */
const heicConvert = require("heic-convert") as (opts: { buffer: Buffer; format: "JPEG"; quality: number }) => Promise<ArrayBuffer>;
const sharp = require("sharp") as typeof import("sharp");
/* eslint-enable @typescript-eslint/no-require-imports */

// MIME types Gemini accepts natively — no conversion needed.
const GEMINI_NATIVE = new Set(["image/jpeg", "image/png", "image/gif", "image/webp", "application/pdf"]);
// Non-image document types that can never be parsed as a receipt image.
const DOCUMENT_TYPES = new Set([
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/csv",
]);

/**
 * Converts unsupported image formats to JPEG so Gemini can process them.
 * - HEIC/HEIF  → heic-convert (WASM, reliable cross-platform)
 * - TIFF, BMP, AVIF, and any other image/* → sharp (already in the dep tree via Next.js)
 * - Gemini-native formats (JPEG, PNG, WebP, GIF, PDF) pass through unchanged.
 * Throws for document types that can never be receipt images.
 */
async function normalizeFileFormat(file: File): Promise<File> {
  if (DOCUMENT_TYPES.has(file.type)) {
    throw new Error("UPLOAD_UNSUPPORTED_MIME:document");
  }

  // Already natively supported — skip conversion.
  if (GEMINI_NATIVE.has(file.type)) return file;

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const isHeic = file.type === "image/heic" || file.type === "image/heif" ||
    ext === "heic" || ext === "heif";

  const inputBuffer = Buffer.from(await file.arrayBuffer());

  if (isHeic) {
    const outputBuffer = await heicConvert({ buffer: inputBuffer, format: "JPEG", quality: 0.92 });
    const jpegName = file.name.replace(/\.[^.]+$/, ".jpg");
    return new File([outputBuffer], jpegName, { type: "image/jpeg" });
  }

  // For any other image/* (TIFF, BMP, AVIF, etc.), use sharp to convert to JPEG.
  if (file.type.startsWith("image/")) {
    const outputBuffer = await sharp(inputBuffer).jpeg({ quality: 92 }).toBuffer();
    const ab = outputBuffer.buffer.slice(outputBuffer.byteOffset, outputBuffer.byteOffset + outputBuffer.byteLength) as ArrayBuffer;
    const jpegName = file.name.replace(/\.[^.]+$/, ".jpg");
    return new File([ab], jpegName, { type: "image/jpeg" });
  }

  // Empty type (Chrome sometimes omits it) — pass through and let Gemini decide.
  return file;
}

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

    for (const rawFile of files) {
      let file: File;
      try {
        file = await normalizeFileFormat(rawFile);
      } catch {
        failures.push({
          fileName: rawFile.name,
          code: "UPLOAD_UNSUPPORTED_MIME",
          error: "Could not convert this image format. Try exporting as JPEG.",
        });
        continue;
      }
      // Chrome reports file.type="" for some formats; treat empty as allowed and let
      // Gemini reject downstream if it truly can't parse the content.
      const allowedMime = !file.type || file.type.startsWith("image/") || file.type === "application/pdf";
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
