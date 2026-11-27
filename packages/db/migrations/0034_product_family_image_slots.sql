ALTER TABLE "product_family_images" ALTER COLUMN "local_path" DROP NOT NULL;--> statement-breakpoint
UPDATE "product_family_images"
SET "title" = CASE "sort_order"
  WHEN 0 THEN 'Generale'
  WHEN 1 THEN 'Dettaglio'
  WHEN 2 THEN 'Sezione'
END
WHERE "sort_order" IN (0, 1, 2) AND ("title" IS NULL OR btrim("title") = '');--> statement-breakpoint
INSERT INTO "product_family_images" ("product_family_id", "title", "local_path", "sort_order")
SELECT pf.id, titles.title, NULL, titles.sort_order
FROM "product_families" pf
CROSS JOIN (VALUES
  (0, 'Generale'),
  (1, 'Dettaglio'),
  (2, 'Sezione')
) AS titles(sort_order, title)
WHERE NOT EXISTS (
  SELECT 1 FROM "product_family_images" img
  WHERE img.product_family_id = pf.id AND img.sort_order = titles.sort_order
);
