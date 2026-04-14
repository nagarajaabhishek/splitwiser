import { prisma } from "@/lib/db/prisma";

function monthKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function getHouseholdAnalytics(householdId: string) {
  const household = await prisma.household.findUnique({
    where: { id: householdId },
    include: {
      members: { select: { id: true, name: true } },
      bills: {
        where: { status: "finalized" },
        select: { totalCents: true, billDate: true, category: true },
      },
    },
  });
  if (!household) return null;

  const spendByMonth = new Map<string, number>();
  const spendByCategory = new Map<string, number>();

  for (const bill of household.bills) {
    const key = monthKey(bill.billDate);
    spendByMonth.set(key, (spendByMonth.get(key) ?? 0) + bill.totalCents);
    const category = bill.category ?? "uncategorized";
    spendByCategory.set(category, (spendByCategory.get(category) ?? 0) + bill.totalCents);
  }

  return {
    householdId: household.id,
    budget: {
      monthlyBudgetCents: household.monthlyBudgetCents,
      defaultCurrency: household.defaultCurrency,
    },
    totals: {
      finalizedBills: household.bills.length,
      totalSpendCents: household.bills.reduce((sum, bill) => sum + bill.totalCents, 0),
    },
    spendByMonth: [...spendByMonth.entries()].map(([month, totalCents]) => ({ month, totalCents })),
    spendByCategory: [...spendByCategory.entries()].map(([category, totalCents]) => ({ category, totalCents })),
  };
}
