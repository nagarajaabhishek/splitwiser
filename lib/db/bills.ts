import { prisma } from "@/lib/db/prisma";
import { runSplitAgent, type LearnedDefaultRecord } from "@/lib/engine/agent";
import { computeSettlements } from "@/lib/engine/settlement";
import type { ItemAssignment, Member, NormalizedBillDraft } from "@/lib/schemas/bill";
import { upsertLearnedDefaults } from "@/lib/db/learned-defaults";

function pickPrimaryAssignee(assignment: ItemAssignment | undefined): string | null {
  if (!assignment || assignment.memberIds.length === 0) return null;
  if ((assignment.mode ?? "single") === "custom" && assignment.memberWeights?.length) {
    const winner = [...assignment.memberWeights].sort((a, b) => b.weight - a.weight)[0];
    return winner?.memberId ?? assignment.memberIds[0];
  }
  return assignment.memberIds[0];
}

export async function createFinalizedBill(params: {
  householdId: string;
  draft: NormalizedBillDraft;
  assignments: ItemAssignment[];
  members: Member[];
  learnedDefaults: LearnedDefaultRecord[];
}) {
  const { householdId, draft, assignments, members, learnedDefaults } = params;
  const agentResult = runSplitAgent({
    draft,
    members,
    learnedDefaults,
    manualAssignments: assignments,
  });

  const bill = await prisma.bill.create({
    data: {
      householdId,
      merchantName: draft.merchantName,
      billDate: new Date(draft.billDate),
      subtotalCents: draft.subtotalCents,
      taxCents: draft.taxCents,
      totalCents: draft.totalCents,
      status: "finalized",
      billItems: {
        create: draft.items.map((item) => ({
          label: item.label,
          normalizedLabel: item.normalizedLabel,
          quantity: item.quantity,
          unitPriceCents: item.unitPriceCents,
          lineTotalCents: item.lineTotalCents,
          assignedMemberId: pickPrimaryAssignee(assignments.find((entry) => entry.itemId === item.id)),
        })),
      },
      transactions: {
        create: agentResult.totals.memberTotals.map((entry) => ({
          memberId: entry.memberId,
          subtotalCents: entry.subtotalCents,
          taxCents: entry.taxCents,
          totalCents: entry.totalCents,
        })),
      },
    },
    include: {
      transactions: {
        include: { member: true },
      },
    },
  });

  await upsertLearnedDefaults(agentResult.learnedDefaultsUpserts);

  return {
    id: bill.id,
    merchantName: bill.merchantName,
    totalCents: bill.totalCents,
    billDate: bill.billDate.toISOString(),
  };
}

export async function listBillHistory(householdId: string) {
  const bills = await prisma.bill.findMany({
    where: { householdId },
    orderBy: { billDate: "desc" },
    include: {
      transactions: {
        include: { member: true },
      },
    },
    take: 20,
  });

  return bills.map((bill) => ({
    id: bill.id,
    merchantName: bill.merchantName,
    billDate: bill.billDate.toISOString(),
    totalCents: bill.totalCents,
    status: bill.status,
    memberBreakdown: bill.transactions.map((transaction) => ({
      memberId: transaction.memberId,
      memberName: transaction.member.name,
      totalCents: transaction.totalCents,
    })),
  }));
}

export async function getBillDetail(billId: string) {
  const bill = await prisma.bill.findUnique({
    where: { id: billId },
    include: {
      household: true,
      billItems: { include: { assignedMember: true } },
      transactions: { include: { member: true } },
    },
  });
  if (!bill) return null;

  const paidShare = bill.totalCents / Math.max(1, bill.transactions.length);
  const balances = bill.transactions.map((transaction) => ({
    memberId: transaction.memberId,
    memberName: transaction.member.name,
    balanceCents: Math.round(paidShare - transaction.totalCents),
  }));
  const settlements = computeSettlements(balances);

  return {
    id: bill.id,
    householdId: bill.householdId,
    householdName: bill.household.name,
    merchantName: bill.merchantName,
    billDate: bill.billDate.toISOString(),
    subtotalCents: bill.subtotalCents,
    taxCents: bill.taxCents,
    totalCents: bill.totalCents,
    status: bill.status,
    items: bill.billItems.map((item) => ({
      id: item.id,
      label: item.label,
      lineTotalCents: item.lineTotalCents,
      assignedMemberId: item.assignedMemberId,
      assignedMemberName: item.assignedMember?.name ?? null,
    })),
    transactions: bill.transactions.map((transaction) => ({
      memberId: transaction.memberId,
      memberName: transaction.member.name,
      subtotalCents: transaction.subtotalCents,
      taxCents: transaction.taxCents,
      totalCents: transaction.totalCents,
    })),
    settlements,
  };
}
