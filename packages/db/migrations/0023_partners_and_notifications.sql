CREATE TYPE "public"."company_connection_status" AS ENUM('pending', 'accepted');--> statement-breakpoint
CREATE TABLE "company_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requester_company_id" uuid NOT NULL,
	"addressee_company_id" uuid NOT NULL,
	"status" "company_connection_status" DEFAULT 'pending' NOT NULL,
	"requested_by_user_id" uuid,
	"responded_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone,
	CONSTRAINT "company_connections_no_self" CHECK ("company_connections"."requester_company_id" <> "company_connections"."addressee_company_id")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"type" text NOT NULL,
	"other_company_id" uuid,
	"other_company_name" text,
	"connection_id" uuid,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "company_connections" ADD CONSTRAINT "company_connections_requester_company_id_companies_id_fk" FOREIGN KEY ("requester_company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_connections" ADD CONSTRAINT "company_connections_addressee_company_id_companies_id_fk" FOREIGN KEY ("addressee_company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_connections" ADD CONSTRAINT "company_connections_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_connections" ADD CONSTRAINT "company_connections_responded_by_user_id_users_id_fk" FOREIGN KEY ("responded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_other_company_id_companies_id_fk" FOREIGN KEY ("other_company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_connection_id_company_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."company_connections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "company_connections_pair_idx" ON "company_connections" USING btree (least("requester_company_id", "addressee_company_id"),greatest("requester_company_id", "addressee_company_id"));--> statement-breakpoint
CREATE INDEX "company_connections_requester_idx" ON "company_connections" USING btree ("requester_company_id");--> statement-breakpoint
CREATE INDEX "company_connections_addressee_idx" ON "company_connections" USING btree ("addressee_company_id");--> statement-breakpoint
CREATE INDEX "notifications_user_created_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_connection_idx" ON "notifications" USING btree ("connection_id");--> statement-breakpoint
-- Companies that already share families with each other become connected, so today's shares keep working.
INSERT INTO "company_connections" ("requester_company_id", "addressee_company_id", "status", "created_at", "responded_at")
SELECT DISTINCT ON (least(s."from_company_id", s."to_company_id"), greatest(s."from_company_id", s."to_company_id"))
  s."from_company_id", s."to_company_id", 'accepted', s."created_at", s."created_at"
FROM "product_family_shares" s
ORDER BY least(s."from_company_id", s."to_company_id"), greatest(s."from_company_id", s."to_company_id"), s."created_at"
ON CONFLICT DO NOTHING;--> statement-breakpoint
-- If a custom role matrix was already saved, grant the new partners.manage where the code defaults do.
INSERT INTO "role_permissions" ("role_id", "permission")
SELECT r."role_id", 'partners.manage'
FROM (VALUES ('super-admin'), ('company-admin'), ('super-user')) AS r("role_id")
WHERE EXISTS (SELECT 1 FROM "role_permissions")
  AND EXISTS (SELECT 1 FROM "roles" WHERE "roles"."id" = r."role_id")
ON CONFLICT DO NOTHING;
