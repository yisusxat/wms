# WMS Enterprise — Warehouse Management System

Sistema integral de gestión de almacenamiento e inventario logístico de grado empresarial (*Warehouse Management System*), optimizado para terminales móviles industriales (PDA), tablets y estaciones de trabajo de escritorio. Integra **Gemelo Digital 3D**, **Plano 2D Interactivo con Mapas de Calor**, **Escáner Universal con Visión Artificial y OCR**, **Centro de Mando con KPIs Avanzados**, **Dashboard Operativo Simétrico 4×2**, **Sincronización Reactiva en Tiempo Real**, **Control de Acceso Granular RBAC** y **Diseño Swiss Enterprise**.

---

## ⚡ Aspectos Destacados

- 🖥️ **Dashboard Operativo (Cockpit del Turno)**:
  - **Cuadrícula Simétrica 4×2 de 8 Métricas Clave**: Productos activos, Ubicaciones mapeadas, Stock total en custodia, Ocupación global (%) con barra semafórica, Ocupadas, Disponibles, Entradas de hoy y Salidas de hoy, todas interactivas con enlace directo a sus respectivos módulos.
  - **Estación de Acciones Rápidas (*Quick Workstation*)**: Botonera de acceso inmediato para recepción de mercancía, despacho/picking, transferencias internas, escaneo OCR, auditoría 2D y Centro de Mando.
  - **Monitor de Actividad Reciente en Vivo (*Live Activity Stream*)**: Registro en tiempo real de los últimos movimientos del turno (tipo con badge, producto, SKU, cantidad, casilleros origen/destino y hora relativa).
  - **Saturación Física por Pasillos (A y B)**: Monitoreo visual de capacidad y ocupación en tiempo real para Pasillo A (Norte) y Pasillo B (Sur).
  - **Semáforo de Salud Operativa**: Estado de saturación, casilleros listos para estiba e integridad mecánica de la bodega.
  - **Guía de Puesta en Marcha**: Onboarding interactivo persistente en `localStorage`.

- 🔄 **Sincronización Reactiva en Tiempo Real (Event Bus Global)**:
  - Bus de eventos `wms-data-changed`: Cualquier mutación (recepción, despacho, reubicación, ajuste de inventario, alta de SKU o mapeo físico) sincroniza instantáneamente el Dashboard, Centro de Mando, Plano 2D y Kardex sin recargar la página.
  - Sincronización multi-pestaña mediante eventos de almacenamiento (`storage`).

- 📊 **Centro de Mando & Inteligencia Logística (KPIs & BI)**:
  - **Exactitud de Registro de Inventario (IRA)**: Cálculo riguroso y transparente de concordancia física vs. lógica sin penalizaciones artificiales.
  - **Clasificación ABC Dinámica (Pareto)**: Segmentación automática de SKUs en Clases A, B y C según volumen de salidas y rotación.
  - **DSI (*Days Sales of Inventory*) & Rotación de Stock**: Proyección de días de inventario restante y detección de stock estancado (*Dead Stock* >60 días).
  - **Tiempos de Ciclo de Bodega**: Métricas *Dock-to-Stock* (horas desde recepción hasta estiba) y tiempo de ciclo de órdenes de picking.
  - **Utilización Volumétrica Cúbica ($m^3$)**: Medición de metros cúbicos disponibles vs. ocupados en estanterías.
  - **Afinidad y Co-ocurrencia de SKUs (*Smart Slotting*)**: Recomendaciones basadas en pedidos concurrentes para ubicar artículos complementarios en casilleros contiguos.
  - **Filtro Reactivo por Categoría de Producto**: Telemetría segmentable por familias de producto.

- 🏭 **Gemelo Digital 3D & Plano 2D Interactivo**:
  - Visualización tridimensional inmersiva con Three.js / React Three Fiber.
  - Plano esquemático 2D interactivo con mapas térmicos de saturación, navegación por pasillos A y B (racks Central y Pared) y selector visual de casilleros para entradas y salidas (`Entry2DModal`, `Exit2DModal`).

