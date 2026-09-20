-- Create organizations table
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create memberships table
CREATE TABLE IF NOT EXISTS public.memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  role public.user_role NOT NULL DEFAULT 'OPERATOR',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, user_id)
);

-- Add organization_id to warehouses, products, movements
ALTER TABLE public.warehouses ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);
ALTER TABLE public.movements ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id);

-- Create audit_logs table
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  user_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  details JSONB,
  ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_org ON public.audit_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON public.audit_logs(created_at);

-- BACKFILL:
-- 1. Insert default organization "Bodega Central"
INSERT INTO public.organizations (id, name, slug)
VALUES ('a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', 'Bodega Central', 'bodega-central')
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name;

-- 2. Associate existing warehouses
UPDATE public.warehouses
SET organization_id = 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d'
WHERE organization_id IS NULL;

-- 3. Associate existing products
UPDATE public.products
SET organization_id = 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d'
WHERE organization_id IS NULL;

-- 4. Associate existing movements
UPDATE public.movements
SET organization_id = 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d'
WHERE organization_id IS NULL;

-- 5. Associate existing users into memberships
INSERT INTO public.memberships (organization_id, user_id, role)
SELECT 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', id, role
FROM public.user_profiles
ON CONFLICT (organization_id, user_id) DO UPDATE SET role = EXCLUDED.role;
