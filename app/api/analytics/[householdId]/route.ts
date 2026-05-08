import { NextResponse } from "next/server";
import { getHouseholdAnalytics } from "@/lib/db/analytics";

export async function GET(_request: Request, context: { params: Promise<{ householdId: string }> }) {
  const { householdId } = await context.params;
  try {
    const analytics = await getHouseholdAnalytics(householdId);
    if (!analytics) return NextResponse.json({ error: "Household not found" }, { status: 404 });
    return NextResponse.json({ analytics });
  } catch (err) {
    console.error("[analytics] getHouseholdAnalytics failed:", err);
    return NextResponse.json({ error: "Failed to load analytics." }, { status: 500 });
  }
}
