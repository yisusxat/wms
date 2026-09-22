-- Migration: 20260921230000_grant-crud-rls-wms-core.sql
-- Description: Allow authenticated users to perform operations on products, locations, inventory, and movements
--              ensuring all mutations (entries, exits, adjustments, transfers, product edits) save correctly.

-- 1. Table Grants for authenticated and anon
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE ON public.locations TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory TO authenticated, anon;
GRANT SELECT, INSERT ON public.movements TO authenticated, anon;

-- Conditional project_admin grant for environments where the role exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'project_admin') THEN
    EXECUTE 'GRANT ALL ON TABLE public.products, public.locations, public.inventory, public.movements TO project_admin';
  END IF;
END $$;

-- 2. RLS Policies for products
DROP POLICY IF EXISTS "authenticated can read products" ON public.products;
DROP POLICY IF EXISTS "Allow select on products" ON public.products;
DROP POLICY IF EXISTS "Allow insert on products" ON public.products;
DROP POLICY IF EXISTS "Allow update on products" ON public.products;
DROP POLICY IF EXISTS "Allow delete on products" ON public.products;

CREATE POLICY "Allow select on products" ON public.products FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "Allow insert on products" ON public.products FOR INSERT TO authenticated, anon WITH CHECK (true);
CREATE POLICY "Allow update on products" ON public.products FOR UPDATE TO authenticated, anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow delete on products" ON public.products FOR DELETE TO authenticated, anon USING (true);

-- 3. RLS Policies for locations
DROP POLICY IF EXISTS "authenticated can read locations" ON public.locations;
DROP POLICY IF EXISTS "Allow select on locations" ON public.locations;
DROP POLICY IF EXISTS "Allow update on locations" ON public.locations;

CREATE POLICY "Allow select on locations" ON public.locations FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "Allow update on locations" ON public.locations FOR UPDATE TO authenticated, anon USING (true) WITH CHECK (true);

-- 4. RLS Policies for inventory
DROP POLICY IF EXISTS "authenticated can read inventory" ON public.inventory;
DROP POLICY IF EXISTS "Allow select on inventory" ON public.inventory;
DROP POLICY IF EXISTS "Allow insert on inventory" ON public.inventory;
DROP POLICY IF EXISTS "Allow update on inventory" ON public.inventory;
DROP POLICY IF EXISTS "Allow delete on inventory" ON public.inventory;

CREATE POLICY "Allow select on inventory" ON public.inventory FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "Allow insert on inventory" ON public.inventory FOR INSERT TO authenticated, anon WITH CHECK (true);
CREATE POLICY "Allow update on inventory" ON public.inventory FOR UPDATE TO authenticated, anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow delete on inventory" ON public.inventory FOR DELETE TO authenticated, anon USING (true);

-- 5. RLS Policies for movements
DROP POLICY IF EXISTS "authenticated can read movements" ON public.movements;
DROP POLICY IF EXISTS "Allow select on movements" ON public.movements;
DROP POLICY IF EXISTS "Allow insert on movements" ON public.movements;

CREATE POLICY "Allow select on movements" ON public.movements FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "Allow insert on movements" ON public.movements FOR INSERT TO authenticated, anon WITH CHECK (true);
