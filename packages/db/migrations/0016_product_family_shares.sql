CREATE TABLE "product_family_shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_family_id" uuid NOT NULL,
	"from_company_id" uuid NOT NULL,
	"to_company_id" uuid NOT NULL,
	"discount_pct" numeric(5, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_family_shares_no_self_share" CHECK ("product_family_shares"."from_company_id" <> "product_family_shares"."to_company_id"),
	CONSTRAINT "product_family_shares_discount_range" CHECK ("product_family_shares"."discount_pct" >= 0 AND "product_family_shares"."discount_pct" <= 100)
);
--> statement-breakpoint
ALTER TABLE "product_family_shares" ADD CONSTRAINT "product_family_shares_product_family_id_product_families_id_fk" FOREIGN KEY ("product_family_id") REFERENCES "public"."product_families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_family_shares" ADD CONSTRAINT "product_family_shares_from_company_id_companies_id_fk" FOREIGN KEY ("from_company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_family_shares" ADD CONSTRAINT "product_family_shares_to_company_id_companies_id_fk" FOREIGN KEY ("to_company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "product_family_shares_family_from_to_idx" ON "product_family_shares" USING btree ("product_family_id","from_company_id","to_company_id");--> statement-breakpoint
CREATE INDEX "product_family_shares_to_company_idx" ON "product_family_shares" USING btree ("to_company_id");--> statement-breakpoint
-- Company-level links become per-family shares: every existing link shares each family the manufacturer owns, at 0% discount.
INSERT INTO "product_family_shares" ("product_family_id", "from_company_id", "to_company_id", "discount_pct")
SELECT pf."id", l."supplier_company_id", l."client_company_id", 0
FROM "supplier_client_links" l
JOIN "product_families" pf ON pf."supplier_company_id" = l."supplier_company_id"
WHERE l."supplier_company_id" <> l."client_company_id"
ON CONFLICT DO NOTHING;--> statement-breakpoint
DROP TABLE "supplier_client_links" CASCADE;--> statement-breakpoint
-- If a custom role matrix was already saved, keep it consistent with the permission changes in code: catalog.share is new, links.manage is gone.
INSERT INTO "role_permissions" ("role_id", "permission")
SELECT r."role_id", 'catalog.share'
FROM (VALUES ('super-admin'), ('company-admin'), ('super-user')) AS r("role_id")
WHERE EXISTS (SELECT 1 FROM "role_permissions")
  AND EXISTS (SELECT 1 FROM "roles" WHERE "roles"."id" = r."role_id")
  AND EXISTS (SELECT 1 FROM "role_permissions" rp WHERE rp."role_id" = r."role_id" AND rp."permission" = 'catalog.view')
ON CONFLICT DO NOTHING;--> statement-breakpoint
DELETE FROM "role_permissions" WHERE "permission" = 'links.manage';
