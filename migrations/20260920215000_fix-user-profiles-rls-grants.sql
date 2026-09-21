-- Migration: Fix user_profiles permissions and RLS policies
-- Grants full access on user_profiles to authenticated, anon, project_admin and postgres
-- and establishes permissive RLS policies for SELECT, INSERT, UPDATE, DELETE.

GRANT ALL ON TABLE public.user_profiles TO authenticated, anon, project_admin, postgres;

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users can read their profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Allow select on user_profiles" ON public.user_profiles;
DROP POLICY IF EXISTS "Allow update on user_profiles" ON public.user_profiles;
DROP POLICY IF EXISTS "Allow insert on user_profiles" ON public.user_profiles;
DROP POLICY IF EXISTS "Allow delete on user_profiles" ON public.user_profiles;

CREATE POLICY "Allow select on user_profiles"
ON public.user_profiles
FOR SELECT
TO authenticated, anon, project_admin
USING (true);

CREATE POLICY "Allow update on user_profiles"
ON public.user_profiles
FOR UPDATE
TO authenticated, anon, project_admin
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow insert on user_profiles"
ON public.user_profiles
FOR INSERT
TO authenticated, anon, project_admin
WITH CHECK (true);

CREATE POLICY "Allow delete on user_profiles"
ON public.user_profiles
FOR DELETE
TO authenticated, anon, project_admin
USING (true);

NOTIFY pgrst, 'reload schema';
