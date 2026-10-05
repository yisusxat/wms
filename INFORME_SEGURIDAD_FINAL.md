# 🔐 Informe Final de Auditoría de Seguridad — Proyecto WMS (v4, definitivo)

**Fecha:** 2026-10-03
**Alcance:** Monorepo completo — `apps/web` (Next.js 15 + @insforge/sdk), `apps/api` (NestJS + Prisma), backend InsForge (`https://jirv3k8h.us-east.insforge.app`), PWA/service worker, configs de despliegue.
**Metodología:** 4 pasadas white-box: (1) auth, sesión, secretos, arquitectura; (2) servicios NestJS, emails, auditoría; (3) integridad de stock, DTOs, ZPL, realtime, dependencias; (4) controladores restantes, anonimización real, escáner, validación de DTOs de movimientos.
**Limitaciones:** Shell caído en todas las sesiones (error DLL de Git Bash). Pendientes: `npm audit`, historial de git, y verificación RLS de InsForge vía CLI.

---

## 1. Resumen ejecutivo

| Métrica | Valor |
|---|---|
| Críticos | **8** |
| Altos | **8** |
| Medios | **~8** |
| Bajos | **~8** |
| Secretos activos en código | **3** (API key Resend real, anon key InsForge, api_key admin en OneDrive) |
| Funciones de seguridad cosméticas | **2** (2FA falso; revocación de sesiones no-op). RGPD: ver corrección §2 |

**Veredicto:** El backend NestJS es de calidad (guards por rol en controladores sensibles, DTOs con validación estricta, funciones Postgres atómicas para stock, excepciones sin fuga interna, anonimización RGPD real). El problema es estructural: **el frontend puede eludir todo ese backend** con su fallback directo a InsForge ante 403/401, y el perímetro efectivo queda en manos de un RLS jamás verificado. Sumado a una API key de Resend activa commitada y la contraseña en texto plano en localStorage, el sistema hoy depende de la buena fe de cualquier usuario autenticado.

---

## 2. Corrección importante de la 4ª pasada (a favor del proyecto)

**A6 "Anonimización RGPD falsa" → CORREGIDO.** La 2ª pasada reportó la anonimización como no-op basándose en el fallback del cliente (`lib/api.ts:940-942`). La 4ª pasada verificó el endpoint real de NestJS: **`POST /api/users/me/anonymize` SÍ anonimiza de verdad** (`users.service.ts:218-233`: renombra el perfil, desactiva la cuenta, sobreescribe el email en `auth.users` con queries parametrizadas y registra auditoría). El hallazgo se re-clasifica como **baja**: el fallback del cliente devuelve un mensaje de éxito falso cuando NestJS no está disponible — un problema de honestidad del UI, no de cumplimiento. Patrón que se repite: casi todo hallazgo "falso" del lado cliente tiene una implementación real en NestJS que el fallback ignora.

**Nuevos hallazgos menores de la 4ª pasada:**
- `POST /dashboard/refresh` sin `@Roles`: cualquier usuario autenticado fuerza el recálculo de vistas de dashboard (potencialmente costoso; abuso leve).
- `POST /organizations` sin restricción: cualquier usuario autenticado puede crear organizaciones (revisar si es negocio intencional en un WMS single-tenant "Bodega Central").
- Positivos verificados: DTOs de movimientos con validación estricta (`@IsInt @Min(1)` en quantity — `receive-stock.dto.ts`); `locations.controller` PATCH con roles ADMIN/SUPERVISOR/OPERATOR; `BarcodeScanner` procesa cámara/OCR localmente sin riesgo (solo seed demo hardcodeado); `CommandPalette` es solo navegación.

---

## 3. Evolución de las cuatro pasadas

| Pasada | Enfoque | Aporte |
|---|---|---|
| 1ª | Auth, sesión, secretos web, config API | C1–C6, A1–A7 |
| 2ª | Servicios NestJS, emails, auditoría, `.insforge/` | N1 (clave Resend), N2 (audit_logs anónimo), N3, N4, N5, N6 |
| 3ª | Integridad stock, DTOs users, ZPL, realtime, deps | F1, F2, F3; refinó race condition (solo en fallback) |
| 4ª | Controladores restantes, anonimización, escáner, DTOs movimientos | **Corrigió A6 (RGPD real)**; 2 menores; verificó locations/DTOs |

