# 🔐 Informe Final de Auditoría de Seguridad — Proyecto WMS

**Fecha:** 2026-10-03
**Alcance:** Monorepo completo — `apps/web` (Next.js 15 + @insforge/sdk), `apps/api` (NestJS + Prisma), backend InsForge (`https://jirv3k8h.us-east.insforge.app`), service worker PWA, configs de despliegue.
**Metodología:** Auditoría de código estático (white-box) en 3 pasadas sucesivas: (1) autenticación, sesión, secretos y arquitectura de API; (2) servicios NestJS, emails, auditoría y modales; (3) integridad de stock, DTOs, operaciones/etiquetas ZPL, realtime, dependencias y configs de despliegue.
**Limitaciones:** El shell de la máquina estuvo caído durante las 3 sesiones (error DLL de Git Bash). No se pudieron ejecutar: `npm audit`, `git log` (historial de secretos), ni los comandos del CLI de InsForge (`db policies`, `diagnose advisor`). Las verificaciones dependientes de RLS quedan marcadas como PENDIENTE.

---

## 1. Resumen ejecutivo

| Métrica | Valor |
|---|---|
| Hallazgos críticos | **8** |
| Hallazgos altos | **9** |
| Hallazgos medios | **7** |
| Hallazgos bajos | **5+** |
| Secretos activos expuestos en código | **3** (API key Resend real, anon key InsForge, api_key admin en OneDrive) |
| Funciones de seguridad cosméticas (no operativas) | **3** (2FA, revocación de sesiones, anonimización RGPD) |

**Veredicto:** La API NestJS está sólidamente construida (guards por rol, validación DTO, throttling, funciones Postgres atómicas para stock, filtro de excepciones sin fuga de internals). Sin embargo, la arquitectura real del sistema **la eluye por diseño**: el frontend hace fallback directo a la base de datos InsForge cuando NestJS deniega (403/401), el control de acceso efectivo depende de un RLS no verificado, la contraseña del usuario se guarda en texto plano en el navegador, y hay una API key de Resend activa ofuscada en base64 dentro del código. El riesgo dominante no es un bug puntual: es que **la autorización es decorativa en la práctica**.

---

## 2. Evolución de las tres pasadas

| Pasada | Aporte | Nuevos hallazgos |
|---|---|---|
| 1ª | Autenticación, sesión, fallback, secretos web, config NestJS | C1–C6, A1–A7 |
| 2ª | Servicios NestJS internos, emails, auditoría, modales, `.insforge/` | N1 (clave Resend), N2 (audit_logs anónimo), N3 (password por email), N4 (crear users desde cliente), N5 (SQL interpolado), N6 (CSV injection), N7 (varios) |
| 3ª | Integridad de stock, DTOs, ZPL, realtime, dependencias, despliegue | F1 (política contraseñas débil), F2 (ZPL injection), F3 (realtime anónimo), F4 (refinamiento race condition), dependencia xlsx vulnerable |

**Refinamiento importante de la 3ª pasada:** la condición de carrera en inventario señalada en la 1ª pasada **solo existe en el camino de fallback del cliente**. El camino NestJS es atómico (funciones `wms_receive_stock_v2` / `wms_issue_stock_v2` / `wms_transfer_stock_v2` con manejo de locks `55P03` y stock insuficiente `P0001` — `movements.service.ts:15-100`). Esto agrava el hallazgo C2: el fallback no solo bypasea autorización, también degrada la integridad transaccional.

---

## 3. Hallazgos críticos (acción inmediata)

### C1. Contraseña en texto plano en localStorage — `apps/web/app/page.tsx:525`
`localStorage.setItem('wms_remembered_credentials', JSON.stringify({ email, password }))`. Cualquier XSS, extensión del navegador, acceso físico o sincronización de perfil expone la credencial completa. **Remediación:** eliminar la función; "recordar" debe guardar solo el email.

