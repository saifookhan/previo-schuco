ALTER TABLE "quote_versions" ADD COLUMN "is_favorite" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE TABLE "product_family_favorites" (
	"company_id" uuid NOT NULL,
	"product_family_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_family_favorites_company_id_product_family_id_pk" PRIMARY KEY("company_id","product_family_id")
);--> statement-breakpoint
ALTER TABLE "product_family_favorites" ADD CONSTRAINT "product_family_favorites_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_family_favorites" ADD CONSTRAINT "product_family_favorites_product_family_id_product_families_id_fk" FOREIGN KEY ("product_family_id") REFERENCES "public"."product_families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_family_favorites_family_idx" ON "product_family_favorites" USING btree ("product_family_id");
