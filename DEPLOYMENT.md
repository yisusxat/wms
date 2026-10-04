# Despliegue

## API en Render

1. Crear un Web Service conectado al repositorio `yisusxat/wms`.
2. Usar el archivo `render.yaml` o configurar:
   - Node: `22.x`
   - Build: `npm ci --include=dev && npm run db:generate && npm run build:api`
   - Start: `npm run start:api`
   - Health check: `/api/health`
3. Configurar los secretos `DATABASE_URL`, `INSFORGE_URL`,
   `INSFORGE_ANON_KEY`, `WEB_ORIGIN`, `RESEND_API_KEY` y `EMAIL_FROM`.
   `JWT_SECRET` lo genera Render automáticamente (`generateValue: true`).
   `WEB_ORIGIN` es la URL del frontend, sin barra final (acepta varias separadas por coma).
4. Ejecutar las migraciones remotas exclusivamente con InsForge CLI antes de
   apuntar la API productiva a la base de datos.
5. Verificar el despliegue: `GET https://<tu-api>.onrender.com/api/health` debe
   responder `200` con `"database":{"status":"connected"}`, y
   `GET /api/products` sin token debe responder `401`.

> El plan `free` de Render duerme el servicio tras ~15 min sin tráfico; la primera
> petición posterior puede tardar ~50 s.

## Frontend en Cloudflare (Pages / Workers con OpenNext)

1. En el dashboard de Cloudflare:
   - Si usas **Cloudflare Pages**: Conecta el repositorio `yisusxat/wms`.
     - **Root directory:** `apps/web`
     - **Build command:** `npx @opennextjs/cloudflare build` (o `npm run build:worker`)
     - **Output directory:** `.open-next/assets`
   - Si despliegas con **Wrangler CLI**:
     ```bash
     cd apps/web
     npm run build:worker
     npx wrangler deploy
     ```
2. Configurar las variables de entorno en Cloudflare (**Settings** > **Environment variables**):
   - `NEXT_PUBLIC_API_URL`: URL pública de la API en Render (ejemplo: `https://wms-262o.onrender.com`).
   - `NEXT_PUBLIC_INSFORGE_URL`: `https://jirv3k8h.us-east.insforge.app`.
   - `NEXT_PUBLIC_INSFORGE_ANON_KEY`: anon key pública de InsForge.
3. Recuerda configurar el dominio de tu frontend (ejemplo: `https://wms.pages.dev` o tu dominio personalizado) en la variable `WEB_ORIGIN` del servicio `wms-api` en Render para autorizar el tráfico CORS con credenciales.

La `DATABASE_URL`, las claves administrativas y los secretos de backend nunca deben configurarse en el frontend.

## E2E autenticado

En GitHub Actions agregar como secretos del repositorio:

```text
WMS_E2E_EMAIL
WMS_E2E_PASSWORD
```

Usar una cuenta aislada de pruebas, nunca una cuenta productiva.
