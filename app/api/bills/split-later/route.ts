import { NextResponse } from "next/server";
import { z } from "zod";
import { createSplitLaterBill } from "@/lib/db/bills";
import { itemAssignmentSchema, normalizedBillDraftSchema } from "@/lib/schemas/bill";

const splitLaterSchema = z.object({
  householdId: z.string().min(1),
  draft: normalizedBillDraftSchema,
  assignments: z.array(itemAssignmentSchema).default([]),
});

export async function POST(request: Request) {
  try {
    const payload = splitLaterSchema.parse(await request.json());
    const bill = await createSplitLaterBill({
      householdId: payload.householdId,
      draft: payload.draft,
      assignments: payload.assignments,
    });
    return NextResponse.json({ bill }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save split-later bill.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
