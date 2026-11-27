ALTER TABLE "quote_versions" ADD COLUMN "alternative" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "quote_versions" ADD COLUMN "is_final" boolean DEFAULT false NOT NULL;--> statement-breakpoint
DROP INDEX "quote_versions_quote_id_version_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "quote_versions_quote_id_version_alternative_idx" ON "quote_versions" USING btree ("quote_id","version","alternative");--> statement-breakpoint
CREATE UNIQUE INDEX "quote_versions_one_final_idx" ON "quote_versions" USING btree ("quote_id") WHERE "is_final";
