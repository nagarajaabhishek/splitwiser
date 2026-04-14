import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

type ActivityType = "expense_created" | "expense_updated" | "expense_finalized" | "expense_split_later" | "payment_recorded";

export async function logActivity(params: {
  householdId: string;
  type: ActivityType;
  message: string;
  billId?: string;
  actorMemberId?: string;
  metadata?: Prisma.InputJsonValue;
}) {
  const { householdId, type, message, billId, actorMemberId, metadata } = params;
  await prisma.activityLog.create({
    data: {
      householdId,
      type,
      message,
      billId,
      actorMemberId,
      metadata,
    },
  });
}

export async function listActivity(householdId: string, limit = 30) {
  const entries = await prisma.activityLog.findMany({
    where: { householdId },
    include: {
      actor: { select: { id: true, name: true } },
      bill: { select: { id: true, merchantName: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return entries.map((entry) => ({
    id: entry.id,
    type: entry.type,
    message: entry.message,
    createdAt: entry.createdAt.toISOString(),
    actor: entry.actor,
    bill: entry.bill,
    metadata: entry.metadata,
  }));
}
