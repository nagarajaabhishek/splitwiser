import { NextResponse } from "next/server";
import { listBillHistory } from "@/lib/db/bills";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const householdId = searchParams.get("householdId");

  if (!householdId) {
    return NextResponse.json({ bills: [] });
  }

  try {
    const bills = await listBillHistory(householdId);
    return NextResponse.json({ bills });
  } catch (err) {
    console.error("[history] listBillHistory failed:", err);
    return NextResponse.json({ bills: [], error: "Failed to load history." }, { status: 500 });
  }
}
