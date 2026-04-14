import { NextResponse } from "next/server";
import { listActivity } from "@/lib/db/activity";

export async function GET(_request: Request, context: { params: Promise<{ householdId: string }> }) {
  const { householdId } = await context.params;
  const entries = await listActivity(householdId);
  return NextResponse.json({ entries });
}
