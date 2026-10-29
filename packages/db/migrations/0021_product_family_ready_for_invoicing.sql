ALTER TABLE "product_families" ADD COLUMN "ready_for_invoicing" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Families that existed before the flag keep showing in the quote builder; only new ones start not ready.
UPDATE "product_families" SET "ready_for_invoicing" = true;