Ningún hallazgo crítico fue retractado en 4 pasadas; uno alto (A6) fue corregido a baja tras verificar el código server-side.

---

## 4. Hallazgos críticos — acción inmediata

### C1. Contraseña en texto plano en localStorage — `apps/web/app/page.tsx:525`
`wms_remembered_credentials = { email, password }` sin cifrar. XSS, extensiones, acceso físico o sync de perfil la exponen. **Fix:** recordar solo el email.

### C2. El frontend bypasea la autorización del backend — `apps/web/lib/api.ts:170-173`
Todo 403/401/404 de NestJS se reintenta como acceso directo a InsForge con el JWT del usuario. Doble daño: anula el RolesGuard **y** reemplaza las funciones atómicas de stock por read-modify-write con condiciones de carrera (verificado en 3ª pasada: el camino NestJS es atómico, el fallback no). **Fix:** eliminar el fallback para 4xx.

### C3. Escalada de roles: `user_profiles` escribible desde el cliente — `apps/web/lib/api.ts:866-896`
PATCH directo de rol/permisos/estado desde el navegador. Si el RLS lo permite → autoprivación de ADMIN con un curl. **PENDIENTE VERIFICAR RLS (§7).**

### C4. 2FA falso — `TwoFactorModal.tsx:17-23`
Secreto TOTP hardcodeado, sin verificación server-side, acepta cualquier código de 6 dígitos. Falsa sensación de seguridad. **Fix:** quitar el modal o implementar TOTP real.

### C5. `JWT_SECRET` con default conocido — `auth.service.ts:73`
Sin la env var, los tokens de reset se firman con `'wms-secret'` → forgeables → takeover de cualquier cuenta vía `/auth/reset-password`. **Fix:** fail-fast + rotar.

### C6. `/reports/*` sin rol — `reports.controller.ts`
Cualquier VIEWER puede: descargar inventario completo, ejecutar `bulk/apply` (modifica stock masivo) y `schedule/dispatch` (exfiltra datos por email a destinatario arbitrario). **Fix:** `@Roles('ADMIN','SUPERVISOR')` + whitelist de `recipients`.

### N1. API key de Resend activa en código e historial — `reports.service.ts:166`
Ofuscada en base64. El archivo está commitado → la clave está en el historial de git. Permite phishing desde tu dominio. **Fix: ROTAR HOY.**

### N2. `audit_logs` escribible sin autenticación — `SupportModal.tsx:123-132`
INSERT con solo la anon key. Si funciona en producción, cualquiera falsifica la bitácora — y es indicador de RLS permisivo (haría C3 explotable). **Fix:** RLS + solo JWT server-side.

---

## 5. Hallazgos altos

| ID | Hallazgo | Evidencia |
|---|---|---|
| A1 | Rol ADMIN por defecto en cliente si falla el perfil | `lib/api.ts:207` |
| A2 | "Cerrar sesión en todos los dispositivos" no revoca nada (solo audita) | `auth.service.ts:137-147` |
| A3 | Timeout de inactividad 100% cliente (bypass con setInterval en consola) | `InactivityTimerModal.tsx` |
| A4 | Anon key hardcodeada como fallback en 4 archivos (commitada) | `insforge.ts:5`, `api.ts:28`, `SupportModal.tsx:102`, `users.service.ts:58` |
| A5 | `audit_logs` legible por cualquiera vía fallback | `api.ts:898-915` |
| A7 | Token de reset en query string del email | `email.service.ts:51` |
| N3 | Contraseña inicial en texto plano por email | `users.service.ts:135`, `email.service.ts:90-95` |
| N4 | Creación de usuarios en InsForge Auth desde el cliente | `api.ts:832-851` |

## 6. Medios

