-- Splitwise-style ledger: household defaults, bill metadata, payments, activity, recurring.
-- Safe to re-run partially via IF NOT EXISTS where supported.

-- CreateEnum
DO $$
BEGIN
  CREATE TYPE "ActivityType" AS ENUM ('expense_created', 'expense_updated', 'expense_finalized', 'expense_split_later', 'payment_recorded');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "PaymentMethod" AS ENUM ('cash', 'bank_transfer', 'upi', 'venmo', 'paypal', 'other');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable households (fixes: column households.defaultCurrency does not exist)
ALTER TABLE "households" ADD COLUMN IF NOT EXISTS "defaultCurrency" TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE "households" ADD COLUMN IF NOT EXISTS "monthlyBudgetCents" INTEGER;

-- AlterTable bills
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "category" TEXT;
ALTER TABLE "bills" ADD COLUMN IF NOT EXISTS "note" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "payments" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "fromMemberId" TEXT NOT NULL,
    "toMemberId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'other',
    "note" TEXT,
    "externalRef" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "activity_logs" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "billId" TEXT,
    "actorMemberId" TEXT,
    "type" "ActivityType" NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "recurring_expenses" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "category" TEXT,
    "cadence" TEXT NOT NULL,
    "nextRunAt" TIMESTAMP(3) NOT NULL,
    "splitConfig" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recurring_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "payments_householdId_paidAt_idx" ON "payments"("householdId", "paidAt");
CREATE INDEX IF NOT EXISTS "payments_fromMemberId_toMemberId_idx" ON "payments"("fromMemberId", "toMemberId");

CREATE INDEX IF NOT EXISTS "activity_logs_householdId_createdAt_idx" ON "activity_logs"("householdId", "createdAt");
CREATE INDEX IF NOT EXISTS "activity_logs_billId_idx" ON "activity_logs"("billId");

CREATE INDEX IF NOT EXISTS "recurring_expenses_householdId_nextRunAt_idx" ON "recurring_expenses"("householdId", "nextRunAt");

-- AddForeignKey (idempotent for re-deploys)
DO $$ BEGIN ALTER TABLE "payments" ADD CONSTRAINT "payments_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "payments" ADD CONSTRAINT "payments_fromMemberId_fkey" FOREIGN KEY ("fromMemberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "payments" ADD CONSTRAINT "payments_toMemberId_fkey" FOREIGN KEY ("toMemberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_billId_fkey" FOREIGN KEY ("billId") REFERENCES "bills"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_actorMemberId_fkey" FOREIGN KEY ("actorMemberId") REFERENCES "members"("id") ON DELETE SET NULL ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE "recurring_expenses" ADD CONSTRAINT "recurring_expenses_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
