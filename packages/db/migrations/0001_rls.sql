-- Phase 1 RLS foundation (idempotent)
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_business_units ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION app_is_super_admin() RETURNS boolean AS $$
  SELECT coalesce(current_setting('app.is_super_admin', true), 'false') = 'true';
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION app_current_company_id() RETURNS uuid AS $$
  SELECT nullif(current_setting('app.current_company_id', true), '')::uuid;
$$ LANGUAGE sql STABLE;

-- Capability checks for the caller's own company (it can always read its own row via companies_tenant).
CREATE OR REPLACE FUNCTION app_company_is_manufacturer() RETURNS boolean AS $$
  SELECT coalesce((SELECT is_manufacturer FROM companies WHERE id = app_current_company_id()), false);
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION app_company_is_supplier() RETURNS boolean AS $$
  SELECT coalesce((SELECT is_supplier FROM companies WHERE id = app_current_company_id()), false);
$$ LANGUAGE sql STABLE;

DROP POLICY IF EXISTS companies_tenant ON companies;
CREATE POLICY companies_tenant ON companies
  FOR ALL
  USING (app_is_super_admin() OR id = app_current_company_id());

DROP POLICY IF EXISTS business_units_tenant ON business_units;
CREATE POLICY business_units_tenant ON business_units
  FOR ALL
  USING (
    app_is_super_admin()
    OR company_id = app_current_company_id()
  );

DROP POLICY IF EXISTS users_tenant ON users;
CREATE POLICY users_tenant ON users
  FOR ALL
  USING (
    app_is_super_admin()
    OR company_id = app_current_company_id()
  );

ALTER TABLE user_additional_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_additional_roles_tenant ON user_additional_roles;
CREATE POLICY user_additional_roles_tenant ON user_additional_roles
  FOR ALL
  USING (
    app_is_super_admin()
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = user_additional_roles.user_id
        AND u.company_id = app_current_company_id()
    )
  );

DROP POLICY IF EXISTS user_bu_tenant ON user_business_units;
CREATE POLICY user_bu_tenant ON user_business_units
  FOR ALL
  USING (
    app_is_super_admin()
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = user_business_units.user_id
        AND u.company_id = app_current_company_id()
    )
  );

-- audit_log (ADR 0010): a company sees entries where it's the effective
-- target (actions taken against it, including by an acting-as super-admin);
-- super-admin sees everything. Table must already exist — created by an
-- earlier-numbered drizzle migration, which always runs before this file.
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_log_tenant ON audit_log;
CREATE POLICY audit_log_tenant ON audit_log
  FOR ALL
  USING (
    app_is_super_admin()
    OR effective_company_id = app_current_company_id()
  );

-- Share-chain reachability (see product_family_shares): the owner, plus every
-- company a reachable company shared the family with, transitively (UNION also
-- stops cycles). SECURITY DEFINER on purpose — the walk must read every share,
-- including edges between OTHER companies that the caller's own RLS hides;
-- it only returns a boolean. Revoking an upstream share therefore cuts off
-- everything downstream of it automatically.
CREATE OR REPLACE FUNCTION app_family_reaches_company(p_family_id uuid, p_company_id uuid) RETURNS boolean AS $$
  WITH RECURSIVE reach(company_id) AS (
    SELECT supplier_company_id FROM product_families WHERE id = p_family_id
    UNION
    SELECT s.to_company_id
    FROM product_family_shares s
    JOIN reach r ON s.from_company_id = r.company_id
    WHERE s.product_family_id = p_family_id
  )
  SELECT EXISTS (SELECT 1 FROM reach WHERE company_id = p_company_id);
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- Every version id in p_family_id's version chain (supersedes_id links, both
-- directions). SECURITY DEFINER on purpose — a recipient may not see a draft
-- version in the middle (v2 published, v3 draft, v4 published), and walking
-- under its RLS would stop at the gap. Empty unless the caller can see
-- p_family_id itself (the product_families_select rule), and it only returns
-- ids: callers select the rows under their own RLS, so hidden versions stay hidden.
CREATE OR REPLACE FUNCTION app_family_version_chain(p_family_id uuid) RETURNS SETOF uuid AS $$
  WITH RECURSIVE
    start AS (
      SELECT id, supersedes_id FROM product_families
      WHERE id = p_family_id
        AND (
          app_is_super_admin()
          OR supplier_company_id = app_current_company_id()
          OR (is_published AND app_family_reaches_company(id, app_current_company_id()))
        )
    ),
    older(id, supersedes_id) AS (
      SELECT id, supersedes_id FROM start
      UNION
      SELECT pf.id, pf.supersedes_id FROM product_families pf JOIN older o ON pf.id = o.supersedes_id
    ),
    newer(id) AS (
      SELECT id FROM start
      UNION
      SELECT pf.id FROM product_families pf JOIN newer n ON pf.supersedes_id = n.id
    )
  SELECT id FROM older UNION SELECT id FROM newer;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- Product families (Phase 2, project-context.md) and everything under
