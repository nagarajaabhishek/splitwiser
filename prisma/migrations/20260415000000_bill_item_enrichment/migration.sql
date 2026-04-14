-- AlterTable
ALTER TABLE "bill_items" ADD COLUMN "originalLabel" TEXT;
ALTER TABLE "bill_items" ADD COLUMN "rawLineText" TEXT;
ALTER TABLE "bill_items" ADD COLUMN "upc" TEXT;
ALTER TABLE "bill_items" ADD COLUMN "itemCode" TEXT;
ALTER TABLE "bill_items" ADD COLUMN "department" TEXT;
ALTER TABLE "bill_items" ADD COLUMN "enrichmentMeta" JSONB;
