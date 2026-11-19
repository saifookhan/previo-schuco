ALTER TABLE "product_lines" ALTER COLUMN "discount_pct" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "product_lines" ALTER COLUMN "discount_pct" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "product_lines" ALTER COLUMN "markup_pct" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "product_lines" ALTER COLUMN "markup_pct" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "product_lines" ALTER COLUMN "installation_hours_per_unit" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "product_lines" ALTER COLUMN "installation_hours_per_unit" DROP NOT NULL;--> statement-breakpoint
-- Before this, an empty Excel cell was stored as 0 / 100 / 0. Those values mean "none" either way, so store them as
-- empty: a new version's share then carries the company's earlier values forward for them. Prices don't change.
UPDATE "product_lines" SET "discount_pct" = NULL WHERE "discount_pct" = 0;--> statement-breakpoint
UPDATE "product_lines" SET "markup_pct" = NULL WHERE "markup_pct" = 100;--> statement-breakpoint
UPDATE "product_lines" SET "installation_hours_per_unit" = NULL WHERE "installation_hours_per_unit" = 0;
