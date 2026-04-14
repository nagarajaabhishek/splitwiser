-- Per-line product category for analytics and split views.
ALTER TABLE "bill_items" ADD COLUMN IF NOT EXISTS "productCategory" TEXT;
