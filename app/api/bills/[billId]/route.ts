import { NextResponse } from "next/server";
import { getBillDetail } from "@/lib/db/bills";

export async function GET(_request: Request, context: { params: Promise<{ billId: string }> }) {
  const { billId } = await context.params;
  const bill = await getBillDetail(billId);
  if (!bill) {
    return NextResponse.json({ error: "Bill not found" }, { status: 404 });
  }
  return NextResponse.json({ bill });
}
