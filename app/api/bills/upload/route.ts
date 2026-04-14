import { NextResponse } from "next/server";
import { billUploadResponseSchema } from "@/lib/schemas/bill";
import { getVisionProvider } from "@/lib/vision";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "A receipt file is required." }, { status: 400 });
    }

    const provider = getVisionProvider();
    const draft = await provider.extractBill(file);
    const payload = billUploadResponseSchema.parse({ source: "vision", draft });

    return NextResponse.json(payload, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload processing failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
