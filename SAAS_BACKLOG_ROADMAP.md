# Hoja de Ruta y Backlog de Pendientes: WMS a SaaS Comercial B2B

Este documento consolida y agrupa todos los requerimientos pendientes de la lista de verificación SaaS. Está diseñado para servir como guía arquitectónica cuando se decida evolucionar el sistema desde su estado actual (**Uso Interno de Bodega Corporativa**) hacia una **Plataforma SaaS Multi-Tenant Comercial**.

---

## Índice de Ejes Estratégicos

1. [Eje 1: Multi-Tenancy y Aislamiento de Organizaciones](#eje-1-multi-tenancy-y-aislamiento-de-organizaciones)
2. [Eje 2: Facturación, Suscripciones y Webhooks (Stripe)](#eje-2-facturación-suscripciones-y-webhooks-stripe)
3. [Eje 3: Entregabilidad y Dominio de Emails Transaccionales](#eje-3-entregabilidad-y-dominio-de-emails-transaccionales)
4. [Eje 4: Gestión Avanzada de Sesiones y Seguridad](#eje-4-gestión-avanzada-de-sesiones-y-seguridad)
5. [Eje 5: Resiliencia, Respaldo y Cumplimiento Legal (SLA & GDPR)](#eje-5-resiliencia-respaldo-y-cumplimiento-legal-sla--gdpr)

---

## Eje 1: Multi-Tenancy y Aislamiento de Organizaciones

### Estado Actual
El sistema es **Single-Tenant**: una sola empresa opera la bodega. La tabla `warehouses`, `products`, `locations` y `movements` no están segmentadas por empresa.

### Requerimientos para SaaS
Garantizar que la **Organización A** jamás pueda consultar, listar ni modificar datos de la **Organización B**.

### Especificación Técnica
1. **Modelo de Datos en Prisma (`schema.prisma`):**
   ```prisma
   model Organization {
     id         String       @id @default(uuid()) @db.Uuid
     name       String
     slug       String       @unique
     plan       PlanType     @default(FREE)
     stripeCustomerId String? @map("stripe_customer_id")
     members    Membership[]
     warehouses Warehouse[]
     products   Product[]
     createdAt  DateTime     @default(now()) @map("created_at")

     @@map("organizations")
   }

   model Membership {
     id             String       @id @default(uuid()) @db.Uuid
     organizationId String       @map("organization_id") @db.Uuid
     userId         String       @map("user_id") @db.Uuid
     role           UserRole     @default(OPERATOR)
     organization   Organization @relation(fields: [organizationId], references: [id])
     user           User         @relation(fields: [userId], references: [id])

     @@unique([organizationId, userId])
     @@map("memberships")
   }
   ```

2. **Aislamiento en Base de Datos (PostgreSQL RLS):**
   - Habilitar `ALTER TABLE products ENABLE ROW LEVEL SECURITY;`
   - Política: `CREATE POLICY tenant_isolation ON products USING (organization_id = current_setting('app.current_org_id')::uuid);`

3. **Backend Middleware / Interceptor:**
   - Extraer `x-organization-id` de los encabezados HTTP o del claim del JWT.
   - Inyectar el `organizationId` automáticamente en todas las consultas de Prisma (`prisma.$extends`).

---

## Eje 2: Facturación, Suscripciones y Webhooks (Stripe)

### Estado Actual
Omitido. La aplicación opera sin pasarela de pagos por ser de uso interno.

### Requerimientos para SaaS
Monetización automática con planes, portal de autoservicio y control de límites (Feature Gating).

### Especificación Técnica
1. **Definición de Planes:**
   - **Plan Free / Starter:** Hasta 1 bodega, 50 productos, 2 usuarios.
   - **Plan Pro:** Hasta 3 bodegas, 1,000 productos, 10 usuarios, layout 3D activado.
   - **Plan Enterprise:** Bodegas ilimitadas, usuarios ilimitados, soporte prioritario, API abierta.

2. **Manejo Estricto de Webhooks:**
   - Endpoint: `POST /api/billing/webhook`
   - Validación criptográfica obligatoria con el secreto del webhook:
     ```ts
     const event = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
     ```
   - Eventos soportados:
     - `checkout.session.completed`: Asocia la suscripción a la organización.
     - `customer.subscription.updated`: Actualiza el estado (`active`, `past_due`, `canceled`).
     - `invoice.payment_failed`: Notifica al administrador e inicia el periodo de gracia (*dunning*).
     - `customer.subscription.deleted`: Revoca acceso y bloquea mutaciones.

3. **Feature Gating (Guardias de Cuotas):**
   - Interceptor o Guard (`@CheckQuota('products')`): Antes de crear un producto o usuario, validar si `count >= plan.maxProducts`. Si excede, responder con `402 Payment Required`.

4. **Portal de Autoservicio:**
   - Redirección con un clic a `stripe.billingPortal.sessions.create` para actualización de tarjeta, descarga de facturas y cambio de plan sin tickets manuales.

---

## Eje 3: Entregabilidad y Dominio de Emails Transaccionales

### Estado Actual
Omitido. Los usuarios son dados de alta directamente por el Administrador con credenciales fijas y `email_verified = true`.

### Requerimientos para SaaS
Autoservicio de registro y recuperación de cuentas con alta reputación de entrega.

### Especificación Técnica
1. **Configuración de Proveedor (Resend / SendGrid / Postmark):**
   - Subdominio dedicado: `mail.tubodega.com` o `notificaciones.tubodega.com`.
2. **Registros DNS Obligatorios:**
   - **SPF:** `v=spf1 include:sendgrid.net ~all`
   - **DKIM:** CNAME provisto por el proveedor para firma criptográfica de cabeceras.
   - **DMARC:** `v=DMARC1; p=quarantine; pct=100; rua=mailto:dmarc-reports@tubodega.com`
3. **Flujos Críticos a Implementar:**
   - **Pantalla "Olvidé mi contraseña":** Envío de token con expiración de 15 minutos.
   - **Invitación a organización:** Token de acceso temporal para primer login.
   - **Alertas operativas por correo:** Stock crítico, discrepancias en inventario físico.

---

## Eje 4: Gestión Avanzada de Sesiones y Seguridad

### Estado Actual
- JWT de corta duración emitido por InsForge Auth.
- Expiración estándar y logout local.
- Rate Limiting global (120 req/min) y estricto en `/api/users` (10 req/min).

### Requerimientos para SaaS
1. **Revocación Global de Sesiones:**
   - Endpoint `POST /api/auth/revoke-all` que invalide todos los tokens activos del usuario ante sospecha de compromiso o cambio de contraseña.
2. **Autenticación en Dos Pasos (2FA / MFA):**
   - Integración TOTP (Google Authenticator / Authy) obligatoria para cuentas con rol `ADMIN`.
3. **Auditoría de Actividad (Audit Log):**
   - Registro inmutable de cada acción crítica (eliminación de producto, ajuste de inventario, cambio de rol) con IP, usuario y timestamp.

---

## Eje 5: Resiliencia, Respaldo y Cumplimiento Legal (SLA & GDPR)

### Estado Actual
- Backups automáticos de PostgreSQL gestionados por InsForge (AWS us-east).
- Conexión protegida con SSL.
- Sentry capturando excepciones en tiempo real.
- Cabeceras de seguridad Helmet activas en la API.

### Requerimientos para SaaS
1. **Simulacro de Restauración de Base de Datos:**
   - Documentar y ejecutar periódicamente una prueba de restauración desde el snapshot de producción hacia un entorno de pruebas, midiendo el RTO (*Recovery Time Objective* < 1 hora) y RPO (*Recovery Point Objective* < 24 horas).
2. **Página de Estado Pública (Status Page):**
   - Configuración en servicio externo (Instatus, Better Uptime o Statuspage.io) monitoreando el endpoint `/api/health`.
3. **Cumplimiento Legal y Términos:**
   - **Términos del Servicio (ToS):** Cláusulas de limitación de responsabilidad por interrupción de servicios de terceros (AWS, Vercel).
   - **Acuerdo de Nivel de Servicio (SLA):** Compromiso de disponibilidad del 99.5% o 99.9%.
   - **Política de Retención y Baja:** Proceso automatizado de *Hard Delete* o anonimización tras 30 días de cancelación de la suscripción.
