-- Fase 3.1/3.2 (PLAN_SEGURIDAD.md): control de sesión server-side.
-- Aplicar en la base de datos de InsForge (misma BD que usa la API NestJS):
--   npx -y @insforge/cli db query --file prisma/session_control.sql
--   (o pegar este archivo en el SQL editor del dashboard de InsForge)
--
-- La API degrada con seguridad si la tabla no existe (auth.service.ts lo
-- maneja con try/catch), pero revocación e inactividad solo operan una vez
-- aplicada.

CREATE TABLE IF NOT EXISTS session_control (
  user_id      uuid PRIMARY KEY REFERENCES "user_profiles"(id) ON DELETE CASCADE,
  revoked_at   timestamptz,
  last_seen_at timestamptz
);

-- RLS: los clientes (anon/autenticados vía PostgREST) no deben tocar esta
-- tabla; solo la API NestJS (conexión directa/service role) lee y escribe.
ALTER TABLE session_control ENABLE ROW LEVEL SECURITY;
-- Sin políticas CREATE POLICY = denegación total para roles no-superuser.
