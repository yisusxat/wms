-- Migration: Grant SELECT and permissive RLS on warehouse structural tables
GRANT SELECT ON public.warehouses TO authenticated, anon;
GRANT SELECT ON public.zones TO authenticated, anon;
GRANT SELECT ON public.aisles TO authenticated, anon;
GRANT SELECT ON public.racks TO authenticated, anon;

DROP POLICY IF EXISTS "Allow select on racks" ON public.racks;
CREATE POLICY "Allow select on racks" ON public.racks FOR SELECT TO authenticated, anon USING (true);

DROP POLICY IF EXISTS "Allow select on aisles" ON public.aisles;
CREATE POLICY "Allow select on aisles" ON public.aisles FOR SELECT TO authenticated, anon USING (true);

DROP POLICY IF EXISTS "Allow select on zones" ON public.zones;
CREATE POLICY "Allow select on zones" ON public.zones FOR SELECT TO authenticated, anon USING (true);

DROP POLICY IF EXISTS "Allow select on warehouses" ON public.warehouses;
CREATE POLICY "Allow select on warehouses" ON public.warehouses FOR SELECT TO authenticated, anon USING (true);
