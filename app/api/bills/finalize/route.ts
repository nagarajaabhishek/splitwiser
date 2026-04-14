import { NextResponse } from "next/server";
import { z } from "zod";
import { listLearnedDefaults } from "@/lib/db/learned-defaults";
import { createFinalizedBill } from "@/lib/db/bills";
import { runSplitAgentAutonomous } from "@/lib/engine/agent";
import { normalizedBillDraftSchema, itemAssignmentSchema, memberSchema } from "@/lib/schemas/bill";

const finalizeSchema = z.object({
  householdId: z.string().min(1),
  draft: normalizedBillDraftSchema,
  assignments: z.array(itemAssignmentSchema),
  members: z.array(memberSchema),
  confirmedReviewItemIds: z.array(z.string()).optional(),
  allowOverride: z.boolean().optional(),
});

export async function POST(request: Request) {
  try {
    const payload = finalizeSchema.parse(await request.json());
    const learnedDefaults = await listLearnedDefaults(payload.members.map((member) => member.id));
    const agentCheck = await runSplitAgentAutonomous({
      draft: payload.draft,
      members: payload.members,
      learnedDefaults,
      manualAssignments: payload.assignments,
      confirmedReviewItemIds: payload.confirmedReviewItemIds,
    });

    if (agentCheck.unresolvedReviewItemIds.length > 0 && !payload.allowOverride) {
      return NextResponse.json(
        {
          error: "Finalize blocked: unresolved review items exist.",
          unresolvedReviewItemIds: agentCheck.unresolvedReviewItemIds,
        },
        { status: 409 },
      );
    }

    const bill = await createFinalizedBill({
      householdId: payload.householdId,
      draft: payload.draft,
      assignments: payload.assignments,
      members: payload.members,
      learnedDefaults,
    });

    return NextResponse.json({ bill }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to finalize bill";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
