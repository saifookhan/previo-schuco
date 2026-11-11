ALTER TABLE "characteristics" ADD COLUMN "min_value" numeric(14, 4);--> statement-breakpoint
ALTER TABLE "characteristics" ADD COLUMN "discount_pct" numeric(8, 4);--> statement-breakpoint
ALTER TABLE "characteristics" ADD COLUMN "markup_pct" numeric(8, 4);--> statement-breakpoint
ALTER TABLE "characteristics" ADD COLUMN "installation_hours_per_unit" numeric(14, 4);--> statement-breakpoint
ALTER TABLE "product_families" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "product_families" ADD COLUMN "distributor" text;--> statement-breakpoint
ALTER TABLE "product_lines" ADD COLUMN "min_value" numeric(14, 4);--> statement-breakpoint
ALTER TABLE "quote_position_characteristics" ADD COLUMN "discount_pct" numeric(8, 4);--> statement-breakpoint
ALTER TABLE "quote_position_characteristics" ADD COLUMN "markup_pct" numeric(8, 4);