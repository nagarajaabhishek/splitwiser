-- Member profile fields exist in schema.prisma but were never added via earlier SQL migrations
-- (only via db push in some environments). Idempotent for production drift.
ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "dietaryStyle" TEXT;
ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "allergies" JSONB;
ALTER TABLE "members" ADD COLUMN IF NOT EXISTS "exclusions" JSONB;

-- Belt-and-suspenders if ledger migration was skipped or partial.
ALTER TABLE "households" ADD COLUMN IF NOT EXISTS "defaultCurrency" TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE "households" ADD COLUMN IF NOT EXISTS "monthlyBudgetCents" INTEGER;