### C2. El frontend bypasea la autorización del backend — `apps/web/lib/api.ts:170-173`
```js
if (response.status === 403 || response.status === 401 || response.status === 404) {
  return fallbackInsforge(...); // reintenta directo contra la BD
}
```
Cada 403/401 de NestJS se reintenta como escritura/lectura directa a InsForge con el JWT del usuario. Anula el sistema de roles del NestJS **y** reemplaza las funciones atómicas de stock por read-modify-write sin transacción (condiciones de carrera). **Remediación:** eliminar el fallback para toda respuesta 4xx; los 403/401 deben ser definitivos.

### C3. Escalada de roles: `user_profiles` escribible desde el cliente — `apps/web/lib/api.ts:866-896`
El cambio de rol/permisos/estado se envía como `PATCH` directo del navegador a `user_profiles`. Si el RLS lo permite, cualquier usuario se autoproclama ADMIN con un curl. **PENDIENTE VERIFICAR RLS** (ver §7). **Remediación:** RLS restrictivo + eliminar la ruta de escritura desde cliente.

### C4. 2FA falso — `apps/web/app/components/TwoFactorModal.tsx:17-23`
Secreto TOTP hardcodeado (`JBSWY3DPEHPK3PXP`), QR placeholder, "verificación" que acepta cualquier código de 6 dígitos, códigos de respaldo fijos, cero participación del servidor. Genera falsa sensación de seguridad. **Remediación:** eliminar el modal o implementar TOTP real server-side.

### C5. `JWT_SECRET` con default conocido — `apps/api/src/auth/auth.service.ts:73`
`config.get('JWT_SECRET', 'wms-secret')`. Sin la variable de entorno, los tokens de reset de contraseña se firman con un secreto commitado → forgeable → takeover de cualquier cuenta vía `/auth/reset-password`. Comparación de firma no constante en tiempo (menor). **Remediación:** fail-fast al arrancar sin `JWT_SECRET` fuerte; rotar el valor actual.

### C6. `/reports/*` sin restricción de rol — `apps/api/src/reports/reports.controller.ts`
Con `RolesGuard` registrado pero sin ningún `@Roles(...)`, cualquier usuario autenticado (incl. VIEWER) puede: descargar inventario/movimientos completos, ejecutar `POST /reports/bulk/apply` (modifica stock masivamente) y `POST /reports/schedule/dispatch` (exfiltra datos por email a cualquier destinatario). **Remediación:** `@Roles('ADMIN','SUPERVISOR')` en todos; validar lista `recipients` contra dominio/miembros.

### N1. API key de Resend activa en el código — `apps/api/src/reports/reports.service.ts:166`
```js
const resendKey = Buffer.from("cmVfR1JaMkZlOGRfQ1NlcE0xWURkTHpTS3FXR2lOWTd6QUxD", "base64").toString("utf8");
```
Clave real ofuscada en base64 (el archivo está commitado → también está en el historial de git). Permite enviar phishing desde tu dominio y agotar tu cuota. **Remediación:** ROTAR HOY en dashboard de Resend → `RESEND_API_KEY` en env. Nota: el servicio ya la duplica correctamente vía `EmailService`; unificar.

### N2. Log de auditoría escribible sin autenticación — `apps/web/app/components/SupportModal.tsx:123-132`
Inserta en `audit_logs` usando solo la anon key (`Authorization: Bearer <anonKey>`), sin JWT. Si el POST tiene éxito en producción, cualquier persona de internet falsifica el "registro inmutable" de auditoría — y constituye evidencia de que el RLS permite escritura anónima (lo que haría C3 explotable). **Remediación:** RLS que niegue INSERT anónimo; tickets solo con JWT server-side.

---

## 4. Hallazgos altos