-- them. Two helper functions capture the shared rule so it's written
-- once, not five times:
--   - "owns" (write access): the supplier company itself, or super-admin.
--   - "can view" (read access): owns it, OR the family is published AND
--     the caller's company is a linked client of that supplier
--     (product_family_shares) — a recipient never sees an owner's
--     unpublished/draft work.
-- Tables must already exist — created by an earlier-numbered drizzle
-- migration, which always runs before this file (see apply-migrations.ts).
CREATE OR REPLACE FUNCTION app_owns_product_family(family_id uuid) RETURNS boolean AS $$
  SELECT app_is_super_admin() OR EXISTS (
    SELECT 1 FROM product_families pf
    WHERE pf.id = family_id AND pf.supplier_company_id = app_current_company_id()
  );
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION app_can_view_product_family(family_id uuid) RETURNS boolean AS $$
  SELECT app_owns_product_family(family_id) OR EXISTS (
    SELECT 1 FROM product_families pf
    WHERE pf.id = family_id
      AND pf.is_published
      AND app_family_reaches_company(pf.id, app_current_company_id())
  );
$$ LANGUAGE sql STABLE;

-- product_lines/characteristics hang off a product_line_id, not a
-- product_family_id directly — these two just resolve the line's family
-- and delegate, so callers never need to know the extra hop exists.
CREATE OR REPLACE FUNCTION app_owns_product_line(line_id uuid) RETURNS boolean AS $$
  SELECT app_owns_product_family((SELECT product_family_id FROM product_lines WHERE id = line_id));
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION app_can_view_product_line(line_id uuid) RETURNS boolean AS $$
  SELECT app_can_view_product_family((SELECT product_family_id FROM product_lines WHERE id = line_id));
$$ LANGUAGE sql STABLE;

ALTER TABLE product_families ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE characteristics ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing_matrices ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_line_characteristics ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_family_images ENABLE ROW LEVEL SECURITY;