- 🔍 **Mapeo y Conciliación Física**:
  - Auditoría casillero por casillero en planta, comparación de inventario físico vs. lógico, detección de discrepancias y sincronización automática.

- 📷 **Escáner Universal Triple Modo**:
  - **Cámara (Imager 2D)**: Lectura rápida de códigos de barras (EAN-13, Code 128) y códigos QR con alternancia de cámara frontal/trasera y control de linterna/flash.
  - **Visión Artificial y OCR**: Pipeline de procesamiento digital con umbralizado adaptativo de Otsu, realce de contraste, inversión de polaridad y motor Tesseract en Web Worker para leer números de SKU impresos en cajas y empaques sin código de barras.
  - **Modo Manual Asistido**: Entrada asistida por teclado para operarios con terminales industriales.

- 📦 **Catálogo de SKUs & Gestión de Productos**:
  - CRUD reactivo, filtros dinámicos, importación y exportación masiva en hojas de cálculo Excel/CSV con validación de esquemas y generación de etiquetas industriales Zebra ZPL listas para imprimir.

- 🛡️ **Seguridad, Gobernanza y RBAC**:
  - Control de acceso por roles (`ADMIN`, `SUPERVISOR`, `OPERATOR`, `VIEWER`) y matriz granular de **24 permisos operativos**.
  - Autenticación en dos pasos (**2FA TOTP**) mediante códigos QR y códigos de respaldo.
  - **Bitácora Inmutable de Auditoría** con cálculo de firma criptográfica SHA-256 para trazabilidad total.
  - Revocación remota de sesiones activas en múltiples dispositivos.
  - Cumplimiento de derechos RGPD (descarga de expediente y derecho al olvido / anonimización).

- 🛠️ **Mesa de Ayuda con Triple Redundancia**:
  - Captura automática del contexto técnico (sección/pantalla activa, URL exacta con parámetro `?tab=...`, almacén, usuario, rol y resolución de pantalla) con despacho concurrente a **InsForge PostgreSQL**, **Sentry.io** y **Resend**.

- 🎨 **Sistema de Diseño Swiss Enterprise**:
  - Iconografía vectorial SVG técnica (`lucide-react`) sin emojis.
  - Tipografía **Inter** con escala modular y paleta semántica oficial (`#2563EB` primario, `#EA580C` acento operativo de escaneo).
  - **Modo Oscuro Industrial** de alto contraste optimizado para entornos de baja iluminación en bodega.
  - Barra de navegación móvil ergonómica (*thumb-zone*) con botón FAB central elevado para escaneo inmediato.
  - **Paleta de Comandos Global (`Ctrl + K`)** para acceso rápido por teclado.

- 📡 **Resiliencia Offline-First**:
  - Detección continua de conectividad con cola local de transacciones pendientes y sincronización automática al restablecerse la red.

---

## 🏗️ Arquitectura y Stack Tecnológico

```
                               ┌──────────────────────────────────────────────┐
                               │           WMS Web App (Next.js 15)           │
                               │  - App Router / React 19 / Tailwind CSS      │
                               │  - React Three Fiber / Three.js (Digital 3D) │
                               │  - Computer Vision & Tesseract.js (OCR)      │
                               │  - Lucide Icons (Swiss Enterprise UI)        │
                               │  - Global Event Bus (Real-time reactivity)   │
                               └──────────────────────┬───────────────────────┘
                                                      │ HTTPS / JSON Web Token
                                                      ▼
                               ┌──────────────────────────────────────────────┐
                               │             WMS API (NestJS 11)              │
                               │  - TypeScript 5 / Prisma ORM 6 / Helmet      │
                               │  - Granular RBAC Guard / Swagger OpenAPI     │
                               │  - Audit Logging Engine (SHA-256 Hashes)     │
                               │  - ExcelJS Bulk Processor / Resend Client    │
                               │  - Real-time Dashboard & KPI Analytics       │
                               └──────────────────────┬───────────────────────┘
                                                      │ Connection Pooling
                                                      ▼
                               ┌──────────────────────────────────────────────┐
                               │         InsForge Cloud / PostgreSQL          │
                               │  - Managed Relational Database & RLS         │
                               │  - Row-Level Security & Storage              │
                               │  - Audit Trail & Automated Triggers          │
                               └──────────────────────────────────────────────┘
```

