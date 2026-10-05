# 🛠️ Plan de Implementación de Mejoras de Seguridad — WMS
**Versión:** 1.1 · **Fecha:** 2026-10-03 · **Base:** INFORME_SEGURIDAD_FINAL.md (v4)
**Orden:** de lo más crítico a lo más leve. Cada fase tiene dependencias explícitas, criterios de salida y plan de verificación.

> **PROGRESO (2026-10-04):**
> - ✅ **F1 (0.1, código):** clave de Resend fuera del código (`reports.service.ts` ahora usa `RESEND_API_KEY` por env) y despacho consolidado en `EmailService.sendReportEmail` con soporte de adjuntos.
> - ✅ **F1 (1.1):** localStorage ya no guarda contraseñas (solo `wms_remembered_email` + purga de la clave legado `wms_remembered_credentials`). *(aplicado en paralelo, verificado)*
> - ✅ **F1 (1.2):** `@Roles('ADMIN','SUPERVISOR')` a nivel de clase en `reports.controller.ts` + validación de `recipients` (regex + máximo). *(aplicado en paralelo, verificado)*
> - ✅ **F1 (1.3):** `getJwtSecret()` rechaza secretos débiles/`wms-secret`/<32 chars, `timingSafeEqual` en la verificación de firma; añadido check de `type: 'pwd_reset'` y campos obligatorios del payload. *(base aplicada en paralelo)*
> - ✅ **F1 (1.4):** 2FA cosmético desmontado por completo: import/estado/montaje fuera de `page.tsx`, botón fuera de `UserMenu` y `CommandPalette`; `TwoFactorModal.tsx` reducido a stub nulo.
> - ✅ **F1 (1.5):** `@Throttle(5/min)` en `forgot-password` y `reset-password` (`auth.controller.ts`).
> - ✅ Adicionales aplicados en paralelo: DTOs de auth con `class-validator`, reset con `MinLength(10)`, rol por defecto VIEWER server-side, Swagger solo en dev.
> - ⚠️ **Pendiente del usuario (F0):** rotar la clave de Resend en el dashboard (¡la del código ya está expuesta en el historial de git!), rotar anon key InsForge, `db policies` / `diagnose advisor`, `npm audit`.
> - 🔜 Siguiente: Fase 2 (fallback 403→InsForge + RLS).
>
> **PROGRESO FASE 2 (2026-10-04):**
> - ✅ **2.1:** `apiFetch` ya no degrada autorización: 401/403 se propagan siempre; el `catch` que redirigía errores de `/movements/` y `/locations/` al fallback solo actúa ante fallo de red genuino; 404 y 5xx en **escrituras** son error (nunca reintento contra InsForge); las lecturas 404/5xx conservan fallback.
> - ✅ **Modo estricto:** flag `NEXT_PUBLIC_STRICT_API=1` — con él, TODA escritura vía `fallbackInsforge` lanza error (`assertFallbackWritesAllowed`). Sin el flag, el comportamiento actual se conserva (sin romper producción) pero logueando advertencia.
> - ✅ **2.4:** creación/edición de usuarios vía fallback protegida por el guard estricto (obliga al camino NestJS con `@Roles('ADMIN')`).
> - ✅ **2.6:** stub falso de `users/me/anonymize` eliminado — el error real sustituye al "éxito" mentiroso.
> - ✅ **2.7:** stub falso de `auth/revoke-all` eliminado; organización hardcodeada `a1b2c3d4-...` sustituida por error honesto.
> - ✅ **2.3:** nuevo `POST /support/tickets` autenticado en NestJS (`support.controller.ts`, registrado en `AuditModule` global); `SupportModal` ya no escribe en `audit_logs` con la anon key — usa `apiFetch` con JWT del usuario (prop `token` añadida desde `page.tsx`).
> - ✅ **2.5:** rol por defecto VIEWER en el cliente *(aplicado en paralelo, verificado)*.
> - ⚠️ **2.2 (RLS) PENDIENTE:** requiere `npx -y @insforge/cli db policies` del usuario.
> - 📋 **Requisito de despliegue:** para activar el modo estricto en producción, definir `NEXT_PUBLIC_API_URL` (URL del NestJS desplegado) y `NEXT_PUBLIC_STRICT_API=1` en el build del frontend. Verificar antes que la API NestJS esté desplegada y accesible (la de Render devolvió 404 en la verificación).