-- product_families: split SELECT (broader — includes a linked client
-- reading a published family) from write (supplier-only, always) —
-- unlike most other tables here, "can view" and "can write" are
-- genuinely different sets of callers, so one FOR ALL policy would be
-- wrong (it would let a client mutate a supplier's published family).
-- These four policies check `supplier_company_id` directly (same style
-- as `companies`/`business_units` above), NOT via `app_owns_product_family`/
-- `app_can_view_product_family` — those helpers do a SELECT back on
-- product_families itself to find the row by id, which on THIS table is
-- self-referential: evaluating product_families' own SELECT policy would
-- re-invoke the same helper, which re-queries product_families, which is
-- itself subject to the SELECT policy being evaluated. It doesn't
-- infinite-loop, but it does reliably fail ("new row violates row-level
-- security policy") including on plain INSERT ... RETURNING, since
-- Postgres also checks the SELECT policy for the returned row. The
-- helpers are still correct and necessary for the CHILD tables below,
-- where "look up the parent family" is a genuine cross-table join, not
-- a self-reference.
DROP POLICY IF EXISTS product_families_select ON product_families;
CREATE POLICY product_families_select ON product_families
  FOR SELECT
  USING (
    app_is_super_admin()
    OR supplier_company_id = app_current_company_id()
    OR (is_published AND app_family_reaches_company(id, app_current_company_id()))
  );

DROP POLICY IF EXISTS product_families_insert ON product_families;
CREATE POLICY product_families_insert ON product_families
  FOR INSERT
  WITH CHECK (
    app_is_super_admin()
    OR (supplier_company_id = app_current_company_id() AND app_company_is_manufacturer())
  );

DROP POLICY IF EXISTS product_families_update ON product_families;
CREATE POLICY product_families_update ON product_families
  FOR UPDATE
  USING (app_is_super_admin() OR supplier_company_id = app_current_company_id())
  WITH CHECK (app_is_super_admin() OR supplier_company_id = app_current_company_id());

DROP POLICY IF EXISTS product_families_delete ON product_families;
CREATE POLICY product_families_delete ON product_families
  FOR DELETE
  USING (app_is_super_admin() OR supplier_company_id = app_current_company_id());

-- product_lines, characteristics, pricing_matrices,
-- product_line_characteristics: same split, delegated to the helpers
-- above so a client can read what they're allowed to see but never
-- write into a supplier's catalog.
DROP POLICY IF EXISTS product_lines_select ON product_lines;
CREATE POLICY product_lines_select ON product_lines
  FOR SELECT USING (app_can_view_product_family(product_family_id));
DROP POLICY IF EXISTS product_lines_insert ON product_lines;
CREATE POLICY product_lines_insert ON product_lines
  FOR INSERT WITH CHECK (app_owns_product_family(product_family_id));
DROP POLICY IF EXISTS product_lines_update ON product_lines;
CREATE POLICY product_lines_update ON product_lines
  FOR UPDATE USING (app_owns_product_family(product_family_id)) WITH CHECK (app_owns_product_family(product_family_id));
DROP POLICY IF EXISTS product_lines_delete ON product_lines;
CREATE POLICY product_lines_delete ON product_lines
  FOR DELETE USING (app_owns_product_family(product_family_id));

DROP POLICY IF EXISTS characteristics_select ON characteristics;
CREATE POLICY characteristics_select ON characteristics
  FOR SELECT USING (app_can_view_product_family(product_family_id));
DROP POLICY IF EXISTS characteristics_insert ON characteristics;
CREATE POLICY characteristics_insert ON characteristics
  FOR INSERT WITH CHECK (app_owns_product_family(product_family_id));
DROP POLICY IF EXISTS characteristics_update ON characteristics;
CREATE POLICY characteristics_update ON characteristics
  FOR UPDATE USING (app_owns_product_family(product_family_id)) WITH CHECK (app_owns_product_family(product_family_id));
DROP POLICY IF EXISTS characteristics_delete ON characteristics;
CREATE POLICY characteristics_delete ON characteristics
  FOR DELETE USING (app_owns_product_family(product_family_id));

DROP POLICY IF EXISTS pricing_matrices_select ON pricing_matrices;
CREATE POLICY pricing_matrices_select ON pricing_matrices
  FOR SELECT USING (app_can_view_product_family(product_family_id));
DROP POLICY IF EXISTS pricing_matrices_insert ON pricing_matrices;
CREATE POLICY pricing_matrices_insert ON pricing_matrices
  FOR INSERT WITH CHECK (app_owns_product_family(product_family_id));
DROP POLICY IF EXISTS pricing_matrices_update ON pricing_matrices;
CREATE POLICY pricing_matrices_update ON pricing_matrices
  FOR UPDATE USING (app_owns_product_family(product_family_id)) WITH CHECK (app_owns_product_family(product_family_id));
DROP POLICY IF EXISTS pricing_matrices_delete ON pricing_matrices;
CREATE POLICY pricing_matrices_delete ON pricing_matrices
  FOR DELETE USING (app_owns_product_family(product_family_id));

DROP POLICY IF EXISTS product_line_characteristics_select ON product_line_characteristics;
CREATE POLICY product_line_characteristics_select ON product_line_characteristics
  FOR SELECT USING (app_can_view_product_line(product_line_id));
DROP POLICY IF EXISTS product_line_characteristics_insert ON product_line_characteristics;
CREATE POLICY product_line_characteristics_insert ON product_line_characteristics
  FOR INSERT WITH CHECK (app_owns_product_line(product_line_id));
DROP POLICY IF EXISTS product_line_characteristics_delete ON product_line_characteristics;
CREATE POLICY product_line_characteristics_delete ON product_line_characteristics
  FOR DELETE USING (app_owns_product_line(product_line_id));

DROP POLICY IF EXISTS product_family_images_select ON product_family_images;
CREATE POLICY product_family_images_select ON product_family_images
  FOR SELECT USING (app_can_view_product_family(product_family_id));
DROP POLICY IF EXISTS product_family_images_insert ON product_family_images;
CREATE POLICY product_family_images_insert ON product_family_images
  FOR INSERT WITH CHECK (app_owns_product_family(product_family_id));
DROP POLICY IF EXISTS product_family_images_delete ON product_family_images;
CREATE POLICY product_family_images_delete ON product_family_images
  FOR DELETE USING (app_owns_product_family(product_family_id));

-- Application role: this is what the API connects as at runtime. It must
-- NOT be a table owner or a Postgres superuser — both bypass RLS entirely
-- and unconditionally, regardless of ENABLE/FORCE ROW LEVEL SECURITY (see
-- ADR 0006). Migrations keep running as the existing owner/superuser role;
-- only the API's DATABASE_URL should ever point at this role.
-- Created here with a throwaway placeholder password if it doesn't exist
-- yet — never the real APP_DB_PASSWORD (that would mean splicing a secret
-- into this file's text). apply-migrations.ts sets the real password
-- immediately after via a parameterized ALTER ROLE, both on first create
-- and on every subsequent run, so this placeholder is never live.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'previo_app') THEN
    CREATE ROLE previo_app LOGIN PASSWORD 'set-by-apply-migrations-ts';
  END IF;
END
$$;

-- product_family_shares: visible to the sharer and the recipient; only the
-- sharer (or a super-admin) writes. The service additionally checks the
-- sharer can actually reach the family.
ALTER TABLE product_family_shares ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS product_family_shares_select ON product_family_shares;
CREATE POLICY product_family_shares_select ON product_family_shares
  FOR SELECT
  USING (
    app_is_super_admin()
    OR from_company_id = app_current_company_id()
    OR to_company_id = app_current_company_id()
  );
DROP POLICY IF EXISTS product_family_shares_write ON product_family_shares;
CREATE POLICY product_family_shares_write ON product_family_shares
  FOR ALL
  USING (app_is_super_admin() OR from_company_id = app_current_company_id())
  WITH CHECK (app_is_super_admin() OR from_company_id = app_current_company_id());

-- product_family_library_hidden: each company's own "In libreria: No" choices.
-- Only that company reads or writes them, and only for families it can see.
ALTER TABLE product_family_library_hidden ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS product_family_library_hidden_own ON product_family_library_hidden;
CREATE POLICY product_family_library_hidden_own ON product_family_library_hidden
  FOR ALL
  USING (app_is_super_admin() OR company_id = app_current_company_id())
  WITH CHECK (
    (app_is_super_admin() OR company_id = app_current_company_id())
    AND app_can_view_product_family(product_family_id)
  );

-- company_connections: each side of a connection (or request) sees it and may change it.
-- The partners service decides which change each side may make.
ALTER TABLE company_connections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_connections_parties ON company_connections;
CREATE POLICY company_connections_parties ON company_connections
  FOR ALL
  USING (
    app_is_super_admin()
    OR requester_company_id = app_current_company_id()
    OR addressee_company_id = app_current_company_id()
  )
  WITH CHECK (
    app_is_super_admin()
    OR requester_company_id = app_current_company_id()
    OR addressee_company_id = app_current_company_id()
  );

-- notifications: a company's own users' notifications. The service narrows to the user.
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notifications_own_company ON notifications;
CREATE POLICY notifications_own_company ON notifications
  FOR ALL
  USING (app_is_super_admin() OR company_id = app_current_company_id())
  WITH CHECK (app_is_super_admin() OR company_id = app_current_company_id());

-- Other companies' names (and only names): a view that runs with its owner's
-- rights, so it can show id + name without opening the companies row itself
-- (VAT number, capabilities, ...) to partners. Visible: self, companies the
-- caller is connected to or has a pending request with, companies the caller
-- shares families with in either direction, and owners of published families
-- that reach the caller.
DROP POLICY IF EXISTS companies_share_partner_read ON companies;
DROP POLICY IF EXISTS companies_family_owner_read ON companies;
CREATE OR REPLACE VIEW company_directory AS
SELECT c.id, c.name
FROM companies c
WHERE app_is_super_admin()
   OR c.id = app_current_company_id()
   OR EXISTS (
     SELECT 1 FROM company_connections cc
     WHERE (cc.requester_company_id = app_current_company_id() AND cc.addressee_company_id = c.id)
        OR (cc.addressee_company_id = app_current_company_id() AND cc.requester_company_id = c.id)
   )
   OR EXISTS (
     SELECT 1 FROM product_family_shares s
     WHERE (s.from_company_id = app_current_company_id() AND s.to_company_id = c.id)
        OR (s.to_company_id = app_current_company_id() AND s.from_company_id = c.id)
   )
   OR EXISTS (
     SELECT 1 FROM product_families pf
     WHERE pf.supplier_company_id = c.id
       AND pf.is_published
       AND app_family_reaches_company(pf.id, app_current_company_id())
   );

GRANT USAGE ON SCHEMA public TO previo_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO previo_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO previo_app;

-- Append-only (ADR 0010): the application never updates or deletes an
-- audit record — only INSERT (and SELECT to read it back). Revoked after
-- the blanket grant above so this table is the one deliberate exception.
REVOKE UPDATE, DELETE ON audit_log FROM previo_app;

-- Quotes (Phase 3): a supplier's quotes to their own end customers.
-- Unlike product_families, quotes are never shared/published — visibility
-- is a straight "belongs to my company" check, same shape as companies'
-- own policy. Child tables (quote_positions, quote_position_characteristics)
-- delegate via a join back to quotes, mirroring the product-families
-- child-table pattern above.
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_position_characteristics ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION app_owns_quote(target_quote_id uuid) RETURNS boolean AS $$
  SELECT app_is_super_admin() OR EXISTS (
    SELECT 1 FROM quotes q
    WHERE q.id = target_quote_id AND q.supplier_company_id = app_current_company_id()
  );
$$ LANGUAGE sql STABLE;

DROP POLICY IF EXISTS quotes_tenant ON quotes;
CREATE POLICY quotes_tenant ON quotes
  FOR ALL
  USING (app_is_super_admin() OR supplier_company_id = app_current_company_id())
  WITH CHECK (
    app_is_super_admin()
    OR (supplier_company_id = app_current_company_id() AND app_company_is_supplier())
  );

DROP POLICY IF EXISTS quote_positions_tenant ON quote_positions;
CREATE POLICY quote_positions_tenant ON quote_positions
  FOR ALL
  USING (app_owns_quote(quote_id))
  WITH CHECK (app_owns_quote(quote_id));

DROP POLICY IF EXISTS quote_position_characteristics_tenant ON quote_position_characteristics;
CREATE POLICY quote_position_characteristics_tenant ON quote_position_characteristics
  FOR ALL
  USING (
    app_is_super_admin() OR EXISTS (
      SELECT 1 FROM quote_positions qp
      WHERE qp.id = quote_position_id AND app_owns_quote(qp.quote_id)
    )
  )
  WITH CHECK (
    app_is_super_admin() OR EXISTS (
      SELECT 1 FROM quote_positions qp
      WHERE qp.id = quote_position_id AND app_owns_quote(qp.quote_id)
    )
  );
