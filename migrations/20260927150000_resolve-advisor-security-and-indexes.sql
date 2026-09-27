-- Migration: 20260927150000_resolve-advisor-security-and-indexes.sql
-- Description: Resolve InsForge Backend Advisor findings:
--              1. Enable & force Row Level Security (RLS) across all public tables.
--              2. Convert stock functions to SECURITY INVOKER with restricted execute permissions.
--              3. Replace permissive policies with authenticated checks ((SELECT auth.uid()) IS NOT NULL).
--              4. Create foreign key indexes on memberships, warehouses, products, movements, audit_logs, user_profiles.

-- 1. Create missing Foreign Key and Subquery Indexes
CREATE INDEX IF NOT EXISTS idx_memberships_user_id ON public.memberships (user_id);
CREATE INDEX IF NOT EXISTS idx_warehouses_organization_id ON public.warehouses (organization_id);
CREATE INDEX IF NOT EXISTS idx_products_organization_id ON public.products (organization_id);
CREATE INDEX IF NOT EXISTS idx_movements_destination_location_id ON public.movements (destination_location_id);
CREATE INDEX IF NOT EXISTS idx_movements_organization_id ON public.movements (organization_id);
CREATE INDEX IF NOT EXISTS idx_movements_user_id ON public.movements (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_movements_source_location_id ON public.movements (source_location_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON public.user_profiles (role);

-- 2. Force Row Level Security across all public tables
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memberships FORCE ROW LEVEL SECURITY;

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations FORCE ROW LEVEL SECURITY;

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs FORCE ROW LEVEL SECURITY;

ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouses FORCE ROW LEVEL SECURITY;

ALTER TABLE public.zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zones FORCE ROW LEVEL SECURITY;

ALTER TABLE public.aisles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aisles FORCE ROW LEVEL SECURITY;

ALTER TABLE public.racks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.racks FORCE ROW LEVEL SECURITY;

ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations FORCE ROW LEVEL SECURITY;

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products FORCE ROW LEVEL SECURITY;

ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory FORCE ROW LEVEL SECURITY;

ALTER TABLE public.movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movements FORCE ROW LEVEL SECURITY;

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles FORCE ROW LEVEL SECURITY;

-- 3. Replace permissive policies with authenticated-only checks
-- user_profiles
DROP POLICY IF EXISTS "Allow select on user_profiles" ON public.user_profiles;
DROP POLICY IF EXISTS "Allow insert on user_profiles" ON public.user_profiles;
DROP POLICY IF EXISTS "Allow update on user_profiles" ON public.user_profiles;
DROP POLICY IF EXISTS "Allow delete on user_profiles" ON public.user_profiles;
DROP POLICY IF EXISTS "authenticated_select_user_profiles" ON public.user_profiles;
DROP POLICY IF EXISTS "authenticated_insert_user_profiles" ON public.user_profiles;
DROP POLICY IF EXISTS "authenticated_update_user_profiles" ON public.user_profiles;
DROP POLICY IF EXISTS "authenticated_delete_user_profiles" ON public.user_profiles;

CREATE POLICY "authenticated_select_user_profiles" ON public.user_profiles FOR SELECT TO authenticated USING ((SELECT auth.uid()) IS NOT NULL);
CREATE POLICY "authenticated_insert_user_profiles" ON public.user_profiles FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = id);
CREATE POLICY "authenticated_update_user_profiles" ON public.user_profiles FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = id) WITH CHECK ((SELECT auth.uid()) = id);
CREATE POLICY "authenticated_delete_user_profiles" ON public.user_profiles FOR DELETE TO authenticated USING ((SELECT auth.uid()) = id);

-- organizations
DROP POLICY IF EXISTS "Allow select on organizations" ON public.organizations;
DROP POLICY IF EXISTS "Allow write on organizations" ON public.organizations;
DROP POLICY IF EXISTS "authenticated_select_organizations" ON public.organizations;
DROP POLICY IF EXISTS "authenticated_write_organizations" ON public.organizations;