> **Leyenda de esfuerzo:** S = horas, M = 1-3 días, L = más de una semana.
> **Regla general:** ninguna fase avanza sin cerrar los criterios de salida de la anterior. Las fases 0-1 son parables en caliente (no requieren rediseño); la fase 2 es la estructural.

---

## FASE 0 — Contención de secretos y verificación de terreno (Día 0, hoy)

**Objetivo:** eliminar el daño activo y levantar las 4 incógnitas que condicionan el resto del plan.

| # | Tarea | Detalle | Esfuerzo |
|---|---|---|---|
| 0.1 | **Rotar API key de Resend** (N1) | Dashboard Resend → revocar `re_GRZ2...` → crear nueva → guardar SOLO en variable de entorno `RESEND_API_KEY`. Eliminar la línea ofuscada de `apps/api/src/reports/reports.service.ts:166` y usar el `EmailService` ya existente. Buscar otros usos de `api.resend.com` en el repo. | S |
| 0.2 | **Verificar RLS de InsForge** (condiciona C3/N2/A5) | `npx -y @insforge/cli login && npx -y @insforge/cli db policies`. Documentar: ¿quién puede INSERT/UPDATE/DELETE sobre `user_profiles`, `audit_logs`, `products`, `inventory`, `locations`, `movements`? Ejecutar también `diagnose advisor --category security` y `metadata --json`. | S |
| 0.3 | **Auditar historial de git** | `git log --all -p -S "cmVfR1JaMkZlOGRf"` y `-S "anon_8c78b5a48a1c"`. Si el repo es privado con pocos colaboradores, la rotación (0.1) basta; si es público/compartido, considerar `git filter-repo`. | S |
| 0.4 | **Rotar anon key InsForge** (A4) | Panel InsForge → nueva anon key → actualizar `.env.local` (web) y `INSFORGE_ANON_KEY` (api). Preparado para quitar los 4 fallbacks hardcodeados en Fase 2. | S |
| 0.5 | **npm audit + inventario de dependencias** | `npm audit --workspaces`. Registrar CVEs (se sabe de antemano: `xlsx@0.18.5` → CVE-2023-30533, CVE-2024-22363). | S |

**Criterio de salida:** Resend rotada y sin clave en código; políticas RLS documentadas; anon key rotada; lista de CVEs priorizada.
**Verificación:** `grep -r "re_" apps/ --include="*.ts"` no devuelve claves; `grep -rn "anon_8c78" apps/` solo aparece en `.env*`.

---

## FASE 1 — Críticas de corrección inmediata (Días 1-3, en caliente)

**Objetivo:** cerrar las 5 críticas que no requieren rediseño arquitectónico. Despliegue rápido.

