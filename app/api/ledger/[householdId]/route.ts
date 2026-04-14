import { NextResponse } from "next/server";
import { getHouseholdLedger } from "@/lib/db/ledger";

export async function GET(_request: Request, context: { params: Promise<{ householdId: string }> }) {
  const { householdId } = await context.params;
  const ledger = await getHouseholdLedger(householdId);
  if (!ledger) return NextResponse.json({ error: "Household not found" }, { status: 404 });
  return NextResponse.json({ ledger });
}
