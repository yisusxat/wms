-- Add permissions column to user_profiles for granular role-based access control
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{}'::jsonb;

-- Notify PostgREST to reload its schema cache
NOTIFY pgrst, 'reload schema';
