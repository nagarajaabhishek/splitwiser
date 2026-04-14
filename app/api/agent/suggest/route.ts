import { NextResponse } from "next/server";
import { z } from "zod";
import { runSplitAgentAutonomous } from "@/lib/engine/agent";
import { normalizedBillDraftSchema, memberSchema, itemAssignmentSchema } from "@/lib/schemas/bill";
import { listLearnedDefaults } from "@/lib/db/learned-defaults";

const suggestSchema = z.object({
  draft: normalizedBillDraftSchema,
  members: z.array(memberSchema),
  manualAssignments: z.array(itemAssignmentSchema).optional(),
  confirmedReviewItemIds: z.array(z.string()).optional(),
});

export async function POST(request: Request) {
  try {
    const payload = suggestSchema.parse(await request.json());
    const learnedDefaults = await listLearnedDefaults(payload.members.map((member) => member.id));
    const result = await runSplitAgentAutonomous({
      draft: payload.draft,
      members: payload.members,
      learnedDefaults,
      manualAssignments: payload.manualAssignments,
      confirmedReviewItemIds: payload.confirmedReviewItemIds,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Suggestion generation failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
