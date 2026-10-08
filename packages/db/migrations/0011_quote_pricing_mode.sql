CREATE TYPE "public"."pricing_mode" AS ENUM('auto', 'manual');--> statement-breakpoint
ALTER TABLE "quote_position_characteristics" ADD COLUMN "pricing_mode" "pricing_mode" DEFAULT 'auto' NOT NULL;--> statement-breakpoint
ALTER TABLE "quote_position_characteristics" ADD COLUMN "manual_unit_price" numeric(14, 4);--> statement-breakpoint
ALTER TABLE "quote_positions" ADD COLUMN "pricing_mode" "pricing_mode" DEFAULT 'auto' NOT NULL;--> statement-breakpoint
ALTER TABLE "quote_positions" ADD COLUMN "line_manual_unit_price" numeric(14, 4);