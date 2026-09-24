CREATE TYPE "public"."quote_status" AS ENUM('draft', 'sent', 'accepted', 'rejected');--> statement-breakpoint
CREATE TABLE "quote_position_characteristics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quote_position_id" uuid NOT NULL,
	"characteristic_id" uuid NOT NULL,
	"sub_characteristic_id" uuid NOT NULL,
	"characteristic_name" text NOT NULL,
	"sub_characteristic_name" text NOT NULL,
	"price" numeric(14, 2) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quote_positions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quote_id" uuid NOT NULL,
	"product_family_id" uuid NOT NULL,
	"product_line_id" uuid NOT NULL,
	"product_family_name" text NOT NULL,
	"product_line_name" text NOT NULL,
	"position_code" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"width_mm" numeric(10, 2) NOT NULL,
	"height_mm" numeric(10, 2) NOT NULL,
	"description" text NOT NULL,
	"unit_name" text NOT NULL,
	"unit_symbol" text NOT NULL,
	"discount_pct" numeric(8, 4) DEFAULT '0' NOT NULL,
	"extra_markup_pct" numeric(8, 4) DEFAULT '100' NOT NULL,
	"total_m2" numeric(12, 4) NOT NULL,
	"base_price" numeric(14, 2) NOT NULL,
	"final_price" numeric(14, 2) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_company_id" uuid NOT NULL,
	"created_by_user_id" uuid,
	"reference" text NOT NULL,
	"status" "quote_status" DEFAULT 'draft' NOT NULL,
	"customer_name" text NOT NULL,
	"customer_fiscal_code" text,
	"customer_address" text,
	"customer_city" text,
	"project_location" text,
	"intro_text" text,
	"payment_terms" text,
	"validity_days" integer DEFAULT 30 NOT NULL,
	"total_price" numeric(14, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quote_position_characteristics" ADD CONSTRAINT "quote_position_characteristics_quote_position_id_quote_positions_id_fk" FOREIGN KEY ("quote_position_id") REFERENCES "public"."quote_positions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_position_characteristics" ADD CONSTRAINT "quote_position_characteristics_characteristic_id_characteristics_id_fk" FOREIGN KEY ("characteristic_id") REFERENCES "public"."characteristics"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_position_characteristics" ADD CONSTRAINT "quote_position_characteristics_sub_characteristic_id_characteristics_id_fk" FOREIGN KEY ("sub_characteristic_id") REFERENCES "public"."characteristics"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_positions" ADD CONSTRAINT "quote_positions_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_positions" ADD CONSTRAINT "quote_positions_product_family_id_product_families_id_fk" FOREIGN KEY ("product_family_id") REFERENCES "public"."product_families"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_positions" ADD CONSTRAINT "quote_positions_product_line_id_product_lines_id_fk" FOREIGN KEY ("product_line_id") REFERENCES "public"."product_lines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_supplier_company_id_companies_id_fk" FOREIGN KEY ("supplier_company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;