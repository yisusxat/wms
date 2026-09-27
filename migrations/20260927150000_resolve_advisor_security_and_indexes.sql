-- Migration: 20260927150000_resolve_advisor_security_and_indexes.sql
-- Description: Resolve 48 InsForge Backend Advisor findings:
--              1. Enable & force Row Level Security (RLS) across all public tables.
--              2. Harden SECURITY DEFINER functions (search_path & revoke execution from anon/PUBLIC).
--              3. Create foreign key indexes on movements and role index on user_profiles.

-- 1. Create missing Foreign Key and RLS Subquery Indexes
CREATE INDEX IF NOT EXISTS idx_movements_destination_location_id ON public.movements (destination_location_id);
CREATE INDEX IF NOT EXISTS idx_movements_source_location_id ON public.movements (source_location_id);
CREATE INDEX IF NOT EXISTS idx_movements_user_id ON public.movements (user_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON public.user_profiles (role);

-- 2. Force Row Level Security across all public tables
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

-- 3. Harden SECURITY DEFINER stock functions (prevent search_path hijacking & restrict anon execution)
DO $$
BEGIN
  -- wms_issue_stock
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'wms_issue_stock') THEN
    ALTER FUNCTION public.wms_issue_stock(uuid, uuid, integer, text) SET search_path = pg_catalog, public, pg_temp;
    REVOKE EXECUTE ON FUNCTION public.wms_issue_stock(uuid, uuid, integer, text) FROM PUBLIC;
    REVOKE EXECUTE ON FUNCTION public.wms_issue_stock(uuid, uuid, integer, text) FROM anon;
    GRANT EXECUTE ON FUNCTION public.wms_issue_stock(uuid, uuid, integer, text) TO authenticated;
  END IF;

  -- wms_receive_stock
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'wms_receive_stock') THEN
    ALTER FUNCTION public.wms_receive_stock(uuid, uuid, integer, text) SET search_path = pg_catalog, public, pg_temp;
    REVOKE EXECUTE ON FUNCTION public.wms_receive_stock(uuid, uuid, integer, text) FROM PUBLIC;
    REVOKE EXECUTE ON FUNCTION public.wms_receive_stock(uuid, uuid, integer, text) FROM anon;
    GRANT EXECUTE ON FUNCTION public.wms_receive_stock(uuid, uuid, integer, text) TO authenticated;
  END IF;

  -- wms_transfer_stock
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'wms_transfer_stock') THEN
    ALTER FUNCTION public.wms_transfer_stock(uuid, uuid, uuid, integer, text) SET search_path = pg_catalog, public, pg_temp;
    REVOKE EXECUTE ON FUNCTION public.wms_transfer_stock(uuid, uuid, uuid, integer, text) FROM PUBLIC;
    REVOKE EXECUTE ON FUNCTION public.wms_transfer_stock(uuid, uuid, uuid, integer, text) FROM anon;
    GRANT EXECUTE ON FUNCTION public.wms_transfer_stock(uuid, uuid, uuid, integer, text) TO authenticated;
  END IF;
END $$;
