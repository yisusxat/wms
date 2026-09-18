# WMS

MVP de un sistema de gestión de bodegas.

## Stack inicial

- API: NestJS + TypeScript
- Persistencia: PostgreSQL + Prisma
- Frontend: Next.js + Tailwind CSS + React Three Fiber
- Base de datos administrada: InsForge Cloud mediante `DATABASE_URL`

## Desarrollo

1. Copiar `.env.example` a `.env` dentro de `apps/api`.
2. Configurar `DATABASE_URL` con la conexión de InsForge.
3. Instalar dependencias: `npm install`.
4. Generar Prisma Client: `npm run db:generate`.
5. Ejecutar migraciones con InsForge CLI: `npx -y @insforge/cli db migrations up --all`.
6. Cargar la configuración inicial: `npm run db:seed`.
7. Iniciar la API: `npm run dev:api`.

Para iniciar la interfaz web, copiar `apps/web/.env.example` a
`apps/web/.env.local` y ejecutar `npm run dev:web`.

La primera sesión autenticada se registra automáticamente como `VIEWER` en
`user_profiles`. Un administrador existente puede promoverla con
`PATCH /api/users/:id/role` enviando `{ "role": "ADMIN" }`.

Prisma se utiliza para generar el cliente y consultar PostgreSQL; no se utiliza
para crear migraciones remotas. Las claves de InsForge y `DATABASE_URL` deben
permanecer únicamente en variables de entorno locales o secretos del entorno.

## API inicial

```text
GET  /api/health
GET  /api/warehouses
GET  /api/products?search=&page=&pageSize=
GET  /api/locations?status=&aisle=&rack=&page=&pageSize=
GET  /api/inventory?productId=&locationId=&search=&page=&pageSize=
GET  /api/inventory/location/:id
GET  /api/inventory/product/:id
GET  /api/movements?type=&search=&from=&to=&page=&pageSize=
GET  /api/dashboard/summary
GET  /api/docs
GET  /api/auth/me

POST /api/products
PATCH /api/products/:id
POST /api/movements/entry
POST /api/movements/exit
POST /api/movements/transfer
POST /api/movements/adjustment
GET  /api/users
PATCH /api/users/:id/role
```

Todos los endpoints salvo `/api/health` requieren `Authorization: Bearer <token>`.
La documentación interactiva OpenAPI está disponible en `/api/docs`.

El seed genera una bodega, dos pasillos, cuatro racks y exactamente 148 ubicaciones.

## Bootstrap de administrador

La primera sesión se crea como `VIEWER` por seguridad. Para habilitar la primera
operación administrativa, ejecuta una actualización controlada desde InsForge,
sustituyendo el UUID por el usuario autenticado:

```sql
UPDATE public.user_profiles
SET role = 'ADMIN', active = TRUE
WHERE id = 'UUID_DEL_USUARIO';
```

Después de crear el primer administrador, los cambios de rol deben realizarse
con `PATCH /api/users/:id/role`. No se debe exponer `DATABASE_URL` ni ejecutar
esta actualización desde el navegador.

## Estado del MVP

La rama de esquema fue promovida al proyecto principal después de un dry-run
sin conflictos. La pantalla web cubre login con renovación de sesión,
dashboard, productos, ubicaciones, inventario, movimientos y la vista 3D de
las 148 ubicaciones. La integración E2E completa todavía requiere credenciales
de prueba y un entorno PostgreSQL/InsForge dedicado. La auditoría npm debe
ejecutarse cuando el registro npm esté disponible; no se aplicó
`npm audit fix --force`.

La smoke test E2E se ejecuta con `npm run test:e2e`. En Windows usa Chrome
instalado; en CI usa Chromium descargado por el workflow. El flujo autenticado
se habilita solo con las variables temporales `WMS_E2E_EMAIL` y
`WMS_E2E_PASSWORD`; nunca deben ser credenciales productivas.

La integración PostgreSQL se ejecuta automáticamente en CI contra un servicio
efímero. Para ejecutarla localmente se requiere un PostgreSQL de pruebas y
`DATABASE_URL`; el bootstrap de compatibilidad está en
`scripts/init-test-db.sql`.
