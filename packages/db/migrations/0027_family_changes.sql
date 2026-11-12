CREATE TABLE "product_family_changes" (
	"product_family_id" uuid NOT NULL,
	"from_family_id" uuid NOT NULL,
	"diff_version" integer NOT NULL,
	"changes" jsonb NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_family_changes_product_family_id_from_family_id_pk" PRIMARY KEY("product_family_id","from_family_id")
);
--> statement-breakpoint
ALTER TABLE "product_family_changes" ADD CONSTRAINT "product_family_changes_product_family_id_product_families_id_fk" FOREIGN KEY ("product_family_id") REFERENCES "public"."product_families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_family_changes" ADD CONSTRAINT "product_family_changes_from_family_id_product_families_id_fk" FOREIGN KEY ("from_family_id") REFERENCES "public"."product_families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_family_changes_from_family_id_idx" ON "product_family_changes" USING btree ("from_family_id");