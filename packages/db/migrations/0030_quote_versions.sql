CREATE TABLE "quote_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quote_version_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"document" jsonb NOT NULL,
	"total_price" numeric(14, 2) NOT NULL,
	"changes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"from_version" integer,
	"saved_by_user_id" uuid,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quote_text_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"html" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quote_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quote_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" "quote_status" DEFAULT 'draft' NOT NULL,
	"document" jsonb NOT NULL,
	"total_price" numeric(14, 2) DEFAULT '0' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_by_user_id" uuid,
	"updated_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "business_units" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "business_units" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "business_units" ADD COLUMN "primary_color" text DEFAULT '#1E5F8C' NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "fiscal_address" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "fiscal_code" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "sdi_code" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "pec_email" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "latest_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "quote_revisions" ADD CONSTRAINT "quote_revisions_quote_version_id_quote_versions_id_fk" FOREIGN KEY ("quote_version_id") REFERENCES "public"."quote_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_revisions" ADD CONSTRAINT "quote_revisions_saved_by_user_id_users_id_fk" FOREIGN KEY ("saved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_text_templates" ADD CONSTRAINT "quote_text_templates_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_versions" ADD CONSTRAINT "quote_versions_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_versions" ADD CONSTRAINT "quote_versions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_versions" ADD CONSTRAINT "quote_versions_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "quote_revisions_quote_version_id_revision_idx" ON "quote_revisions" USING btree ("quote_version_id","revision");--> statement-breakpoint
CREATE INDEX "quote_text_templates_company_id_idx" ON "quote_text_templates" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quote_versions_quote_id_version_idx" ON "quote_versions" USING btree ("quote_id","version");--> statement-breakpoint
CREATE INDEX "business_units_company_id_idx" ON "business_units" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "user_business_units_business_unit_id_idx" ON "user_business_units" USING btree ("business_unit_id");--> statement-breakpoint
-- Each existing quote becomes version 1 of itself: its positions, grouped by family in their order, become the
-- lines of the document; prices are kept exactly as saved (manual €/pz = the position's final price per unit, no
-- extra markup or discount), so no total changes. The intro text and payment terms become text modules.
CREATE FUNCTION pg_temp.text_to_html(value text) RETURNS text AS $$
  SELECT CASE WHEN coalesce(btrim(value), '') = '' THEN '' ELSE
    '<p>' || replace(replace(replace(replace(value, '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), E'\n', '</p><p>') || '</p>'
  END;
$$ LANGUAGE sql IMMUTABLE;
--> statement-breakpoint
INSERT INTO "quote_versions" ("quote_id", "version", "status", "document", "total_price", "revision", "created_by_user_id", "updated_by_user_id", "created_at", "updated_at", "sent_at")
SELECT
  q.id, 1, q.status,
  jsonb_build_object(
    'header', jsonb_build_object(
      'customerName', coalesce(nullif(left(btrim(q.customer_name), 300), ''), '—'),
      'customerFiscalCode', left(q.customer_fiscal_code, 100),
      'customerAddress', left(q.customer_address, 500),
      'customerCity', left(q.customer_city, 200),
      'projectLocation', left(q.project_location, 500),
      'quoteDate', to_char(q.created_at AT TIME ZONE 'Europe/Rome', 'YYYY-MM-DD'),
      'notes', ''
    ),
    'intro', jsonb_build_array(jsonb_build_object('id', 'm-1', 'html', pg_temp.text_to_html(q.intro_text))),
    'families', coalesce((
      SELECT jsonb_agg(f.family ORDER BY f.first_sort)
      FROM (
        SELECT
          min(qp.sort_order) AS first_sort,
          jsonb_build_object(
            'id', 'f-' || qp.product_family_id,
            'productFamilyId', qp.product_family_id,
            'name', left(min(qp.product_family_name), 300),
            'category', left(coalesce(min(pf.category), ''), 200),
            'isAlternative', false,
            'description', left(coalesce(min(pf.description_1), ''), 10000),
            'notes', left(coalesce(min(pf.description_2), ''), 10000),
            'lines', jsonb_agg(
              jsonb_build_object(
                'id', 'l-' || qp.id,
                'code', left(qp.position_code, 10),
                'productLineId', qp.product_line_id,
                -- A description the user wrote (not the generated "line — option: value") is what printed: keep it as the name.
                'name', left(CASE
                  WHEN btrim(qp.description) = '' OR qp.description = qp.product_line_name
                    OR qp.description LIKE replace(replace(qp.product_line_name, '%', '\%'), '_', '\_') || ' — %'
                  THEN qp.product_line_name ELSE btrim(qp.description) END, 300),
                'quantity', qp.quantity,
                'unit', left(qp.unit_symbol, 20),
                'widthMm', qp.width_mm::float8,
                'heightMm', qp.height_mm::float8,
                'options', coalesce((
                  SELECT jsonb_agg(jsonb_build_object(
                    'characteristicId', c.characteristic_id,
                    'subCharacteristicId', c.sub_characteristic_id,
                    'name', c.characteristic_name,
                    'value', c.sub_characteristic_name
                  ) ORDER BY c.characteristic_name)
                  FROM "quote_position_characteristics" c WHERE c.quote_position_id = qp.id
                ), '[]'::jsonb),
                'priceMode', 'manual',
                'unitPrice', round(qp.final_price / greatest(qp.quantity, 1), 4)::float8,
                'extraMarkupPct', 0,
                'discountPct', 0,
                'vatRate', '22%',
                'installationHours', NULL,
                'locked', false,
                'isAlternative', false
              ) ORDER BY qp.sort_order
            )
          ) AS family
        FROM "quote_positions" qp
        JOIN "product_families" pf ON pf.id = qp.product_family_id
        WHERE qp.quote_id = q.id
        GROUP BY qp.product_family_id
      ) f
    ), '[]'::jsonb),
    'closing', jsonb_build_array(
      jsonb_build_object('id', 'c-validity', 'type', 'text', 'html',
        '<p>Validità dell''offerta: ' || q.validity_days || ' giorni dalla data di emissione</p>'),
      jsonb_build_object('id', 'c-families', 'type', 'familySummary'),
      jsonb_build_object('id', 'c-categories', 'type', 'categorySummary'),
      jsonb_build_object('id', 'c-total', 'type', 'total'),
      jsonb_build_object('id', 'c-payments', 'type', 'payments', 'rows', '[
        {"id": "pag-1", "description": "Acconto alla firma del contratto", "pct": 30},
        {"id": "pag-2", "description": "Stato avanzamento lavori (SAL)", "pct": 40},
        {"id": "pag-3", "description": "Saldo a completamento lavori", "pct": 30}
      ]'::jsonb),
      jsonb_build_object('id', 'c-activities', 'type', 'activities', 'rows', '[
        {"id": "att-1", "description": "Fornitura materiali", "included": true, "enabled": true},
        {"id": "att-2", "description": "Posa in opera", "included": true, "enabled": true},
        {"id": "att-3", "description": "Rimozione infissi esistenti", "included": true, "enabled": true},
        {"id": "att-4", "description": "Opere murarie di contorno", "included": true, "enabled": true},
        {"id": "att-5", "description": "Trasporto e logistica", "included": true, "enabled": true},
        {"id": "att-6", "description": "Collaudo e verifica finale", "included": true, "enabled": true},
        {"id": "att-7", "description": "Pulizia del cantiere", "included": true, "enabled": true},
        {"id": "att-8", "description": "Progettazione esecutiva", "included": false, "enabled": true},
        {"id": "att-9", "description": "Assistenza post-vendita", "included": false, "enabled": true},
        {"id": "att-10", "description": "Documentazione tecnica", "included": false, "enabled": true}
      ]'::jsonb),
      jsonb_build_object('id', 'c-terms', 'type', 'text', 'html', pg_temp.text_to_html(q.payment_terms))
    ),
    'printSettings', jsonb_build_object(
      'salesContactUserId', q.created_by_user_id, 'businessUnitId', NULL,
      'showSalesContact', true, 'showImages', false, 'showFamilyDescription', true, 'showLineCharacteristics', true,
      'showExtraMarkup', false, 'showDiscount', true, 'showFamilySummary', true, 'showCategorySummary', true,
      'showTotal', true, 'showPayments', true, 'showActivities', true
    )
  ),
  q.total_price, 1, q.created_by_user_id, q.created_by_user_id, q.created_at, q.updated_at,
  CASE WHEN q.status <> 'draft' THEN q.updated_at END
FROM "quotes" q;
--> statement-breakpoint
INSERT INTO "quote_revisions" ("quote_version_id", "revision", "document", "total_price", "changes", "saved_by_user_id", "saved_at")
SELECT v.id, 1, v.document, v.total_price, '[]'::jsonb, v.updated_by_user_id, v.updated_at FROM "quote_versions" v;
--> statement-breakpoint
DROP TABLE "quote_position_characteristics" CASCADE;--> statement-breakpoint
DROP TABLE "quote_positions" CASCADE;--> statement-breakpoint
ALTER TABLE "quotes" DROP COLUMN "customer_fiscal_code";--> statement-breakpoint
ALTER TABLE "quotes" DROP COLUMN "customer_address";--> statement-breakpoint
ALTER TABLE "quotes" DROP COLUMN "customer_city";--> statement-breakpoint
ALTER TABLE "quotes" DROP COLUMN "intro_text";--> statement-breakpoint
ALTER TABLE "quotes" DROP COLUMN "payment_terms";--> statement-breakpoint
ALTER TABLE "quotes" DROP COLUMN "validity_days";--> statement-breakpoint
DROP TYPE "public"."pricing_mode";