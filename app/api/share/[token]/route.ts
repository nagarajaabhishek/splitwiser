import { NextResponse } from "next/server";
import { getSharedBillDetail } from "@/lib/db/bills";

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const bill = await getSharedBillDetail(token);
  if (!bill) {
    return NextResponse.json({ error: "Shared bill not found" }, { status: 404 });
  }
  return NextResponse.json({ bill });
}
