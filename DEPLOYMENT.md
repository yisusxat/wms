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

## Frontend en Vercel

1. En el dashboard de Vercel, ve a **Settings** > **General** de tu proyecto (o configúralo al importarlo).
2. En la sección **Root Directory**, haz clic en **Edit**, escribe `apps/web` y guarda los cambios.
3. Vercel detectará automáticamente **Next.js**, los comandos de instalación (`npm install` respetando el monorepo) y el build (`next build`).
4. Configurar las variables de entorno en Vercel (**Settings** > **Environment Variables**):
   - `NEXT_PUBLIC_API_URL`: URL pública de la API en Render (ejemplo: `https://tu-api.onrender.com`).
   - `NEXT_PUBLIC_INSFORGE_URL`: URL pública de InsForge (`https://jirv3k8h.us-east.insforge.app`).
   - `NEXT_PUBLIC_INSFORGE_ANON_KEY`: anon key pública de InsForge.

La `DATABASE_URL`, las claves administrativas y las credenciales E2E nunca
deben configurarse como variables públicas de Vercel.

## E2E autenticado

En GitHub Actions agregar como secretos del repositorio:

```text
WMS_E2E_EMAIL
WMS_E2E_PASSWORD
```

Usar una cuenta aislada de pruebas, nunca una cuenta productiva.
