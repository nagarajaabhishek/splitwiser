import { NextResponse } from "next/server";
import { loadSplitLaterBillForResume } from "@/lib/db/bills";

export async function GET(_request: Request, context: { params: Promise<{ billId: string }> }) {
  const { billId } = await context.params;
  const payload = await loadSplitLaterBillForResume(billId);
  if (!payload) {
    return NextResponse.json({ error: "Split-later bill not found." }, { status: 404 });
  }
  return NextResponse.json(payload);
}
