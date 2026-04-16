-- Persist user-corrected receipt labels for future auto-normalization.
CREATE TABLE IF NOT EXISTS "label_corrections" (
  "id" TEXT NOT NULL,
  "householdId" TEXT,
  "merchantNormalized" TEXT NOT NULL,
  "sourceNormalized" TEXT NOT NULL,
  "correctedLabel" TEXT NOT NULL,
  "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.9,
  "uses" INTEGER NOT NULL DEFAULT 1,
  "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "label_corrections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "label_corrections_merchantNormalized_sourceNormalized_key"
  ON "label_corrections"("merchantNormalized", "sourceNormalized");
CREATE INDEX IF NOT EXISTS "label_corrections_merchantNormalized_sourceNormalized_idx"
  ON "label_corrections"("merchantNormalized", "sourceNormalized");
CREATE INDEX IF NOT EXISTS "label_corrections_householdId_merchantNormalized_idx"
  ON "label_corrections"("householdId", "merchantNormalized");

DO $$ BEGIN
  ALTER TABLE "label_corrections"
  ADD CONSTRAINT "label_corrections_householdId_fkey"
  FOREIGN KEY ("householdId") REFERENCES "households"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
