import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { listLearnedDefaults } from "@/lib/db/learned-defaults";
import { createFinalizedBill, getBillDetail } from "@/lib/db/bills";
import { runSplitAgentAutonomous } from "@/lib/engine/agent";
import { normalizedBillDraftSchema, itemAssignmentSchema, memberSchema } from "@/lib/schemas/bill";

const finalizeSchema = z.object({
  householdId: z.string().min(1),
  sourceBillId: z.string().optional(),
  draft: normalizedBillDraftSchema,
  assignments: z.array(itemAssignmentSchema),
  members: z.array(memberSchema).min(1).max(20),
  confirmedReviewItemIds: z.array(z.string()).optional(),
  allowOverride: z.boolean().optional(),
  idempotencyKey: z.string().min(8).optional(),
});

export async function POST(request: Request) {
  try {
    const payload = finalizeSchema.parse(await request.json());
    const normalizedNames = payload.members.map((member) => member.name.trim().toLowerCase());
    if (new Set(normalizedNames).size !== normalizedNames.length) {
      return NextResponse.json({ error: "Duplicate member names are not allowed", code: "DUPLICATE_MEMBER_NAMES" }, { status: 409 });
    }

    if (payload.idempotencyKey) {
      const existing = await prisma.finalizeIdempotency.findUnique({ where: { key: payload.idempotencyKey } });
      if (existing) {
        const existingBill = await getBillDetail(existing.billId);
        return NextResponse.json({ bill: existingBill, idempotentReplay: true }, { status: 200 });
      }
    }

    const assignmentItemIds = new Set(payload.assignments.map((assignment) => assignment.itemId));
    const missingAssignments = payload.draft.items.some((item) => !assignmentItemIds.has(item.id));
    if (missingAssignments) {
      return NextResponse.json({ error: "Each draft item must have an assignment", code: "MISSING_ASSIGNMENTS" }, { status: 409 });
    }

    const learnedDefaults = await listLearnedDefaults(payload.members.map((member) => member.id));
    const agentCheck = await runSplitAgentAutonomous({
      draft: payload.draft,
      members: payload.members,
      learnedDefaults,
      manualAssignments: payload.assignments,
      confirmedReviewItemIds: payload.confirmedReviewItemIds,
    });

    const strictReviewRequired = Boolean(payload.sourceBillId);
    if (agentCheck.unresolvedReviewItemIds.length > 0 && (strictReviewRequired || !payload.allowOverride)) {
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
      existingBillId: payload.sourceBillId,
    });

    if (payload.idempotencyKey) {
      await prisma.finalizeIdempotency.create({
        data: {
          key: payload.idempotencyKey,
          householdId: payload.householdId,
          billId: bill.id,
        },
      });
    }

    return NextResponse.json({ bill }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to finalize bill";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