CREATE POLICY "authenticated_select_organizations" ON public.organizations FOR SELECT TO authenticated USING ((SELECT auth.uid()) IS NOT NULL);
CREATE POLICY "authenticated_write_organizations" ON public.organizations FOR ALL TO authenticated USING ((SELECT auth.uid()) IS NOT NULL) WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

-- memberships
DROP POLICY IF EXISTS "Allow select on memberships" ON public.memberships;
DROP POLICY IF EXISTS "Allow write on memberships" ON public.memberships;
DROP POLICY IF EXISTS "authenticated_select_memberships" ON public.memberships;
DROP POLICY IF EXISTS "authenticated_write_memberships" ON public.memberships;

CREATE POLICY "authenticated_select_memberships" ON public.memberships FOR SELECT TO authenticated USING ((SELECT auth.uid()) IS NOT NULL);
CREATE POLICY "authenticated_write_memberships" ON public.memberships FOR ALL TO authenticated USING ((SELECT auth.uid()) IS NOT NULL) WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

-- audit_logs
DROP POLICY IF EXISTS "Allow select on audit_logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Allow insert on audit_logs" ON public.audit_logs;
DROP POLICY IF EXISTS "authenticated_select_audit_logs" ON public.audit_logs;
DROP POLICY IF EXISTS "authenticated_insert_audit_logs" ON public.audit_logs;

CREATE POLICY "authenticated_select_audit_logs" ON public.audit_logs FOR SELECT TO authenticated USING ((SELECT auth.uid()) IS NOT NULL);
CREATE POLICY "authenticated_insert_audit_logs" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

-- warehouses
DROP POLICY IF EXISTS "Allow select on warehouses" ON public.warehouses;
DROP POLICY IF EXISTS "authenticated_select_warehouses" ON public.warehouses;
DROP POLICY IF EXISTS "authenticated_write_warehouses" ON public.warehouses;

CREATE POLICY "authenticated_select_warehouses" ON public.warehouses FOR SELECT TO authenticated USING ((SELECT auth.uid()) IS NOT NULL);
CREATE POLICY "authenticated_write_warehouses" ON public.warehouses FOR ALL TO authenticated USING ((SELECT auth.uid()) IS NOT NULL) WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

-- zones
DROP POLICY IF EXISTS "Allow select on zones" ON public.zones;
DROP POLICY IF EXISTS "authenticated_select_zones" ON public.zones;
DROP POLICY IF EXISTS "authenticated_write_zones" ON public.zones;

CREATE POLICY "authenticated_select_zones" ON public.zones FOR SELECT TO authenticated USING ((SELECT auth.uid()) IS NOT NULL);
CREATE POLICY "authenticated_write_zones" ON public.zones FOR ALL TO authenticated USING ((SELECT auth.uid()) IS NOT NULL) WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

-- aisles
DROP POLICY IF EXISTS "Allow select on aisles" ON public.aisles;
DROP POLICY IF EXISTS "authenticated_select_aisles" ON public.aisles;
DROP POLICY IF EXISTS "authenticated_write_aisles" ON public.aisles;

CREATE POLICY "authenticated_select_aisles" ON public.aisles FOR SELECT TO authenticated USING ((SELECT auth.uid()) IS NOT NULL);
CREATE POLICY "authenticated_write_aisles" ON public.aisles FOR ALL TO authenticated USING ((SELECT auth.uid()) IS NOT NULL) WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

-- racks
DROP POLICY IF EXISTS "Allow select on racks" ON public.racks;
DROP POLICY IF EXISTS "authenticated_select_racks" ON public.racks;
DROP POLICY IF EXISTS "authenticated_write_racks" ON public.racks;

CREATE POLICY "authenticated_select_racks" ON public.racks FOR SELECT TO authenticated USING ((SELECT auth.uid()) IS NOT NULL);
CREATE POLICY "authenticated_write_racks" ON public.racks FOR ALL TO authenticated USING ((SELECT auth.uid()) IS NOT NULL) WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

-- locations
DROP POLICY IF EXISTS "Allow select on locations" ON public.locations;
DROP POLICY IF EXISTS "Allow update on locations" ON public.locations;
DROP POLICY IF EXISTS "authenticated_select_locations" ON public.locations;
DROP POLICY IF EXISTS "authenticated_write_locations" ON public.locations;

