import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { runSplitAgent, runSplitAgentAutonomous, type LearnedDefaultRecord } from "@/lib/engine/agent";
import { computeSettlements } from "@/lib/engine/settlement";
import type { ItemAssignment, ItemEnrichment, Member, NormalizedBillDraft, NormalizedBillItem } from "@/lib/schemas/bill";
import { listLearnedDefaults, upsertLearnedDefaults } from "@/lib/db/learned-defaults";
import { randomBytes } from "node:crypto";
import { logActivity } from "@/lib/db/activity";
import { applyCategorizationToDraft } from "@/lib/categorization/infer";

function mapEnrichmentFromDb(value: Prisma.JsonValue | null): ItemEnrichment | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as ItemEnrichment;
}

function draftItemToBillItemCreate(item: NormalizedBillItem, assignment: ItemAssignment | undefined) {
  return {
    label: item.label,
    normalizedLabel: item.normalizedLabel,
    quantity: item.quantity,
    unitPriceCents: item.unitPriceCents,
    lineTotalCents: item.lineTotalCents,
    originalLabel: item.originalLabel ?? null,
    rawLineText: item.rawLineText ?? null,
    upc: item.upc ?? null,
    itemCode: item.itemCode ?? null,
    department: item.department ?? null,
    enrichmentMeta: item.enrichment ? (item.enrichment as Prisma.InputJsonValue) : Prisma.JsonNull,
    productCategory: item.productCategory ?? null,
    assignedMemberId: pickPrimaryAssignee(assignment),
  };
}

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
  existingBillId?: string;
}) {
  const { householdId, draft, assignments, members, learnedDefaults, existingBillId } = params;
  const agentResult = runSplitAgent({
    draft,
    members,
    learnedDefaults,
    manualAssignments: assignments,
  });

  const createItems = draft.items.map((item) => draftItemToBillItemCreate(item, assignments.find((entry) => entry.itemId === item.id)));
  const createTransactions = agentResult.totals.memberTotals.map((entry) => ({
    memberId: entry.memberId,
    subtotalCents: entry.subtotalCents,
    taxCents: entry.taxCents,
    totalCents: entry.totalCents,
  }));

  let bill;
  if (existingBillId) {
    const existing = await prisma.bill.findFirst({
      where: { id: existingBillId, householdId, status: "split_later" },
      select: { id: true },
    });
    if (!existing) {
      throw new Error("SPLIT_LATER_BILL_NOT_FOUND");
    }
    bill = await prisma.bill.update({
      where: { id: existingBillId },
      data: {
        merchantName: draft.merchantName,
        billDate: new Date(draft.billDate),
        subtotalCents: draft.subtotalCents,
        taxCents: draft.taxCents,
        totalCents: draft.totalCents,
        currency: draft.currency,
        category: draft.expenseCategory ?? null,
        status: "finalized",
        billItems: {
          deleteMany: {},
          create: createItems,
        },
        transactions: {
          deleteMany: {},
          create: createTransactions,
        },
      },
      include: {
        transactions: {
          include: { member: true },
        },
      },
    });
  } else {
    bill = await prisma.bill.create({
      data: {
        householdId,
        merchantName: draft.merchantName,
        billDate: new Date(draft.billDate),
        subtotalCents: draft.subtotalCents,
        taxCents: draft.taxCents,
        totalCents: draft.totalCents,
        currency: draft.currency,
        category: draft.expenseCategory ?? null,
        status: "finalized",
        billItems: {
          create: createItems,
        },
        transactions: {
          create: createTransactions,
        },
      },
      include: {
        transactions: {
          include: { member: true },
        },
      },
    });
  }

  await upsertLearnedDefaults(agentResult.learnedDefaultsUpserts);
  await logActivity({
    householdId,
    billId: bill.id,
    type: "expense_finalized",
    message: `Finalized expense ${bill.merchantName} for $${(bill.totalCents / 100).toFixed(2)}`,
    metadata: { transactionCount: bill.transactions.length },
  });

  return {
    id: bill.id,
    merchantName: bill.merchantName,
    totalCents: bill.totalCents,
    billDate: bill.billDate.toISOString(),
    currency: bill.currency,
  };
}

