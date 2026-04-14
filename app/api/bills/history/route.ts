import { NextResponse } from "next/server";
import { listBillHistory } from "@/lib/db/bills";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const householdId = searchParams.get("householdId");

  if (!householdId) {
    return NextResponse.json({ bills: [] });
  }

  const bills = await listBillHistory(householdId);
  return NextResponse.json({ bills });
}