| ID | Hallazgo | Evidencia | Remediación |
|---|---|---|---|
| A1 | Rol ADMIN por defecto en cliente si falla la carga de perfil | `lib/api.ts:207` | Default `VIEWER`; denegar en caso de duda |
| A2 | "Cerrar sesión en todos los dispositivos" es no-op (solo loguea) | `auth.service.ts:137-147` | Blacklist por `jti` / versionado de token |
| A3 | Timeout de inactividad 100% cliente, bypasseable con un setInterval en consola | `InactivityTimerModal.tsx` | Expiración server-side; token de vida corta |
| A4 | Anon key de InsForge hardcodeada como fallback (commitada) | `lib/insforge.ts:5`, `lib/api.ts:28`, `SupportModal.tsx:102`, `users.service.ts:58` | Rotar; solo env vars |
| A5 | `audit_logs` legible por cualquier usuario vía fallback | `lib/api.ts:898-915` | RLS lectura solo ADMIN |
| A6 | Anonimización RGPD falsa (devuelve mensaje sin hacer nada) | `lib/api.ts:940-942` | Implementar real o quitar la UI/legal |
| A7 | Token de reset en query string del email (logs, historial, Referer) | `email.service.ts:51` | Path/fragmento + una sola vista |
| N3 | Contraseña inicial en texto plano por email al crear usuario | `users.service.ts:135`, `email.service.ts:90-95` | Enlace de primer login con token de un solo uso |
| N4 | Creación de usuarios en InsForge Auth desde el cliente | `lib/api.ts:832-851` | Solo server-side con `@Roles('ADMIN')` |

---

## 5. Hallazgos medios

- **N5.** SQL con interpolación de string (`$executeRawUnsafe` con `'${userId}'`) — `users.service.ts:93-95`. Explotabilidad baja (origen interno) pero es el único raw no parametrizado del proyecto. Parametrizar.
- **N6.** CSV/Excel injection: el export no neutraliza prefijos `=`, `+`, `-`, `@` — `reports.service.ts:375-390`. Un nombre de producto malicioso ejecuta fórmulas al abrir el reporte en Excel. Prefijar `'` o espacio.
- **F1.** Política de contraseñas débil e inconsistente: `CreateUserDto` exige `MinLength(6)` (`users/dto/create-user.dto.ts:13`) mientras el reset exige 8 (`auth.service.ts:116`). Sin complejidad ni chequeo de brechas. Unificar en ≥10 con haveibeenpwned opcional.
- **F3.** Canal realtime `wms_warehouse_sync` publicable con anon key — `lib/syncEvents.ts:62-63`. Cualquiera puede disparar re-fetches masivos en todos los clientes conectados (amplificación). Publicar solo server-side.
- **Swagger público** sin gate de entorno — `main.ts:51-58`.
- **CORS permite cualquier `*.vercel.app` con credentials** — `main.ts:44`. Eliminar el comodín.
- **Sin cabeceras de seguridad** en el frontend: sin CSP, X-Frame-Options, HSTS (`next.config.mjs`); helmet con `contentSecurityPolicy: false` en API (`main.ts:25-29`).
- **Endpoints de lectura sin scope de organización** (`GET /movements`, `GET /audit-logs`): en multi-tenant, cualquier usuario lee todo.
- **Sentry `tracesSampleRate: 1.0` + DSN hardcodeado en 3 sitios**: puede capturar URLs con tokens (A7) — `sentry.client.config.ts:3`, `SupportModal.tsx:159-161`.
- **Health endpoint filtra mensajes de error de la BD** — `health.controller.ts:24-36`.
- **Forgot-password sin throttle propio** (bombardeo de email); `webOrigin` del reset tomado de env sin whitelist estricta.

## 6. Hallazgos bajos / hardening

