-- ============================================================
-- Migración: 20261004000000_harden_rls_security.sql
-- Fase 4: Hardening de RLS en Base de Datos InsForge / PostgreSQL
-- 1. Protección contra escalación de privilegios en user_profiles (C3)
-- 2. Restricción estricta de auditoría en audit_logs (A5, N2)
-- 3. Hardening de tablas de olas y pedidos de salida (waves, outbound_*)
-- ============================================================

-- ------------------------------------------------------------
-- 1. C3: Prevenir escalación de privilegios en user_profiles
-- ------------------------------------------------------------
-- Función trigger que impide a usuarios no-administradores alterar
-- sus propios roles o permisos directamente vía base de datos / cliente.
CREATE OR REPLACE FUNCTION public.prevent_user_role_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Superusuario y rol de servicio backend (API) tienen permiso total
  IF current_user IN ('postgres', 'service_role') THEN
    RETURN NEW;
  END IF;

  -- Si se intenta cambiar rol o permisos
  IF (NEW.role IS DISTINCT FROM OLD.role) OR (NEW.permissions IS DISTINCT FROM OLD.permissions) THEN
    -- Solo un ADMIN autenticado puede modificar roles o permisos
    IF NOT EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = (SELECT auth.uid()) AND role = 'ADMIN'
    ) THEN
      RAISE EXCEPTION 'Acceso denegado: solo administradores pueden modificar roles o permisos de usuario.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_user_role_escalation ON public.user_profiles;
CREATE TRIGGER trg_prevent_user_role_escalation
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_user_role_escalation();


-- ------------------------------------------------------------
-- 2. A5 / N2: Restricción de audit_logs (solo ADMIN / SUPERVISOR para SELECT)
-- ------------------------------------------------------------
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow select on audit_logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Allow insert on audit_logs" ON public.audit_logs;
DROP POLICY IF EXISTS "authenticated_select_audit_logs" ON public.audit_logs;
DROP POLICY IF EXISTS "authenticated_insert_audit_logs" ON public.audit_logs;
DROP POLICY IF EXISTS "admin_select_audit_logs" ON public.audit_logs;
DROP POLICY IF EXISTS "admin_insert_audit_logs" ON public.audit_logs;

-- Solo ADMIN y SUPERVISOR pueden consultar la bitácora
CREATE POLICY "admin_select_audit_logs" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = (SELECT auth.uid()) AND role IN ('ADMIN', 'SUPERVISOR')
    )
  );

-- Inserción controlada para audit_logs
CREATE POLICY "admin_insert_audit_logs" ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = (SELECT auth.uid()) AND role = 'ADMIN'
    )
  );


-- ------------------------------------------------------------
-- 3. Hardening de tablas de olas (waves, outbound_orders, outbound_order_lines)
-- ------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'waves') THEN
    ALTER TABLE public.waves ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.waves FORCE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS waves_authenticated ON public.waves;
    DROP POLICY IF EXISTS "authenticated_select_waves" ON public.waves;
    DROP POLICY IF EXISTS "authenticated_write_waves" ON public.waves;

    CREATE POLICY "authenticated_select_waves" ON public.waves
      FOR SELECT TO authenticated
      USING ((SELECT auth.uid()) IS NOT NULL);

    CREATE POLICY "authenticated_write_waves" ON public.waves
      FOR ALL TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.user_profiles
          WHERE id = (SELECT auth.uid()) AND role IN ('ADMIN', 'SUPERVISOR', 'OPERATOR')
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.user_profiles
          WHERE id = (SELECT auth.uid()) AND role IN ('ADMIN', 'SUPERVISOR', 'OPERATOR')
        )
      );
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'outbound_orders') THEN
    ALTER TABLE public.outbound_orders ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.outbound_orders FORCE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS orders_authenticated ON public.outbound_orders;
    DROP POLICY IF EXISTS "authenticated_select_outbound_orders" ON public.outbound_orders;
    DROP POLICY IF EXISTS "authenticated_write_outbound_orders" ON public.outbound_orders;

    CREATE POLICY "authenticated_select_outbound_orders" ON public.outbound_orders
      FOR SELECT TO authenticated
      USING ((SELECT auth.uid()) IS NOT NULL);

    CREATE POLICY "authenticated_write_outbound_orders" ON public.outbound_orders
      FOR ALL TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.user_profiles
          WHERE id = (SELECT auth.uid()) AND role IN ('ADMIN', 'SUPERVISOR', 'OPERATOR')
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.user_profiles
          WHERE id = (SELECT auth.uid()) AND role IN ('ADMIN', 'SUPERVISOR', 'OPERATOR')
        )
      );
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'outbound_order_lines') THEN
    ALTER TABLE public.outbound_order_lines ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.outbound_order_lines FORCE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS order_lines_authenticated ON public.outbound_order_lines;
    DROP POLICY IF EXISTS "authenticated_select_outbound_order_lines" ON public.outbound_order_lines;
    DROP POLICY IF EXISTS "authenticated_write_outbound_order_lines" ON public.outbound_order_lines;

    CREATE POLICY "authenticated_select_outbound_order_lines" ON public.outbound_order_lines
      FOR SELECT TO authenticated
      USING ((SELECT auth.uid()) IS NOT NULL);

    CREATE POLICY "authenticated_write_outbound_order_lines" ON public.outbound_order_lines
      FOR ALL TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.user_profiles
          WHERE id = (SELECT auth.uid()) AND role IN ('ADMIN', 'SUPERVISOR', 'OPERATOR')
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.user_profiles
          WHERE id = (SELECT auth.uid()) AND role IN ('ADMIN', 'SUPERVISOR', 'OPERATOR')
        )
      );
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
