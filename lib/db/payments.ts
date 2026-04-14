import { prisma } from "@/lib/db/prisma";
import { logActivity } from "@/lib/db/activity";

type PaymentMethod = "cash" | "bank_transfer" | "upi" | "venmo" | "paypal" | "other";

export async function createPayment(params: {
  householdId: string;
  fromMemberId: string;
  toMemberId: string;
  amountCents: number;
  method?: PaymentMethod;
  note?: string;
  externalRef?: string;
  paidAt?: string;
}) {
  const payment = await prisma.payment.create({
    data: {
      householdId: params.householdId,
      fromMemberId: params.fromMemberId,
      toMemberId: params.toMemberId,
      amountCents: params.amountCents,
      method: params.method ?? "other",
      note: params.note,
      externalRef: params.externalRef,
      paidAt: params.paidAt ? new Date(params.paidAt) : new Date(),
    },
    include: {
      fromMember: { select: { id: true, name: true } },
      toMember: { select: { id: true, name: true } },
    },
  });

  await logActivity({
    householdId: params.householdId,
    type: "payment_recorded",
    message: `${payment.fromMember.name} paid ${payment.toMember.name} $${(payment.amountCents / 100).toFixed(2)}`,
    actorMemberId: params.fromMemberId,
    metadata: { paymentId: payment.id, method: payment.method },
  });

  return payment;
}

export async function listPayments(householdId: string) {
  const payments = await prisma.payment.findMany({
    where: { householdId },
    include: {
      fromMember: { select: { id: true, name: true } },
      toMember: { select: { id: true, name: true } },
    },
    orderBy: { paidAt: "desc" },
    take: 50,
  });

  return payments.map((payment) => ({
    id: payment.id,
    householdId: payment.householdId,
    fromMember: payment.fromMember,
    toMember: payment.toMember,
    amountCents: payment.amountCents,
    method: payment.method,
    note: payment.note,
    externalRef: payment.externalRef,
    paidAt: payment.paidAt.toISOString(),
  }));
}