function mapDbMemberToSchema(member: {
  id: string;
  name: string;
  dietaryStyle: string | null;
  allergies: unknown;
  exclusions: unknown;
}): Member {
  return {
    id: member.id,
    name: member.name,
    dietaryStyle: member.dietaryStyle,
    allergies: Array.isArray(member.allergies) ? member.allergies.filter((entry): entry is string => typeof entry === "string") : [],
    exclusions: Array.isArray(member.exclusions) ? member.exclusions.filter((entry): entry is string => typeof entry === "string") : [],
  };
}

export async function createSplitLaterBill(params: {
  householdId: string;
  draft: NormalizedBillDraft;
  assignments: ItemAssignment[];
}) {
  const { householdId, draft, assignments } = params;
  const bill = await prisma.bill.create({
    data: {
      householdId,
      merchantName: draft.merchantName,
      billDate: new Date(draft.billDate),
      subtotalCents: draft.subtotalCents,
      taxCents: draft.taxCents,
      totalCents: draft.totalCents,
      currency: draft.currency,
      category: draft.expenseCategory ?? null,
      status: "split_later",
      billItems: {
        create: draft.items.map((item) => draftItemToBillItemCreate(item, assignments.find((entry) => entry.itemId === item.id))),
      },
    },
  });
  await logActivity({
    householdId,
    billId: bill.id,
    type: "expense_split_later",
    message: `Saved split-later draft for ${bill.merchantName}`,
  });

  return {
    id: bill.id,
    merchantName: bill.merchantName,
    totalCents: bill.totalCents,
    billDate: bill.billDate.toISOString(),
    status: bill.status,
    currency: bill.currency,
  };
}