CREATE POLICY "authenticated_select_locations" ON public.locations FOR SELECT TO authenticated USING ((SELECT auth.uid()) IS NOT NULL);
CREATE POLICY "authenticated_write_locations" ON public.locations FOR ALL TO authenticated USING ((SELECT auth.uid()) IS NOT NULL) WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

-- products
DROP POLICY IF EXISTS "Allow select on products" ON public.products;
DROP POLICY IF EXISTS "Allow insert on products" ON public.products;
DROP POLICY IF EXISTS "Allow update on products" ON public.products;
DROP POLICY IF EXISTS "Allow delete on products" ON public.products;
DROP POLICY IF EXISTS "authenticated_select_products" ON public.products;
DROP POLICY IF EXISTS "authenticated_insert_products" ON public.products;
DROP POLICY IF EXISTS "authenticated_update_products" ON public.products;
DROP POLICY IF EXISTS "authenticated_delete_products" ON public.products;

CREATE POLICY "authenticated_select_products" ON public.products FOR SELECT TO authenticated USING ((SELECT auth.uid()) IS NOT NULL);
CREATE POLICY "authenticated_insert_products" ON public.products FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) IS NOT NULL);
CREATE POLICY "authenticated_update_products" ON public.products FOR UPDATE TO authenticated USING ((SELECT auth.uid()) IS NOT NULL) WITH CHECK ((SELECT auth.uid()) IS NOT NULL);
CREATE POLICY "authenticated_delete_products" ON public.products FOR DELETE TO authenticated USING ((SELECT auth.uid()) IS NOT NULL);

-- inventory
DROP POLICY IF EXISTS "Allow select on inventory" ON public.inventory;
DROP POLICY IF EXISTS "Allow insert on inventory" ON public.inventory;
DROP POLICY IF EXISTS "Allow update on inventory" ON public.inventory;
DROP POLICY IF EXISTS "Allow delete on inventory" ON public.inventory;
DROP POLICY IF EXISTS "authenticated_select_inventory" ON public.inventory;
DROP POLICY IF EXISTS "authenticated_insert_inventory" ON public.inventory;
DROP POLICY IF EXISTS "authenticated_update_inventory" ON public.inventory;
DROP POLICY IF EXISTS "authenticated_delete_inventory" ON public.inventory;

CREATE POLICY "authenticated_select_inventory" ON public.inventory FOR SELECT TO authenticated USING ((SELECT auth.uid()) IS NOT NULL);
CREATE POLICY "authenticated_insert_inventory" ON public.inventory FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) IS NOT NULL);
CREATE POLICY "authenticated_update_inventory" ON public.inventory FOR UPDATE TO authenticated USING ((SELECT auth.uid()) IS NOT NULL) WITH CHECK ((SELECT auth.uid()) IS NOT NULL);
CREATE POLICY "authenticated_delete_inventory" ON public.inventory FOR DELETE TO authenticated USING ((SELECT auth.uid()) IS NOT NULL);

-- movements
DROP POLICY IF EXISTS "Allow select on movements" ON public.movements;
DROP POLICY IF EXISTS "Allow insert on movements" ON public.movements;
DROP POLICY IF EXISTS "authenticated_select_movements" ON public.movements;
DROP POLICY IF EXISTS "authenticated_insert_movements" ON public.movements;

CREATE POLICY "authenticated_select_movements" ON public.movements FOR SELECT TO authenticated USING ((SELECT auth.uid()) IS NOT NULL);
CREATE POLICY "authenticated_insert_movements" ON public.movements FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

-- 4. Convert stock movement functions to SECURITY INVOKER and revoke execute from anon and PUBLIC
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('wms_issue_stock', 'wms_receive_stock', 'wms_transfer_stock', 'wms_adjust_stock')
  ) LOOP
    EXECUTE format('ALTER FUNCTION %I.%I(%s) SECURITY INVOKER', r.nspname, r.proname, r.args);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM PUBLIC', r.nspname, r.proname, r.args);

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM anon', r.nspname, r.proname, r.args);
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM authenticated', r.nspname, r.proname, r.args);
    END IF;
  END LOOP;
END $$;
