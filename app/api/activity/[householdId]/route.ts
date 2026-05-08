import { NextResponse } from "next/server";
import { listActivity } from "@/lib/db/activity";

export async function GET(_request: Request, context: { params: Promise<{ householdId: string }> }) {
  const { householdId } = await context.params;
  try {
    const entries = await listActivity(householdId);
    return NextResponse.json({ entries });
  } catch (err) {
    console.error("[activity] listActivity failed:", err);
    return NextResponse.json({ entries: [], error: "Failed to load activity." }, { status: 500 });
  }
}
