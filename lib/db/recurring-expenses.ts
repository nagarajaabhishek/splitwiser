import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

export async function listRecurringExpenses(householdId: string) {
  const rows = await prisma.recurringExpense.findMany({
    where: { householdId },
    orderBy: { nextRunAt: "asc" },
  });
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    amountCents: row.amountCents,
    currency: row.currency,
    category: row.category,
    cadence: row.cadence,
    nextRunAt: row.nextRunAt.toISOString(),
    splitConfig: row.splitConfig,
    active: row.active,
  }));
}

export async function createRecurringExpense(input: {
  householdId: string;
  title: string;
  amountCents: number;
  currency?: string;
  category?: string;
  cadence: string;
  nextRunAt: string;
  splitConfig?: Prisma.InputJsonValue;
}) {
  const row = await prisma.recurringExpense.create({
    data: {
      householdId: input.householdId,
      title: input.title,
      amountCents: input.amountCents,
      currency: (input.currency ?? "USD").toUpperCase(),
      category: input.category,
      cadence: input.cadence,
      nextRunAt: new Date(input.nextRunAt),
      splitConfig: input.splitConfig,
    },
  });
  return row;
}
