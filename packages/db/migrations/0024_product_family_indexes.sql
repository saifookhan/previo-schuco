CREATE INDEX "characteristics_product_family_id_idx" ON "characteristics" USING btree ("product_family_id");--> statement-breakpoint
CREATE INDEX "pricing_matrices_product_family_id_idx" ON "pricing_matrices" USING btree ("product_family_id");--> statement-breakpoint
CREATE INDEX "product_families_supersedes_id_idx" ON "product_families" USING btree ("supersedes_id");--> statement-breakpoint
CREATE INDEX "product_family_images_product_family_id_idx" ON "product_family_images" USING btree ("product_family_id");--> statement-breakpoint
CREATE INDEX "product_lines_product_family_id_idx" ON "product_lines" USING btree ("product_family_id");