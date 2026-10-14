ALTER TABLE "companies" ADD COLUMN "is_platform" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "is_manufacturer" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "is_supplier" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "is_client" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "companies" SET "is_platform" = true WHERE "type" = 'platform';--> statement-breakpoint
UPDATE "companies" SET "is_manufacturer" = true, "is_supplier" = true WHERE "type" = 'supplier';--> statement-breakpoint
UPDATE "companies" SET "is_client" = true WHERE "type" = 'client';--> statement-breakpoint
ALTER TABLE "companies" DROP COLUMN "type";--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_has_capability" CHECK ("companies"."is_platform" OR "companies"."is_manufacturer" OR "companies"."is_supplier" OR "companies"."is_client");--> statement-breakpoint
ALTER TABLE "supplier_client_links" ADD CONSTRAINT "supplier_client_links_no_self_link" CHECK ("supplier_client_links"."supplier_company_id" <> "supplier_client_links"."client_company_id");--> statement-breakpoint
DROP TYPE "public"."company_type";