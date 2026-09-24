CREATE INDEX "quote_position_characteristics_quote_position_id_idx" ON "quote_position_characteristics" USING btree ("quote_position_id");--> statement-breakpoint
CREATE INDEX "quote_positions_quote_id_idx" ON "quote_positions" USING btree ("quote_id");--> statement-breakpoint
CREATE INDEX "quotes_supplier_company_id_idx" ON "quotes" USING btree ("supplier_company_id");