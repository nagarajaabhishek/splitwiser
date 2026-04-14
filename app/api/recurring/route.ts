import { NextResponse } from "next/server";
import { z } from "zod";
import { createRecurringExpense, listRecurringExpenses } from "@/lib/db/recurring-expenses";

const recurringSchema = z.object({
  householdId: z.string().min(1),
  title: z.string().min(1),
  amountCents: z.number().int().positive(),
  currency: z.string().length(3).optional(),
  category: z.string().optional(),
  cadence: z.string().min(1),
  nextRunAt: z.string().datetime(),
  splitConfig: z.any().optional(),
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const householdId = searchParams.get("householdId");
  if (!householdId) return NextResponse.json({ recurringExpenses: [] });
  const recurringExpenses = await listRecurringExpenses(householdId);
  return NextResponse.json({ recurringExpenses });
}

export async function POST(request: Request) {
  try {
    const input = recurringSchema.parse(await request.json());
    const recurringExpense = await createRecurringExpense(input);
    return NextResponse.json({ recurringExpense }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create recurring expense";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
