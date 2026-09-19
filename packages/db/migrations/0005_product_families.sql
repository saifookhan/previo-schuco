CREATE TABLE "characteristics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_family_id" uuid NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"is_applicable" boolean DEFAULT true NOT NULL,
	"formula" text,
	"value" numeric(14, 4),
	"pricing_matrix_id" uuid,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pricing_matrices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_family_id" uuid NOT NULL,
	"widths" jsonb NOT NULL,
	"heights" jsonb NOT NULL,
	"matrix" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_families" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplier_company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"technical_name" text,
	"category" text,
	"brand" text,
	"description_1" text,
	"description_2" text,
	"version" integer DEFAULT 1 NOT NULL,
	"supersedes_id" uuid,
	"duplicated_from_id" uuid,
	"is_published" boolean DEFAULT false NOT NULL,
	"source_excel_path" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_family_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_family_id" uuid NOT NULL,
	"title" text,
	"local_path" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_line_characteristics" (
	"product_line_id" uuid NOT NULL,
	"characteristic_id" uuid NOT NULL,
	CONSTRAINT "product_line_characteristics_product_line_id_characteristic_id_pk" PRIMARY KEY("product_line_id","characteristic_id")
);
--> statement-breakpoint
CREATE TABLE "product_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_family_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"formula" text DEFAULT 'valore' NOT NULL,
	"value" numeric(14, 4) DEFAULT '0' NOT NULL,
	"pricing_matrix_id" uuid,
	"unit_name" text NOT NULL,
	"unit_symbol" text NOT NULL,
	"discount_pct" numeric(8, 4) DEFAULT '0' NOT NULL,
	"markup_pct" numeric(8, 4) DEFAULT '100' NOT NULL,
	"installation_hours_per_unit" numeric(14, 4) DEFAULT '0' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "characteristics" ADD CONSTRAINT "characteristics_product_family_id_product_families_id_fk" FOREIGN KEY ("product_family_id") REFERENCES "public"."product_families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "characteristics" ADD CONSTRAINT "characteristics_parent_id_characteristics_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."characteristics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "characteristics" ADD CONSTRAINT "characteristics_pricing_matrix_id_pricing_matrices_id_fk" FOREIGN KEY ("pricing_matrix_id") REFERENCES "public"."pricing_matrices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pricing_matrices" ADD CONSTRAINT "pricing_matrices_product_family_id_product_families_id_fk" FOREIGN KEY ("product_family_id") REFERENCES "public"."product_families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_families" ADD CONSTRAINT "product_families_supplier_company_id_companies_id_fk" FOREIGN KEY ("supplier_company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_families" ADD CONSTRAINT "product_families_supersedes_id_product_families_id_fk" FOREIGN KEY ("supersedes_id") REFERENCES "public"."product_families"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_families" ADD CONSTRAINT "product_families_duplicated_from_id_product_families_id_fk" FOREIGN KEY ("duplicated_from_id") REFERENCES "public"."product_families"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_family_images" ADD CONSTRAINT "product_family_images_product_family_id_product_families_id_fk" FOREIGN KEY ("product_family_id") REFERENCES "public"."product_families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_line_characteristics" ADD CONSTRAINT "product_line_characteristics_product_line_id_product_lines_id_fk" FOREIGN KEY ("product_line_id") REFERENCES "public"."product_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_line_characteristics" ADD CONSTRAINT "product_line_characteristics_characteristic_id_characteristics_id_fk" FOREIGN KEY ("characteristic_id") REFERENCES "public"."characteristics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_lines" ADD CONSTRAINT "product_lines_product_family_id_product_families_id_fk" FOREIGN KEY ("product_family_id") REFERENCES "public"."product_families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_lines" ADD CONSTRAINT "product_lines_pricing_matrix_id_pricing_matrices_id_fk" FOREIGN KEY ("pricing_matrix_id") REFERENCES "public"."pricing_matrices"("id") ON DELETE set null ON UPDATE no action;