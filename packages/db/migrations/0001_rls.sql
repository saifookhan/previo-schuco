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
