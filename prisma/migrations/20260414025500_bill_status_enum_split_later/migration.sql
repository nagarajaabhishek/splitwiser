DO $$
BEGIN
  CREATE TYPE "BillStatus" AS ENUM ('draft', 'split_later', 'finalized');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

ALTER TABLE "bills"
ALTER COLUMN "status" TYPE "BillStatus"
USING ("status"::text::"BillStatus");

ALTER TABLE "bills"
ALTER COLUMN "status" SET DEFAULT 'draft';
