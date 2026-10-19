CREATE INDEX "audit_log_created_idx" ON "audit_log" USING btree ("created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_log_company_created_idx" ON "audit_log" USING btree ("effective_company_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_log_actor_created_idx" ON "audit_log" USING btree ("actor_user_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_log_type_created_idx" ON "audit_log" USING btree ("resource_type","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_log_resource_created_idx" ON "audit_log" USING btree ("resource_type","resource_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_log_request_id_idx" ON "audit_log" USING btree ("request_id") WHERE "audit_log"."request_id" IS NOT NULL;