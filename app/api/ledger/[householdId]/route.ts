import { NextResponse } from "next/server";
import { getHouseholdLedger } from "@/lib/db/ledger";

export async function GET(_request: Request, context: { params: Promise<{ householdId: string }> }) {
  const { householdId } = await context.params;
  try {
    const ledger = await getHouseholdLedger(householdId);
    if (!ledger) return NextResponse.json({ error: "Household not found" }, { status: 404 });
    return NextResponse.json({ ledger });
  } catch (err) {
    console.error("[ledger] getHouseholdLedger failed:", err);
    return NextResponse.json({ error: "Failed to load ledger." }, { status: 500 });
  }
}