export async function loadSplitLaterBillForResume(billId: string) {
  const bill = await prisma.bill.findUnique({
    where: { id: billId },
    include: {
      household: {
        include: {
          members: true,
        },
      },
      billItems: true,
    },
  });
  if (!bill || bill.status !== "split_later") return null;

  const members = bill.household.members.map((member) => mapDbMemberToSchema(member));
  const byItemId = new Map(bill.billItems.map((row) => [row.id, row]));
  const baseDraft: NormalizedBillDraft = {
    merchantName: bill.merchantName,
    billDate: bill.billDate.toISOString(),
    currency: bill.currency,
    subtotalCents: bill.subtotalCents,
    taxCents: bill.taxCents,
    totalCents: bill.totalCents,
    items: bill.billItems.map((item) => ({
      id: item.id,
      label: item.label,
      normalizedLabel: item.normalizedLabel,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      lineTotalCents: item.lineTotalCents,
      originalLabel: item.originalLabel ?? undefined,
      rawLineText: item.rawLineText ?? undefined,
      upc: item.upc ?? undefined,
      itemCode: item.itemCode ?? undefined,
      department: item.department ?? undefined,
      productCategory: item.productCategory ?? undefined,
      enrichment: mapEnrichmentFromDb(item.enrichmentMeta),
    })),
  };
  const inferred = applyCategorizationToDraft(baseDraft);
  const draft: NormalizedBillDraft = {
    ...inferred,
    expenseCategory: bill.category ?? inferred.expenseCategory,
    expenseCategorySource: bill.category ? "stored" : inferred.expenseCategorySource,
    expenseCategoryConfidence: bill.category ? 1 : inferred.expenseCategoryConfidence,
    items: inferred.items.map((item) => {
      const row = byItemId.get(item.id);
      if (row?.productCategory) {
        return {
          ...item,
          productCategory: row.productCategory,
          enrichment: {
            ...item.enrichment,
            source: item.enrichment?.source ?? "none",
            productCategory: row.productCategory,
          },
        };
      }
      return item;
    }),
  };

  const manualAssignments: ItemAssignment[] = bill.billItems
    .filter((item) => Boolean(item.assignedMemberId))
    .map((item) => ({
      itemId: item.id,
      memberIds: [item.assignedMemberId as string],
      mode: "single",
    }));

  const learnedDefaults = await listLearnedDefaults(members.map((member) => member.id));
  const suggestions = await runSplitAgentAutonomous({
    draft,
    members,
    learnedDefaults,
    manualAssignments: manualAssignments.length > 0 ? manualAssignments : undefined,
  });

  return {
    billId: bill.id,
    householdId: bill.householdId,
    draft,
    members,
    assignments: suggestions.assignments,
    proposals: suggestions.proposals,
    unresolvedReviewItemIds: suggestions.unresolvedReviewItemIds,
    observability: suggestions.observability,
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
    currency: bill.currency,
    category: bill.category,
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
    currency: bill.currency,
    category: bill.category,
    note: bill.note,
    items: bill.billItems.map((item) => ({
      id: item.id,
      label: item.label,
      originalLabel: item.originalLabel,
      rawLineText: item.rawLineText,
      upc: item.upc,
      itemCode: item.itemCode,
      department: item.department,
      lineTotalCents: item.lineTotalCents,
      assignedMemberId: item.assignedMemberId,
      assignedMemberName: item.assignedMember?.name ?? null,
      productCategory: item.productCategory,
      enrichment: mapEnrichmentFromDb(item.enrichmentMeta),
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

function generateShareToken(): string {
  return randomBytes(24).toString("base64url");
}

export async function createOrGetBillShareToken(billId: string): Promise<string | null> {
  const existing = await prisma.bill.findUnique({
    where: { id: billId },
    select: { id: true, status: true, shareToken: true },
  });
  if (!existing || existing.status !== "finalized") return null;
  if (existing.shareToken) return existing.shareToken;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const token = generateShareToken();
    try {
      const updated = await prisma.bill.update({
        where: { id: billId },
        data: { shareToken: token, sharedAt: new Date() },
        select: { shareToken: true },
      });
      if (updated.shareToken) return updated.shareToken;
    } catch (error) {
      const isUniqueViolation = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
      if (!isUniqueViolation) throw error;
    }
  }
  throw new Error("SHARE_TOKEN_GENERATION_FAILED");
}

export async function getSharedBillDetail(shareToken: string) {
  const bill = await prisma.bill.findFirst({
    where: { shareToken, status: "finalized" },
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
    householdName: bill.household.name,
    merchantName: bill.merchantName,
    billDate: bill.billDate.toISOString(),
    subtotalCents: bill.subtotalCents,
    taxCents: bill.taxCents,
    totalCents: bill.totalCents,
    status: bill.status,
    currency: bill.currency,
    category: bill.category,
    note: bill.note,
    items: bill.billItems.map((item) => ({
      id: item.id,
      label: item.label,
      originalLabel: item.originalLabel,
      rawLineText: item.rawLineText,
      upc: item.upc,
      itemCode: item.itemCode,
      department: item.department,
      lineTotalCents: item.lineTotalCents,
      assignedMemberId: item.assignedMemberId,
      assignedMemberName: item.assignedMember?.name ?? null,
      productCategory: item.productCategory,
      enrichment: mapEnrichmentFromDb(item.enrichmentMeta),
    })),
    transactions: bill.transactions.map((transaction) => ({
      memberId: transaction.memberId,
      memberName: transaction.member.name,
      subtotalCents: transaction.subtotalCents,
      taxCents: transaction.taxCents,
      totalCents: transaction.totalCents,
    })),
    settlements,
    shareToken: bill.shareToken,
    sharedAt: bill.sharedAt?.toISOString() ?? null,
  };
}
