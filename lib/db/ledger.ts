import { prisma } from "@/lib/db/prisma";
import { computeSettlements } from "@/lib/engine/settlement";

type BalanceEntry = { memberId: string; memberName: string; balanceCents: number };

export async function getHouseholdLedger(householdId: string) {
  const household = await prisma.household.findUnique({
    where: { id: householdId },
    include: {
      members: { select: { id: true, name: true } },
      bills: {
        where: { status: "finalized" },
        include: { transactions: true },
      },
      payments: true,
    },
  });
  if (!household) return null;

  const memberCount = Math.max(1, household.members.length);
  const balances = new Map<string, number>(household.members.map((m) => [m.id, 0]));

  for (const bill of household.bills) {
    const equalShare = Math.round(bill.totalCents / memberCount);
    const membersByBill = new Set(bill.transactions.map((transaction) => transaction.memberId));
    for (const member of household.members) {
      if (!membersByBill.has(member.id)) {
        balances.set(member.id, (balances.get(member.id) ?? 0) + equalShare);
      }
    }
    for (const transaction of bill.transactions) {
      balances.set(transaction.memberId, (balances.get(transaction.memberId) ?? 0) + equalShare - transaction.totalCents);
    }
  }

  for (const payment of household.payments) {
    balances.set(payment.fromMemberId, (balances.get(payment.fromMemberId) ?? 0) + payment.amountCents);
    balances.set(payment.toMemberId, (balances.get(payment.toMemberId) ?? 0) - payment.amountCents);
  }

  const entries: BalanceEntry[] = household.members.map((member) => ({
    memberId: member.id,
    memberName: member.name,
    balanceCents: balances.get(member.id) ?? 0,
  }));
  const settlements = computeSettlements(entries);

  return {
    householdId: household.id,
    householdName: household.name,
    currency: household.defaultCurrency,
    balances: entries,
    settlements,
  };
}
