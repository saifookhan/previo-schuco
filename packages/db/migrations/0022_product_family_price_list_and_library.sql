CREATE TABLE "product_family_library_hidden" (
	"company_id" uuid NOT NULL,
	"product_family_id" uuid NOT NULL,
	"hidden_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_family_library_hidden_company_id_product_family_id_pk" PRIMARY KEY("company_id","product_family_id")
);
--> statement-breakpoint
ALTER TABLE "product_families" ADD COLUMN "has_price_list" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "product_family_library_hidden" ADD CONSTRAINT "product_family_library_hidden_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_family_library_hidden" ADD CONSTRAINT "product_family_library_hidden_product_family_id_product_families_id_fk" FOREIGN KEY ("product_family_id") REFERENCES "public"."product_families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_family_library_hidden" ADD CONSTRAINT "product_family_library_hidden_hidden_by_user_id_users_id_fk" FOREIGN KEY ("hidden_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_family_library_hidden_family_idx" ON "product_family_library_hidden" USING btree ("product_family_id");