- **N5.** `$executeRawUnsafe` con interpolación `'${userId}'` — `users.service.ts:93-95`. Parametrizar.
- **N6.** CSV/Excel injection sin neutralizar `= + - @` — `reports.service.ts:375-390`.
- **F1.** Política de contraseñas: `MinLength(6)` en CreateUserDto vs 8 en reset; sin complejidad.
- **F3.** Realtime publicable con anon key (amplificación de re-fetches) — `syncEvents.ts:62-63`.
- Swagger público sin gate — `main.ts:51-58`. · CORS `*.vercel.app` con credentials — `main.ts:44`. · Sin CSP/HSTS en web; helmet sin CSP en API. · `GET /movements` y `/audit-logs` sin scope de organización. · Sentry `tracesSampleRate 1.0` + DSN en 3 sitios (puede capturar URLs con el token de A7).

## 7. Bajos

- **A6 (corregido):** fallback del cliente finge éxito de anonimización RGPD (el endpoint real sí funciona — `users.service.ts:218-233`).
- **F2.** ZPL injection en etiquetas (nombre/categoría interpolados) — `operations.service.ts:268-289`.
- `xlsx@0.18.5` con CVE-2023-30533 y CVE-2024-22363 (npm congelado; API ya usa exceljs).
- `POST /dashboard/refresh` y `POST /organizations` sin rol (4ª pasada).
- `/health` filtra errores de BD — `health.controller.ts:24-36`. · forgot-password sin throttle propio. · PII `yisusxat@gmail.com` en código. · `ForgotPasswordModal` default `localhost:3001`. · `.insforge/project.json` (api_key admin) en carpeta OneDrive. · `script.js` raíz sin trackear. · Sin `middleware.ts` (cero auth de borde). · Token reset no valida campo `type`.

## ✅ Verificado y correcto (4 pasadas)

AuthGuard valida token server-side contra InsForge; RolesGuard correcto en users/products/movements/locations; DTOs estrictos (`@IsUUID`, `@IsInt @Min(1)`); funciones Postgres atómicas para stock (locks 55P03, stock P0001); ValidationPipe whitelist; ThrottlerGuard; HttpExceptionFilter sin fugas; queries raw parametrizadas (salvo N5); bcrypt vía pgcrypto; **anonimización RGPD real**; offlineSync sin tokens; sw.js no cachea mutaciones; configs de deploy limpias; `.gitignore` correcto; forgot-password no enumera emails.

---

## 8. Verificaciones pendientes (shell)

```bash
npx -y @insforge/cli login
npx -y @insforge/cli db policies        # C3 y N2: ¿UPDATE user_profiles / INSERT audit_logs anónimo?
npx -y @insforge/cli diagnose advisor --category security
npx -y @insforge/cli metadata --json
npm audit --workspaces
git log --all -p -S "cmVfR1JaMkZlOGRf" --oneline | head -5   # historial clave Resend
git log --all -p -S "anon_8c78b5a48a1c" --oneline | head -5   # historial anon key
```

## 9. Plan de remediación

**HOY:** 1) Rotar clave Resend (N1). 2) Quitar contraseña de localStorage (C1). 3) `@Roles` en `/reports/*` + validar recipients (C6). 4) Fail-fast sin `JWT_SECRET` (C5). 5) Quitar modal 2FA (C4).

**SEMANA 1-2:** 6) Eliminar fallback 403→InsForge (C2 — el cambio estructural clave). 7) RLS: service-role única vía de escritura a `audit_logs`; ADMIN único escritor de `user_profiles` (C3, N2, A5). 8) Users solo server-side (N4). 9) Default VIEWER (A1).

**MES 1:** 10) Revocación real de sesiones + expiración server-side (A2, A3). 11) Onboarding sin password por email + política unificada ≥10 (N3, F1). 12) CSP/HSTS, Swagger dev-only, CORS sin comodín. 13) CSV/ZPL injection (N6, F2). 14) Reset token fuera de query string (A7). 15) Rotar anon key (A4). 16) Éxito falso del fallback RGPD (A6).

**TRIMESTRE:** 17) TOTP real. 18) Scope multi-org en lecturas. 19) Migrar xlsx. 20) Workspace fuera de OneDrive. 21) Throttle específico en forgot-password/refresh.

---
*Informe v4 definitivo. Hallazgos C3/N2 quedan condicionados a la verificación RLS (§8). Generado por auditoría de código white-box asistida.*
