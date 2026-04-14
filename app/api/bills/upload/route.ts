import { NextResponse } from "next/server";
import { billUploadResponseSchema } from "@/lib/schemas/bill";
import { extractWithVisionRouter } from "@/lib/vision";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "A receipt file is required.", code: "UPLOAD_FILE_REQUIRED" }, { status: 400 });
    }

    const allowedMime = file.type.startsWith("image/") || file.type === "application/pdf";
    if (!allowedMime) {
      return NextResponse.json(
        { error: "Unsupported file type. Use image or PDF.", code: "UPLOAD_UNSUPPORTED_MIME" },
        { status: 415 },
      );
    }

    const maxMb = Number(process.env.VISION_MAX_UPLOAD_MB ?? 12);
    const maxBytes = maxMb * 1024 * 1024;
    if (file.size > maxBytes) {
      return NextResponse.json(
        { error: `File too large. Limit is ${maxMb}MB.`, code: "UPLOAD_FILE_TOO_LARGE" },
        { status: 413 },
      );
    }

    const { draft, providerUsed, fallbackReason } = await extractWithVisionRouter(file);
    const payload = billUploadResponseSchema.parse({ source: providerUsed, draft });

    return NextResponse.json({ ...payload, diagnostics: { providerUsed, fallbackReason } }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload processing failed.";
    return NextResponse.json({ error: message, code: "UPLOAD_PARSE_FAILED" }, { status: 500 });
  }
}