| Capa | Tecnologías |
|---|---|
| **Frontend** | [Next.js 15](https://nextjs.org/) (App Router), [React 19](https://react.dev/), [Tailwind CSS](https://tailwindcss.com/), [Lucide React](https://lucide.dev/), [React Three Fiber](https://r3f.docs.pmnd.rs/), [Three.js](https://threejs.org/), [Tesseract.js](https://tesseract.projectnaptha.com/), `@zxing/browser` |
| **Backend** | [NestJS 11](https://nestjs.com/), [TypeScript 5](https://www.typescriptlang.org/), [Prisma ORM 6](https://www.prisma.io/), [Class Validator](https://github.com/typestack/class-validator), [Swagger / OpenAPI](https://swagger.io/), [ExcelJS](https://github.com/exceljs/exceljs) |
| **BaaS / Base de Datos** | [InsForge Cloud](https://insforge.dev/) (PostgreSQL administrado, Auth, Row-Level Security, Storage y Triggers) |
| **Observabilidad & Comunicaciones** | [Sentry.io](https://sentry.io/) (monitoreo de errores en frontend y backend) y [Resend](https://resend.com/) (notificaciones transaccionales) |
| **Testing & Calidad** | [Playwright](https://playwright.dev/) (E2E autónomo y cross-browser), [Jest](https://jestjs.io/) (unit testing e integración), TypeScript Strict Mode |

---

## 🏛️ Topología Física de la Bodega

El sistema modela fielmente la infraestructura real del almacén:
- **1 Almacén Central**: Zona General de almacenamiento.
- **2 Pasillos Físicos**: Pasillo A (Norte) y Pasillo B (Sur).
- **4 Racks Principales**:
  - `A-C`: Pasillo A — Rack Central (30 posiciones).
  - `A-P`: Pasillo A — Rack Pared (44 posiciones).
  - `B-C`: Pasillo B — Rack Central (30 posiciones).
  - `B-P`: Pasillo B — Rack Pared (44 posiciones).
- **Total**: Exactamente **148 posiciones físicas** organizadas en 5 niveles de estiba y casilleros codificados bajo el estándar industrial `[Pasillo]-[Rack]-[Nivel]-[Posición]` (ej. `A-C-01-05`).

---

## 📁 Estructura del Monorepo

```text
wms/
├── apps/
│   ├── api/                           # Backend NestJS
│   │   ├── prisma/
│   │   │   ├── schema.prisma          # Esquema relacional de base de datos
│   │   │   └── seed.ts                # Semilla de bodega, 4 racks (148 ubicaciones) y SKUs
│   │   ├── src/
│   │   │   ├── audit/                 # Servicio de bitácora criptográfica SHA-256
│   │   │   ├── auth/                  # Estrategias JWT y guards de autorización
│   │   │   ├── dashboard/             # Telemetría de resumen, pasillos y KPIs avanzados
│   │   │   ├── inventory/             # Lógica de stock por ubicación y producto
│   │   │   ├── locations/             # Gestión de pasillos, racks y casilleros
│   │   │   ├── movements/             # Entradas, salidas, traslados y ajustes
│   │   │   ├── products/              # Gestión de SKUs, catálogo y balance
│   │   │   ├── rbac/                  # Matriz de 24 permisos y conmutadores grupales
│   │   │   └── users/                 # Administración de cuentas y roles
│   │   └── test/                      # 97 pruebas Jest unitarias y de integración
│   │
│   └── web/                           # Frontend Next.js
│       ├── app/
│       │   ├── api/support/           # Endpoint serverless para despacho de tickets
│       │   ├── components/            # Componentes Swiss Enterprise
│       │   │   ├── BarcodeScanner.tsx # Escáner triple (Cámara, Visión OCR, Teclado)
│       │   │   ├── CommandPalette.tsx # Paleta global de comandos (Ctrl+K)
│       │   │   ├── Dashboard.tsx      # Dashboard operativo simétrico 4x2, workstation y feed
│       │   │   ├── Entry2DModal.tsx   # Asignación visual interactiva de entradas
│       │   │   ├── Exit2DModal.tsx    # Selección visual de casillero para salidas/picking
│       │   │   ├── KPIPanel.tsx       # 5 vistas de analítica logística profunda
│       │   │   ├── MovementsPanel.tsx # Operaciones de stock, FIFO, Slotting y kardex
│       │   │   ├── ProductsPanel.tsx  # Catálogo, importación/exportación y ZPL
│       │   │   ├── SupportModal.tsx   # Mesa de ayuda con captura de sección y URL
│       │   │   ├── TeamPanel.tsx      # Gestión de usuarios y matriz RBAC
│       │   │   ├── UserMenu.tsx       # Menú de perfil, 2FA y auditoría
│       │   │   ├── Warehouse2D.tsx    # Plano esquemático 2D y mapas térmicos
│       │   │   └── Warehouse3D.tsx    # Gemelo digital 3D interactivo
│       │   ├── globals.css            # Tokens Swiss Enterprise y modo oscuro
│       │   └── page.tsx               # Shell principal, navegación y barra móvil
│       ├── lib/
│       │   ├── api.ts                 # Cliente HTTP tipado, fallback y event bus
│       │   └── ocrService.ts          # Pipeline de visión artificial (Otsu + Tesseract)
│       └── e2e/                       # 34 pruebas Playwright de extremo a extremo
│           ├── all-components.spec.ts
│           ├── cross-component-integration.spec.ts
│           ├── e2e-complete-real-flows.spec.ts
│           └── smoke.spec.ts
│
├── design-system/
│   └── wms-enterprise/
│       └── MASTER.md                  # Especificación del sistema de diseño Swiss Enterprise
├── DEPLOYMENT.md                      # Guía de despliegue para Render y Vercel
├── AGENTS.md                          # Directrices de desarrollo y configuración de InsForge
└── package.json                       # Scripts globales del workspace npm
```

---

## 🚀 Puesta en Marcha Local

### Prerrequisitos
- **Node.js**: `>= 22.0.0`
- **npm**: `>= 10.0.0`
- Una instancia de base de datos PostgreSQL o un proyecto en [InsForge Cloud](https://insforge.dev).

### 1. Clonar el repositorio e instalar dependencias

```bash
git clone https://github.com/yisusxat/wms.git
cd wms
npm install
```

### 2. Configurar variables de entorno

#### Backend (`apps/api/.env`):
```env
PORT=3001
DATABASE_URL="postgresql://usuario:contraseña@servidor:5432/wms?sslmode=require"
INSFORGE_URL="https://tu-proyecto.us-east.insforge.app"
INSFORGE_ANON_KEY="anon_..."
WEB_ORIGIN="http://localhost:3000"
RESEND_API_KEY="re_..."
SUPPORT_EMAIL_TARGET="soporte@tu-empresa.com"
```

#### Frontend (`apps/web/.env.local`):
```env
NEXT_PUBLIC_API_URL="http://localhost:3001/api"
NEXT_PUBLIC_INSFORGE_URL="https://tu-proyecto.us-east.insforge.app"
NEXT_PUBLIC_INSFORGE_ANON_KEY="anon_..."
NEXT_PUBLIC_SENTRY_DSN="https://...@ingest.sentry.io/..."
```

### 3. Base de datos y datos de inicio

Genera el cliente de Prisma y aplica la semilla inicial (crea 1 bodega central, pasillos A y B, 4 racks físicos con 148 ubicaciones y catálogo de productos base):

```bash
# Generar tipos de Prisma
npm run db:generate

# Cargar bodega y catálogo inicial
npm run db:seed
```

### 4. Iniciar servidores en modo desarrollo

Abre dos terminales o ejecuta los comandos en paralelo:

```bash
# Terminal 1: Iniciar API de NestJS (http://localhost:3001)
npm run dev:api

# Terminal 2: Iniciar Web App de Next.js (http://localhost:3000)
npm run dev:web
```

La documentación interactiva OpenAPI / Swagger se encuentra disponible en:
👉 `http://localhost:3001/api/docs`

---

## 👤 Bootstrap del Primer Administrador

Por seguridad, todo usuario que inicia sesión por primera vez recibe el rol `VIEWER`. Para promover tu cuenta al rol `ADMIN` y tener acceso total a la plataforma, ejecuta la siguiente consulta en la consola SQL de InsForge o PostgreSQL:

```sql
UPDATE public.user_profiles
SET role = 'ADMIN', active = TRUE
WHERE id = 'UUID_DE_TU_USUARIO';
```

Una vez con el rol `ADMIN`, podrás invitar a más usuarios y modificar sus permisos directamente desde el **Panel de Equipo y Permisos RBAC** en la interfaz web.

---

## 🧪 Pruebas Automatizadas y Calidad

El proyecto cuenta con suites exhaustivas de pruebas de integración y de extremo a extremo que se ejecutan en CI/CD:

### Pruebas de Backend y de Integración (Jest)
Ejecuta la suite completa de 97 pruebas que validan autenticación, RBAC, movimientos de inventario, kardex, bitácora de auditoría SHA-256, telemetría y concurrencia:
```bash
npm run test:api
```
> Resultado: **97 tests aprobados (100%)**.

### Pruebas End-to-End (Playwright)
Ejecuta las 34 pruebas de extremo a extremo que validan todos los flujos reales de la aplicación sobre navegadores reales (Dashboard simétrico 4×2, Vista 2D/3D, Mapeo, Escáner OCR, Importación/Exportación, Kardex, KPIs, 2FA, Auditoría y Soporte):
```bash
# Compilar frontend y ejecutar Playwright
npm run test:e2e

# O ejecutar directamente con el visor gráfico interactivo:
npx playwright test --ui
```
> Resultado: **33 tests aprobados, 1 omitido (100% de cobertura efectiva)**.

### Compilación para Producción
```bash
# Compilar backend
npm run build:api

# Compilar frontend
npm run build:web
```

---

## 🌐 Endpoints Principales de la API

Todos los endpoints (a excepción de `/api/health` y `/api/docs`) requieren la cabecera `Authorization: Bearer <jwt_token>`.

```text
# Diagnóstico y Documentación
GET    /api/health
GET    /api/docs

# Sesión y Usuario
GET    /api/auth/me
POST   /api/auth/revoke-all
GET    /api/users
PATCH  /api/users/:id/role
PATCH  /api/users/:id/permissions

# Almacenes y Ubicaciones
GET    /api/warehouses
GET    /api/locations?status=&aisle=&rack=&page=&pageSize=
PATCH  /api/locations/:id/status

# Catálogo de Productos y SKUs
GET    /api/products?search=&category=&page=&pageSize=
POST   /api/products
PATCH  /api/products/:id
POST   /api/products/bulk-import
GET    /api/products/export

# Inventario y Kardex
GET    /api/inventory?productId=&locationId=&search=&page=&pageSize=
GET    /api/inventory/location/:id
GET    /api/inventory/product/:id
GET    /api/movements?type=&search=&from=&to=&page=&pageSize=
POST   /api/movements/entry
POST   /api/movements/exit
POST   /api/movements/transfer
POST   /api/movements/adjustment

# Inteligencia Logística, Telemetría y Auditoría
GET    /api/dashboard/summary
GET    /api/dashboard/kpis?organizationId=&category=
GET    /api/audit/logs
```

---

## 🚢 Despliegue en Producción

Las instrucciones detalladas para desplegar la API en **Render** y el Frontend en **Vercel** o **Cloudflare Workers** se encuentran en el archivo [`DEPLOYMENT.md`](./DEPLOYMENT.md).

---

## 📄 Licencia

Este proyecto está bajo la licencia [MIT](./LICENSE).
