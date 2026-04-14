-- Add read-only public sharing metadata to bills.
ALTER TABLE "bills"
ADD COLUMN "shareToken" TEXT,
ADD COLUMN "sharedAt" TIMESTAMP(3);

-- Enforce uniqueness for generated public tokens.
CREATE UNIQUE INDEX "bills_shareToken_key" ON "bills"("shareToken");
