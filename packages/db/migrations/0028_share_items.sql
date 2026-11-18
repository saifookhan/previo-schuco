CREATE TABLE "product_family_share_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"share_id" uuid NOT NULL,
	"product_line_id" uuid,
	"characteristic_id" uuid,
	"discount_pct" numeric(8, 4) DEFAULT '0' NOT NULL,
	"markup_pct" numeric(8, 4) DEFAULT '100' NOT NULL,
	"installation_hours_per_unit" numeric(14, 4) DEFAULT '0' NOT NULL,
	CONSTRAINT "product_family_share_items_one_item" CHECK (("product_family_share_items"."product_line_id" IS NULL) <> ("product_family_share_items"."characteristic_id" IS NULL)),
	CONSTRAINT "product_family_share_items_discount_range" CHECK ("product_family_share_items"."discount_pct" >= 0 AND "product_family_share_items"."discount_pct" <= 100),
	CONSTRAINT "product_family_share_items_markup_range" CHECK ("product_family_share_items"."markup_pct" >= 0 AND "product_family_share_items"."markup_pct" <= 10000),
	CONSTRAINT "product_family_share_items_hours_range" CHECK ("product_family_share_items"."installation_hours_per_unit" >= 0)
);
--> statement-breakpoint
ALTER TABLE "product_family_shares" DROP CONSTRAINT "product_family_shares_discount_range";--> statement-breakpoint
ALTER TABLE "product_family_share_items" ADD CONSTRAINT "product_family_share_items_share_id_product_family_shares_id_fk" FOREIGN KEY ("share_id") REFERENCES "public"."product_family_shares"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_family_share_items" ADD CONSTRAINT "product_family_share_items_product_line_id_product_lines_id_fk" FOREIGN KEY ("product_line_id") REFERENCES "public"."product_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_family_share_items" ADD CONSTRAINT "product_family_share_items_characteristic_id_characteristics_id_fk" FOREIGN KEY ("characteristic_id") REFERENCES "public"."characteristics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "product_family_share_items_share_line_idx" ON "product_family_share_items" USING btree ("share_id","product_line_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_family_share_items_share_characteristic_idx" ON "product_family_share_items" USING btree ("share_id","characteristic_id");--> statement-breakpoint
CREATE INDEX "product_family_share_items_product_line_id_idx" ON "product_family_share_items" USING btree ("product_line_id");--> statement-breakpoint
CREATE INDEX "product_family_share_items_characteristic_id_idx" ON "product_family_share_items" USING btree ("characteristic_id");--> statement-breakpoint
-- Existing shares keep their discount, now on every product line and option of the family (a share
-- at 0% meant "the line's own discount"); markup and hours start from the family's own values (an
-- option without any: none).
INSERT INTO "product_family_share_items" ("share_id", "product_line_id", "discount_pct", "markup_pct", "installation_hours_per_unit")
SELECT s."id", l."id", CASE WHEN s."discount_pct" > 0 THEN s."discount_pct" ELSE l."discount_pct" END, l."markup_pct", l."installation_hours_per_unit"
FROM "product_family_shares" s JOIN "product_lines" l ON l."product_family_id" = s."product_family_id";--> statement-breakpoint
INSERT INTO "product_family_share_items" ("share_id", "characteristic_id", "discount_pct", "markup_pct", "installation_hours_per_unit")
SELECT s."id", c."id",
  CASE WHEN s."discount_pct" > 0 THEN s."discount_pct" ELSE coalesce(c."discount_pct", 0) END,
  coalesce(c."markup_pct", 100), coalesce(c."installation_hours_per_unit", 0)
FROM "product_family_shares" s JOIN "characteristics" c ON c."product_family_id" = s."product_family_id" AND c."parent_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "product_family_shares" DROP COLUMN "discount_pct";