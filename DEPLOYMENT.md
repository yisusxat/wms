# Despliegue

## API en Render

1. Crear un Web Service conectado al repositorio `yisusxat/wms`.
2. Usar el archivo `render.yaml` o configurar:
   - Build: `npm ci && npm run db:generate && npm run build:api`
   - Start: `npm run start:api`
   - Health check: `/api/health`
3. Configurar los secretos `DATABASE_URL`, `INSFORGE_URL`,
   `INSFORGE_ANON_KEY` y `WEB_ORIGIN`.
4. Ejecutar las migraciones remotas exclusivamente con InsForge CLI antes de
   apuntar la API productiva a la base de datos.

## Frontend en Vercel

1. Crear un proyecto Vercel conectado al mismo repositorio.
2. Mantener el Root Directory en la raíz del monorepo.
3. Usar `vercel.json` para instalar y construir `apps/web`.
4. Configurar:
   - `NEXT_PUBLIC_API_URL`: URL pública de Render sin `/api`.
   - `NEXT_PUBLIC_INSFORGE_URL`: URL pública de InsForge.
   - `NEXT_PUBLIC_INSFORGE_ANON_KEY`: anon key pública del proyecto.

La `DATABASE_URL`, las claves administrativas y las credenciales E2E nunca
deben configurarse como variables públicas de Vercel.

## E2E autenticado

En GitHub Actions agregar como secretos del repositorio:

```text
WMS_E2E_EMAIL
WMS_E2E_PASSWORD
```

Usar una cuenta aislada de pruebas, nunca una cuenta productiva.
