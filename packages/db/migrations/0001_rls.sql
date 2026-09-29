-- Phase 1 RLS foundation (idempotent)
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_business_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_client_links ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION app_is_super_admin() RETURNS boolean AS $$
  SELECT coalesce(current_setting('app.is_super_admin', true), 'false') = 'true';
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION app_current_company_id() RETURNS uuid AS $$
  SELECT nullif(current_setting('app.current_company_id', true), '')::uuid;
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

DROP POLICY IF EXISTS supplier_client_tenant ON supplier_client_links;
CREATE POLICY supplier_client_tenant ON supplier_client_links
  FOR ALL
  USING (
    app_is_super_admin()
    OR supplier_company_id = app_current_company_id()
    OR client_company_id = app_current_company_id()
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

GRANT USAGE ON SCHEMA public TO previo_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO previo_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO previo_app;

-- Append-only (ADR 0010): the application never updates or deletes an
-- audit record — only INSERT (and SELECT to read it back). Revoked after
-- the blanket grant above so this table is the one deliberate exception.
REVOKE UPDATE, DELETE ON audit_log FROM previo_app;
