import { NextResponse } from "next/server";
import { createOrGetBillShareToken } from "@/lib/db/bills";

export async function POST(request: Request, context: { params: Promise<{ billId: string }> }) {
  const { billId } = await context.params;
  const token = await createOrGetBillShareToken(billId);
  if (!token) {
    return NextResponse.json({ error: "Only finalized bills can be shared." }, { status: 400 });
  }

  const origin = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
  const shareUrl = `${origin}/share/${token}`;
  return NextResponse.json({ shareUrl, token });
}