| # | Tarea | Detalle | Esfuerzo |
|---|---|---|---|
| 1.1 | **Eliminar guardado de contraseña en localStorage** (C1) | `apps/web/app/page.tsx:522-529`: borrar el branch de `rememberPassword` que persiste `password`; conservar solo email (`localStorage.setItem('wms_saved_email', email)`). Actualizar la restauración del effect (`page.tsx:317-325`) y quitar el checkbox de "recordar contraseña" del formulario (o renombrarlo a "Recordar mi correo"). Limpiar clave legacy: `localStorage.removeItem('wms_remembered_credentials')` en el bootstrap. | S |
| 1.2 | **Roles en /reports/** (C6) | `apps/api/src/reports/reports.controller.ts`: añadir `@Roles('ADMIN','SUPERVISOR')` a `inventory`, `movements`, `break-risk`, `bulk/dry-run`, `bulk/apply` y `schedule/dispatch`. Además en `dispatchSchedule`: validar `recipients` (solo emails de `user_profiles` activos de la organización, o whitelist de dominio) y limitar longitud del array (máx. 10). | S |
| 1.3 | **Fail-fast sin JWT_SECRET** (C5) | `apps/api/src/auth/auth.service.ts`: en `bootstrap()` (`main.ts`) validar que `JWT_SECRET` exista y tenga ≥32 caracteres; si falta, `process.exit(1)` con mensaje claro. Añadir comparación de firma con `crypto.timingSafeEqual` en `verifyPasswordResetToken`. Añadir check de `payload.type === 'pwd_reset'` y `payload.email` coincidente. | S |
| 1.4 | **Quitar el 2FA falso** (C4) | `apps/web/app/components/TwoFactorModal.tsx`: eliminar el componente y sus 3 puntos de montaje (`page.tsx`: menú lateral, `UserMenu`, `CommandPalette`). Si se desea mantener la entrada de menú, deshabilitarla con tooltip "Próximamente". | S |
| 1.5 | **Throttle específico en auth** (medio, barato de incluir aquí) | `@Throttle({ default: { limit: 5, ttl: 60000 } })` en `forgot-password` y `reset-password` (`auth.controller.ts`). | S |

**Criterio de salida:** VIEWER recibe 403 en `/reports/*`; login sin "recordar contraseña" persiste sesión pero no credenciales; API no arranca sin `JWT_SECRET`; no existe UI de 2FA.
**Verificación:** pruebas manuales con 3 roles distintos; `curl` a `/api/reports/inventory` con token VIEWER → 403.

---

## FASE 2 — Arquitectura de autorización (Semanas 1-2) ⭐ La fase estructural

**Objetivo:** que la autorización deje de ser eludible. Elimina el fallback y mueve el perímetro al backend. **Esta fase depende del resultado de 0.2 (RLS).**

| # | Tarea | Detalle | Esfuerzo |
|---|---|---|---|
| 2.1 | **Eliminar el fallback 403→InsForge** (C2) | `apps/web/lib/api.ts:157-186`: en `apiFetch`, borrar el branch que llama a `fallbackInsforge` para 401/403/404; propagar el error al UI (toast ya existe). Conservar el fallback SOLO para endpoints de solo-lectura que NestJS no implementa (404 en GET). Auditar todos los puntos de llamada a `fallbackInsforge`: movimientos/`inventory` (write directo: líneas 656-808) deben eliminarse o quedar tras feature-flag de solo emergencia. | M |
| 2.2 | **Endurecer RLS de InsForge** (C3, N2, A5) | Con resultado de 0.2, aplicar políticas: `user_profiles` → UPDATE solo con `role = 'ADMIN'` verificado vía función security-definer; `audit_logs` → INSERT/UPDATE/DELETE solo service-role (bloquear todo a anon y usuarios); lecturas de `audit_logs` solo ADMIN. Crear las políticas con `insforge-cli db query` o migración SQL. | M |
| 2.3 | **Migrar soporte a flujo autenticado** | `SupportModal.tsx`: reemplazar el INSERT anónimo a `audit_logs` por llamada al endpoint NestJS `POST /support/tickets` (crear controlador pequeño que persista con el JWT del usuario). Si se prefiere InsForge, hacerlo vía edge function con service-role. | M |
| 2.4 | **Creación de usuarios solo server-side** (N4) | `apps/web/lib/api.ts:832-851`: eliminar el branch de `POST /users` en `fallbackInsforge`. Dejar solo el camino NestJS (`users.controller` ya tiene `@Roles('ADMIN')`). | S |
| 2.5 | **Default VIEWER + deny-by-default en cliente** (A1) | `lib/api.ts:207`: `role` por defecto `VIEWER` (no ADMIN) cuando el fetch del perfil falle; además, si el fetch falla, bloquear acciones de escritura en UI y mostrar error de conexión. | S |
| 2.6 | **Quitar fallback RGPD falso** (A6) | `lib/api.ts:940-942`: eliminar el stub `/users/me/anonymize` que devuelve éxito; el endpoint real de NestJS ya funciona. | S |
| 2.7 | **Quitar stubs falsos restantes** | `lib/api.ts:917-919` (`/auth/revoke-all` falso — se sustituye en Fase 3) y `organizations/current` (devuelve org hardcodeada). Marcar con error real hasta que existan. | S |

**Criterio de salida:** un OPERATOR que intente cambiar su rol recibe 403 definitivo (sin reintento silencioso); anónimos no pueden escribir en ninguna tabla; el soporte persiste tickets autenticados; `grep -n "fallbackInsforge" apps/web/lib/api.ts` solo muestra lecturas 404.
**Verificación:** reproducir ataques con curl: `PATCH /api/database/records/user_profiles?id=eq.<propio>` con JWT de OPERATOR → debe ser denegado por RLS; probar `POST audit_logs` sin JWT → 403.
**Riesgo/rollback:** esta fase cambia flujos de UI. Desplegar detrás de variable `NEXT_PUBLIC_STRICT_API=1` una semana, comparando métricas de errores 4xx antes de quitar el flag.

---

## FASE 3 — Sesión, credenciales y flujos de email (Mes 1)

**Objetivo:** que "cerrar sesión" signifique algo y que las credenciales nunca viajen por canales inseguros.

| # | Tarea | Detalle | Esfuerzo |
|---|---|---|---|
| 3.1 | **Revocación real de sesiones** (A2) | InsForge maneja los JWT; implementar control propio: columna `token_version` (o tabla `session_revocations`) en `user_profiles`; `validateAccessToken` (`auth.service.ts:26-70`) compara la versión del token contra la del perfil; `revokeAllSessions` incrementa la versión. El botón "cerrar sesión en todos los dispositivos" pasa a funcionar de verdad. | M |
| 3.2 | **Expiración server-side de sesión** (A3) | Con 3.1: registrar `last_seen_at` en cada request validada (throttle interno 1/min); si `now - last_seen > 15 min`, rechazar el token. El modal de inactividad del cliente se mantiene como UX, pero deja de ser el control. | M |
| 3.3 | **Onboarding sin contraseña por email** (N3) | `users.service.ts` `createUser`: en vez de enviar `dto.password` por email, generar contraseña temporal aleatoria, forzar su rotación (flag `must_change_password`) o mejor: enviar enlace de primer login con token de un solo uso (reusar el mecanismo de reset ya existente). Eliminar el parámetro `tempPassword` de `sendWelcomeEmail` (`email.service.ts:79-96`). | M |
| 3.4 | **Política de contraseñas unificada** (F1) | `CreateUserDto`: `@MinLength(10)` (o 12) + regex de complejidad; extraer validador compartido y aplicarlo también en `resetPassword`. Opcional: chequeo k-anonymity contra haveibeenpwned (API gratuita, sin enviar la contraseña). | S |
| 3.5 | **Reset token fuera de la query string** (A7) | `email.service.ts:51`: URL `/${webOrigin}/reset/${token}` (token en path). Crear página `app/reset/[token]/page.tsx` que consuma el token en memoria y haga POST; no persistir en URL después. Configurar `Referrer-Policy: strict-origin-when-cross-origin` (ver 4.3). | M |
| 3.6 | **Rotar y centralizar anon key** (A4, cierre) | Con Fase 2 completa, verificar que no queden fallbacks `anon_8c78...` en código (`insforge.ts:5`, `api.ts:28`, `SupportModal.tsx:102`, `users.service.ts:58`). Solo `.env`. Si la rotación de 0.4 se hizo tras el despliegue de esta fase, no habrá rotura. | S |

**Criterio de salida:** revocar sesiones invalida tokens en <1 request; un token sin actividad de 15 min es rechazado server-side; ningún email contiene contraseñas; contraseñas <10 rechazadas en todos los flujos.
**Verificación:** test de integración: login → revoke-all → request con el mismo token → 401. Test de contraseñas débiles en createUser y resetPassword.

---

## FASE 4 — Hardening técnico y cabeceras (Mes 1-2)

**Objetivo:** elevar el costo de cualquier error futuro. Tareas pequeñas e independientes (se pueden paralelizar).

| # | Tarea | Detalle | Esfuerzo |
|---|---|---|---|
| 4.1 | **Cabeceras de seguridad en Next** | `next.config.mjs`: añadir `headers()` con CSP (empezar en report-only), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Strict-Transport-Security` (si sirve por dominio propio; en Vercel HSTS ya viene). Iterar CSP hasta 0 violaciones y pasar a enforce. | M |
| 4.2 | **Helmet con CSP en API** | `main.ts:25-29`: activar `contentSecurityPolicy` (la API no sirve HTML; CSP `default-src 'none'` es trivial) y añadir `hsts()`. | S |
| 4.3 | **Swagger solo en dev** | `main.ts:51-58`: montar solo si `process.env.NODE_ENV !== 'production'`. | S |
| 4.4 | **CORS sin comodín** | `main.ts:44`: eliminar el regex `\.vercel\.app$`; reemplazar por lista explícita de dominios de producción en `WEB_ORIGIN` (comma-separated ya soportado). | S |
| 4.5 | **Parametrizar el único raw no seguro** (N5) | `users.service.ts:93-95`: `$executeRawUnsafe` → `$executeRaw` con `Prisma.sql` y binding `${userId}::uuid`. Revisar que no queden más (`grep -rn "Unsafe" apps/api/src`). | S |
| 4.6 | **CSV/Excel injection** (N6) | `reports.service.ts:375-390`: sanitizar cada valor exportado — si empieza por `= + - @` (o tab/CR), prefijar `'`. Aplicar también en exports del cliente si hay (`ProductImportExportModal`). | S |
| 4.7 | **ZPL injection** (F2) | `operations.service.ts:268-289`: escapar `^` y `\` en `title`/`subtitle`/`code` antes de interpolar (función `zplEscape`). | S |
| 4.8 | **Realtime autenticado** (F3) | `syncEvents.ts:62-63`: quitar el `publish` con anon key desde el cliente; las mutaciones ya notifican en la misma ventana/tab (CustomEvent) y vía BroadcastChannel local. Si se necesita sync cross-device, publicar desde el backend NestJS tras cada mutación. | S |
| 4.9 | **Sentry con muestreo y sin DSN en código** | `sentry.client.config.ts:3` y `SupportModal.tsx:159-161`: `tracesSampleRate: 0.1`, `sendDefaultPii: false`, `beforeBreadcrumbs` que strippee query strings con `token|resetToken`. DSN solo por env (es público por diseño, pero sin fallback duplicado). | S |
| 4.10 | **Health endpoint sin internals** | `health.controller.ts:24-36`: responder 503 con `{status:'error'}` sin el mensaje de error de la BD (loguearlo server-side). | S |
| 4.11 | **Scope de organización en lecturas** | `movements.service.ts:findAll` y `audit.service.ts:findAll`: filtrar por `organizationId` del usuario (viene del perfil) en lugar de aceptar query libre. | M |
| 4.12 | **Roles en dashboard/organizations** | `POST /dashboard/refresh` → `@Roles('ADMIN','SUPERVISOR')`; decidir producto de `POST /organizations` (si single-tenant, quitarlo). | S |
| 4.13 | **Migrar xlsx del frontend** | Reemplazar `xlsx@0.18.5` por `exceljs` (ya en uso en API) o SheetJS desde CDN oficial en `ProductImportExportModal.tsx`. | M |

**Criterio de salida:** securityheaders.com ≥ A en el frontend; no queda ningún `$...Unsafe` con interpolación; reportes Excel con fórmulas prefijadas no ejecutan; `wms_warehouse_sync` no publicable desde anónimos.
**Verificación:** curl -I al dominio para cabeceras; test unitario de `zplEscape` y del sanitizador CSV con payload `=HYPERLINK(...)`.

---

## FASE 5 — Estructural y mejora continua (Trimestre)

**Objetivo:** convertir la seguridad en proceso, no en parche.

| # | Tarea | Detalle | Esfuerzo |
|---|---|---|---|
| 5.1 | **TOTP real** | Implementar 2FA server-side con `otplib`/`speakeasy`: enrollment con QR real, códigos de respaldo hasheados, obligatorio para rol ADMIN. Aprovechar que la UI ya tiene el modal (rediseñarlo). | L |
| 5.2 | **Auth de borde en el frontend** | `apps/web/middleware.ts`: redirigir a login si no hay cookie/sesión válida (defensa en profundidad; no sustituye la validación server-side). Considerar mover el token de sesión de localStorage a cookie httpOnly + CSRF token. | L |
| 5.3 | **CI de seguridad** | GitHub Actions: `npm audit` (fail en high), `gitleaks`/`trufflehog` contra cada PR (evita repetir N1), test de contraseñas débiles, lint de reglas de seguridad. Dependabot/Renovate activo. | M |
| 5.4 | **Workspace fuera de OneDrive** | Mover el repo (o al menos excluir `.insforge/`, `.env*`) de la sincronización; la `api_key` de administración no debe vivir en la nube personal. Alternativa: volátiles en `.env` local + secrets de InsForge. | S |
| 5.5 | **Auditoría de prueba de RLS automatizada** | Script que, con tokens de cada rol, verifique periódicamente (post-deploy) que: OPERATOR no puede PATCH `user_profiles`; anónimo no puede INSERT `audit_logs`; VIEWER no puede POST movimientos. Falla el pipeline si el RLS se relaja. | M |
| 5.6 | **Limpieza de repo** | `script.js` de la raíz → borrar o mover a `scripts/dev/` gitignored; PII `yisusxat@gmail.com` fuera del código; `ForgotPasswordModal` default `localhost:3001` → requerir `NEXT_PUBLIC_API_URL` explícito. | S |

---

## Cronograma resumido

| Semana | Fase | Entregable principal |
|---|---|---|
| 0 (día 0) | F0 | Secretos rotados, RLS documentado |
| Días 1-3 | F1 | 5 críticas cerradas en caliente |
| Semanas 1-2 | F2 ⭐ | Autorización no eludible (fallback fuera + RLS duro) |
| Semanas 3-4 | F3 | Sesiones reales, emails sin credenciales |
| Semanas 5-8 | F4 | Hardening completo (cabeceras, injection, scopes) |
| Trimestre | F5 | 2FA real, CI de seguridad, proceso |

## Métricas de éxito

- 0 secretos activos en código o historial (verificado por gitleaks en CI).
- Todo cambio de estado pasa por el backend NestJS con rol verificado (0 escrituras directas del cliente a InsForge).
- Revocación de sesión efectiva en 1 request; inactividad de 15 min rechazada server-side.
- Score A en securityheaders.com; 0 hallazgos críticos en `diagnose advisor`.
- Script de prueba de RLS verde en cada deploy.

## Gestión de riesgos del propio plan

- **F2 puede romper flujos** que hoy dependen del fallback (offline, migraciones de datos): desplegar con flag y seguir métricas de errores 4xx una semana antes de consolidar.
- **RLS restrictivo puede romper la app si el backend usa la anon key para escribir** (ej. `users.service.createUser` usa anon key): verificar que todas las escrituras server-side usen service-role antes de aplicar políticas.
- **Rotar anon key (0.4/F3.6) después** de quitar los hardcodes, no antes, para no tumbar el despliegue actual.
