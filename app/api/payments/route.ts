import { NextResponse } from "next/server";
import { z } from "zod";
import { createPayment, listPayments } from "@/lib/db/payments";

const createPaymentSchema = z.object({
  householdId: z.string().min(1),
  fromMemberId: z.string().min(1),
  toMemberId: z.string().min(1),
  amountCents: z.number().int().positive(),
  method: z.enum(["cash", "bank_transfer", "upi", "venmo", "paypal", "other"]).optional(),
  note: z.string().optional(),
  externalRef: z.string().optional(),
  paidAt: z.string().datetime().optional(),
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const householdId = searchParams.get("householdId");
  if (!householdId) return NextResponse.json({ payments: [] });
  const payments = await listPayments(householdId);
  return NextResponse.json({ payments });
}

export async function POST(request: Request) {
  try {
    const input = createPaymentSchema.parse(await request.json());
    if (input.fromMemberId === input.toMemberId) {
      return NextResponse.json({ error: "Payer and payee must be different." }, { status: 400 });
    }
    const payment = await createPayment(input);
    return NextResponse.json({ payment }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create payment";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