- **F2.** ZPL injection en etiquetas: `title`/`subtitle` (nombre/categoría de producto, controlables por usuario) se interpolan sin escape en ZPL para impresoras Zebra — `operations.service.ts:268-289`. Sanitizar `^` o usar `^FH`.
- **F4.** (Refinamiento) La condición de carrera de stock existe **solo** en el fallback cliente→InsForge; el camino NestJS es atómico. Refuerza C2.
- **xlsx@0.18.5** (npm, sin actualizar): CVE-2023-30533 (prototype pollution) y CVE-2024-22363 (ReDoS). La API ya usa `exceljs`; alinear el frontend o migrar a SheetJS desde su CDN oficial. *(npm audit no ejecutable — verificar.)*
- `GET /operations/*` sin `@Roles` (solo lectura; aceptable pero documentarlo).
- PII en código: `yisusxat@gmail.com` como destinatario por defecto — `ReportsPanel.tsx:109`, `reports.controller.ts:62`.
- `ForgotPasswordModal` apunta a `localhost:3001` por defecto — `ForgotPasswordModal.tsx:11`.
- `.insforge/project.json` con `api_key` de administración (acceso SQL completo) dentro de carpeta sincronizada a OneDrive. Considerar mover el workspace fuera de OneDrive.
- `script.js` en la raíz (utilidad de re-estilado, sin trackear): no commitar.
- No existe `middleware.ts` en el frontend: cero autenticación de borde; todo depende del cliente.

## ✅ Verificado y correcto

`AuthGuard` valida el token contra InsForge server-side (no confía en el payload); `RolesGuard` correcto en `users`/`products`/`movements`; funciones Postgres atómicas para stock con manejo de locks; `ValidationPipe({whitelist:true})` + DTOs; ThrottlerGuard global; `HttpExceptionFilter` sin fuga de stack traces; queries raw parametrizadas (salvo N5); contraseñas con bcrypt vía `pgcrypto`; `offlineSync.ts` sin tokens; `sw.js` no cachea mutaciones; wrangler/`next.config` sin secretos; `.gitignore` cubre `.env*` y `.insforge`; respuesta de forgot-password no enumera emails.

---

## 7. Verificaciones pendientes (requieren shell funcional)

```bash
# 1. RLS — confirma o descarta C3 y N2 (lo más importante del informe)
npx -y @insforge/cli login
npx -y @insforge/cli db policies        # ¿UPDATE en user_profiles / INSERT en audit_logs para anónimos o usuarios normales?
npx -y @insforge/cli diagnose advisor --category security
npx -y @insforge/cli metadata --json    # buckets públicos, config de auth

# 2. Dependencias
npm audit --workspaces

# 3. Historial de secretos (la clave Resend y la anon key ya están commitadas)
git log --all -p -S "cmVfR1JaMkZlOGRf" --oneline | head -5
git log --all -p -S "anon_8c78b5a48a1c" --oneline | head -5
```

## 8. Plan de remediación priorizado

**HOY (día 1):**
1. Rotar API key de Resend (N1) y moverla a env. 2. Eliminar guardado de contraseña en localStorage (C1). 3. `@Roles` en `/reports/*` + validar `recipients` (C6). 4. Fail-fast sin `JWT_SECRET` (C5). 5. Eliminar el modal 2FA falso (C4).

**SEMANA 1-2:**
6. Eliminar el fallback 403→InsForge (C2) — el cambio de mayor impacto estructural. 7. RLS: solo service-role escribe `audit_logs`; solo ADMIN modifica `user_profiles` (C3, N2, A5). 8. Quitar creación de usuarios desde el cliente (N4). 9. Default `VIEWER` en el cliente (A1).

**MES 1:**
10. Revocación real de sesiones + expiración server-side (A2, A3). 11. Onboarding sin contraseña por email (N3) + política de contraseñas unificada ≥10 (F1). 12. Cabeceras CSP/HSTS en `next.config.mjs`; CSP real en helmet; Swagger solo dev; CORS sin `*.vercel.app`. 13. CSV injection (N6) y ZPL (F2). 14. Token de reset fuera de query string (A7). 15. Rotar anon key y limpiarla del código (A4).

**TRIMESTRE:**
16. Anonimización RGPD real (A6). 17. Scope multi-organización en endpoints de lectura. 18. Migrar `xlsx` → `exceljs`/SheetJS CDN. 19. Migrar workspace fuera de OneDrive o excluir `.insforge`. 20. TOTP real como 2FA.

---
*Informe generado por auditoría de código asistida. Los hallazgos marcados PENDIENTE requieren verificación con el CLI de InsForge y npm audit antes de cerrar el plan de remediación.*
