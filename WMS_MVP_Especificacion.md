# WMS Básico — Especificación funcional y técnica

## 1. Objetivo

Desarrollar una aplicación web WMS (Warehouse Management System) básica, modular y escalable para gestionar ubicaciones, productos e inventario de una bodega.

La aplicación debe permitir:

- Visualizar la bodega y sus ubicaciones en 3D.
- Identificar qué productos están almacenados en cada ubicación.
- Registrar entradas y salidas de inventario.
- Consultar el historial de movimientos.
- Filtrar por pasillo, rack, ubicación y producto.
- Asignar productos a una ubicación específica.
- Seleccionar productos desde un buscador conectado a la base de datos.
- Permitir ingresar productos manualmente mediante texto como opción predeterminada.
- Mantener trazabilidad de los movimientos.
- Contar con una interfaz minimalista, sencilla, profesional y pulida.
- Utilizar azul, blanco, negro y rojo como colores principales.

> Este documento define un MVP. La arquitectura debe permitir agregar posteriormente recepción, picking, despacho, lotes, vencimientos, FEFO/FIFO, usuarios, permisos, lectores de código de barras, PDA/RF, reportes y otras funciones WMS.

---

# 2. Stack tecnológico recomendado

## Frontend

### Next.js + React + TypeScript

Recomendación principal:

- Next.js
- React
- TypeScript
- Tailwind CSS
- shadcn/ui
- React Hook Form
- Zod
- TanStack Query
- Zustand

### Motivos

Next.js permite construir una aplicación web moderna con frontend y API en un mismo proyecto, TypeScript mejora la seguridad del código y Tailwind + shadcn/ui permiten conseguir una interfaz consistente y profesional sin crear todos los componentes desde cero.

---

# 3. Motor 3D

## Three.js + React Three Fiber

Utilizar:

- Three.js
- React Three Fiber
- Drei

La visualización 3D debe representar:

- Bodega.
- Pasillos.
- Racks.
- Niveles.
- Posiciones.
- Pallets opcionalmente.
- Productos almacenados.

Cada ubicación debe ser un objeto seleccionable.

Al hacer clic sobre una ubicación:

```text
Ubicación A-01-02-03

Producto:
Pechuga de pollo

SKU:
POL-001

Cantidad:
48 cajas

Estado:
Disponible
```

La vista 3D no debe ser un videojuego. Debe funcionar principalmente como una herramienta visual de operación y consulta.

---

# 4. Backend

## Node.js + NestJS

Recomendación:

- Node.js
- NestJS
- TypeScript
- REST API

NestJS permite separar claramente:

```text
Auth
Products
Warehouses
Locations
Inventory
Movements
Users
Reports
```

La aplicación debe utilizar arquitectura modular.

---

# 5. Base de datos

## PostgreSQL alojado en InsForge

Utilizar **PostgreSQL administrado por InsForge** como base de datos principal del WMS. La base de datos seguirá siendo PostgreSQL; lo que cambia es el proveedor de alojamiento y los servicios backend asociados.

InsForge proporciona una base PostgreSQL administrada y acceso mediante una cadena de conexión PostgreSQL estándar, además de API/servicios backend integrados. citeturn2search0turn2search2

### Reglas de integración

- **Proveedor de base de datos:** InsForge Cloud.
- **Motor:** PostgreSQL.
- **ORM principal:** Prisma.
- **Conexión:** mediante `DATABASE_URL` proporcionada por el proyecto de InsForge.
- La cadena de conexión real **nunca** debe escribirse directamente en el código ni subirse al repositorio.
- El frontend no debe conectarse directamente a PostgreSQL.
- Las operaciones críticas de inventario deben pasar por la capa backend y ejecutarse dentro de transacciones PostgreSQL.
- Las tablas de negocio del WMS deben mantenerse en el esquema `public` o en esquemas explícitamente definidos para la aplicación; no modificar tablas internas/reservadas de InsForge. InsForge separa sus esquemas internos de los datos de negocio de la aplicación. citeturn2search3
- Las migraciones de base de datos deben mantenerse versionadas y reproducibles. InsForge dispone de soporte para migraciones de base de datos. citeturn2search9
- Si se utiliza el flujo de desarrollo con agentes de código, el proyecto debe incluir y respetar las instrucciones/skills oficiales de InsForge antes de realizar cambios sobre el backend.

### Servicios InsForge que pueden aprovecharse

Para este WMS, InsForge puede utilizarse no solo como PostgreSQL, sino también para servicios complementarios cuando sean necesarios: autenticación, almacenamiento, realtime, funciones edge y despliegue. No se deben incorporar estos servicios si duplican innecesariamente una funcionalidad ya implementada en NestJS. citeturn2search2turn2search8

ORM recomendado:

## Prisma

Ventajas:

- TypeScript.
- Migraciones.
- Tipado.
- Relaciones claras.
- Buen soporte para PostgreSQL.
- Productividad alta durante el desarrollo.

---

# 6. Arquitectura general

```text
                    ┌─────────────────────┐
                    │      Next.js        │
                    │ React + TypeScript  │
                    └──────────┬──────────┘
                               │
                         REST / JSON
                               │
                    ┌──────────▼──────────┐
                    │       NestJS        │
                    │       API          │
                    └──────────┬──────────┘
                               │
                         Prisma ORM
                               │
                    ┌──────────▼──────────┐
                    │ PostgreSQL /        │
                    │ InsForge Cloud      │
                    └─────────────────────┘

             ┌─────────────────────────────┐
             │ Three.js / React Three Fiber│
             │       Vista 3D WMS          │
             └─────────────────────────────┘
```

---

# 7. Estructura del proyecto

Recomendación para MVP:

```text
wms/
├── apps/
│   ├── web/
│   │   ├── app/
│   │   ├── components/
│   │   ├── features/
│   │   ├── hooks/
│   │   ├── lib/
│   │   └── types/
│   │
│   └── api/
│       ├── src/
│       │   ├── auth/
│       │   ├── products/
│       │   ├── warehouses/
│       │   ├── locations/
│       │   ├── inventory/
│       │   ├── movements/
│       │   ├── users/
│       │   └── reports/
│       └── prisma/
│
├── packages/
│   ├── ui/
│   ├── types/
│   └── config/
│
├── docker-compose.yml
├── package.json
└── README.md
```

Si el proyecto comienza siendo pequeño, también puede utilizarse un único proyecto Next.js con API routes/server actions y PostgreSQL. Sin embargo, separar posteriormente el backend será más sencillo si desde el principio se mantienen módulos y responsabilidades bien definidos.

---

# 8. Funcionalidades MVP

## 8.1 Dashboard

Pantalla principal:

```text
┌──────────────────────────────────────────────────────┐
│ WMS                                    Usuario ▼     │
├──────────────────────────────────────────────────────┤
│                                                      │
│  Productos       Ubicaciones      Stock              │
│  1.245           320              15.430             │
│                                                      │
│  Entradas        Salidas          Alertas             │
│  28              35               4                  │
│                                                      │
├──────────────────────────────────────────────────────┤
│                  VISTA DE BODEGA                     │
│                    [3D]                              │
└──────────────────────────────────────────────────────┘
```

KPIs iniciales:

- Total de productos.
- Total de ubicaciones.
- Unidades en inventario.
- Entradas del día.
- Salidas del día.
- Ubicaciones ocupadas.
- Ubicaciones disponibles.
- Alertas.

---

# 9. Gestión de bodega

Debe poder configurarse:

```text
Bodega
 ├── Zona
 │    ├── Pasillo
 │    │    ├── Rack
 │    │    │    ├── Nivel
 │    │    │    │    └── Posición
```

Ejemplo:

```text
Bodega Principal
└── Cámara Frigorífica
    ├── Pasillo A
    │   ├── Rack 01
    │   │   ├── Nivel 01
    │   │   │   ├── A-01-01-01
    │   │   │   └── A-01-01-02
    │   │   └── Nivel 02
    │   │       ├── A-01-02-01
    │   │       └── A-01-02-02
```

Cada ubicación debe tener un código único.

---

# 10. Modelo de ubicación

Campos:

```text
id
code
warehouseId
zone
aisle
rack
level
position
width
depth
height
maxWeight
status
temperatureZone
createdAt
updatedAt
```

Estados:

```text
AVAILABLE
OCCUPIED
BLOCKED
MAINTENANCE
```

---

# 11. Gestión de productos

El sistema debe permitir crear y administrar productos.

Campos mínimos:

```text
id
sku
name
description
barcode
unit
category
brand
active
createdAt
updatedAt
```

Ejemplo:

```text
SKU: POL-001
Nombre: Pechuga de pollo 2 kg
Código: 7801234567890
Unidad: Caja
Categoría: Congelados
```

---

# 12. Asignación de producto a ubicación

La función debe estar disponible desde:

- Vista 3D.
- Pantalla de ubicaciones.
- Pantalla de productos.
- Inventario.

## Flujo

```text
Seleccionar ubicación
        ↓
"Asignar producto"
        ↓
┌───────────────────────────────────────┐
│ Buscar producto                       │
│ [ Pechuga...                    🔍 ]  │
│                                       │
│ Resultados                            │
│ POL-001  Pechuga de pollo 2 kg        │
│ POL-002  Pechuga de pollo 5 kg        │
└───────────────────────────────────────┘
        ↓
Seleccionar producto
        ↓
Ingresar cantidad
        ↓
Confirmar
```

---

# 13. Entrada manual de producto

La opción predeterminada debe permitir escribir texto libremente.

Ejemplo:

```text
Producto:
[ Pechuga de pollo 2 kg ]

Cantidad:
[ 48 ]

Ubicación:
[ A-01-02-03 ]

[ Confirmar entrada ]
```

El sistema debe permitir posteriormente vincular ese texto a un SKU existente.

Si el producto no existe:

```text
Producto no encontrado.

¿Desea registrarlo como producto nuevo?

[ Crear producto ]
[ Cancelar ]
```

---

# 14. Buscador de productos

El buscador debe permitir:

- SKU.
- Nombre.
- Código de barras.
- Descripción.
- Texto parcial.

Ejemplo:

```text
Buscar:
[ pollo ]

Resultados:

POL-001
Pechuga de pollo 2 kg

POL-002
Pechuga de pollo 5 kg

POL-003
Pollo entero congelado
```

El buscador debe utilizar debounce para evitar consultas innecesarias.

---

# 15. Inventario por ubicación

Al seleccionar una ubicación:

```text
A-01-02-03

Estado: OCUPADA

Productos:

┌─────────┬────────────────────┬──────────┐
│ SKU     │ Producto           │ Cantidad │
├─────────┼────────────────────┼──────────┤
│ POL-001 │ Pechuga de pollo   │ 48       │
│ CAR-002 │ Carne congelada    │ 20       │
└─────────┴────────────────────┴──────────┘
```

Debe existir la opción:

```text
+ Agregar producto
```

---

# 16. Inventario por producto

Al seleccionar un producto:

```text
Pechuga de pollo 2 kg

SKU: POL-001

Stock total: 248 cajas

Ubicaciones:

A-01-01-01    48
A-01-02-03    100
B-02-01-02    100
```

Debe permitir navegar directamente a la ubicación.

---

# 17. Registro de entradas

Cada entrada debe generar un movimiento.

Ejemplo:

```text
ENT-000001

Fecha:
18/09/2026 10:35

Producto:
POL-001

Cantidad:
48

Ubicación:
A-01-02-03

Tipo:
ENTRADA

Usuario:
operador01
```

El inventario aumenta automáticamente.

---

# 18. Registro de salidas

Ejemplo:

```text
SAL-000001

Fecha:
18/09/2026 11:20

Producto:
POL-001

Cantidad:
10

Ubicación:
A-01-02-03

Tipo:
SALIDA

Usuario:
operador01
```

El inventario disminuye automáticamente.

Nunca modificar directamente el stock sin generar un movimiento, salvo funciones administrativas de ajuste debidamente registradas.

---

# 19. Movimientos

Pantalla:

```text
MOVIMIENTOS

Filtros:

Fecha
Tipo
Producto
SKU
Ubicación
Usuario

------------------------------------------------------

Fecha       Tipo       SKU       Cantidad    Ubicación
18/09       ENTRADA    POL-001   +48         A-01-02-03
18/09       SALIDA     POL-001   -10         A-01-02-03
18/09       TRASLADO   POL-002   20          B-02-01-01
```

Tipos:

```text
RECEIPT
ISSUE
TRANSFER
ADJUSTMENT
```

---

# 20. Traslado entre ubicaciones

Debe existir una función para mover productos.

Ejemplo:

```text
Producto:
POL-001

Cantidad:
20

Origen:
A-01-02-03

Destino:
B-02-01-02
```

Al confirmar:

```text
A-01-02-03
-20

B-02-01-02
+20
```

Debe generarse un movimiento TRANSFER.

---

# 21. Filtros

La aplicación debe permitir filtros combinables.

## Filtros principales

```text
Bodega
Zona
Pasillo
Rack
Nivel
Posición
Producto
SKU
Categoría
Estado
```

Ejemplo:

```text
Pasillo: A
Rack: 01
Producto: Pollo
Estado: Ocupado
```

El resultado debe actualizar simultáneamente:

- tabla;
- inventario;
- vista 3D.

---

# 22. Vista 3D

La vista 3D debe ser una de las características principales del sistema.

## Concepto

```text
              NIVEL 3
        ┌──────┬──────┬──────┐
        │      │      │      │
        ├──────┼──────┼──────┤
        │      │      │      │
        ├──────┼──────┼──────┤
        │      │      │      │
        └──────┴──────┴──────┘
              NIVEL 1
```

En 3D:

- racks representados mediante estructuras simples;
- ubicaciones como segmentos seleccionables;
- color/estado visual;
- cámara orbitable;
- zoom;
- desplazamiento;
- selección;
- tooltip;
- panel lateral de información.

No utilizar modelos 3D pesados en el MVP.

Los racks deben generarse proceduralmente a partir de datos.

---

# 23. Interacción 3D

Al pasar el mouse:

```text
A-01-02-03
48 cajas
```

Al hacer clic:

```text
┌─────────────────────────────┐
│ A-01-02-03             ×    │
├─────────────────────────────┤
│ Estado: OCUPADO             │
│                             │
│ Productos                   │
│ POL-001                     │
│ Pechuga de pollo            │
│ Cantidad: 48                │
│                             │
│ [Asignar producto]          │
│ [Registrar entrada]         │
│ [Registrar salida]          │
│ [Ver movimientos]           │
└─────────────────────────────┘
```

---

# 24. Sistema de colores

## Paleta

Usar únicamente como base:

```text
Azul principal:
#2563EB

Azul oscuro:
#1E3A8A

Blanco:
#FFFFFF

Negro:
#111111

Rojo:
#DC2626

Gris de apoyo:
#F3F4F6
#6B7280
```

El gris se utiliza solamente como color auxiliar para fondos, bordes y texto secundario.

## Semántica

Azul:
- acciones principales;
- selección;
- navegación;
- información.

Rojo:
- errores;
- bloqueos;
- alertas;
- acciones destructivas.

Blanco:
- superficies;
- tarjetas;
- contenido.

Negro:
- texto principal;
- elementos de alto contraste.

---

# 25. Diseño UI/UX

Principios:

- Minimalista.
- Profesional.
- Alta legibilidad.
- Pocas acciones por pantalla.
- Espaciado consistente.
- Bordes suaves.
- Sombras muy sutiles.
- Sin exceso de colores.
- Iconografía consistente.
- Responsive.

## Layout

```text
┌──────────────────────────────────────────────────────┐
│ LOGO        Buscar...                🔔   Usuario    │
├──────────────┬───────────────────────────────────────┤
│              │                                       │
│ Dashboard    │                                       │
│ Bodega       │             CONTENIDO                 │
│ Ubicaciones  │                                       │
│ Productos    │                                       │
│ Inventario   │                                       │
│ Movimientos  │                                       │
│              │                                       │
│ Configuración│                                       │
└──────────────┴───────────────────────────────────────┘
```

Sidebar:

- Dashboard
- Bodega 3D
- Ubicaciones
- Productos
- Inventario
- Movimientos
- Reportes
- Configuración

---

# 26. Diseño responsive

Desktop:

- Sidebar.
- Dashboard.
- Vista 3D grande.
- Panel lateral.

Tablet:

- Sidebar reducido.
- 3D adaptado.

Móvil:

- Navegación inferior o menú lateral.
- Vista 3D simplificada.
- Formularios optimizados para operación.

El WMS debe ser usable desde una tablet industrial o PDA posteriormente.

---

# 27. Modelo de datos

## Warehouse

```text
Warehouse
---------
id
name
code
description
active
createdAt
updatedAt
```

## Zone

```text
Zone
----
id
warehouseId
name
code
type
temperature
createdAt
updatedAt
```

## Aisle

```text
Aisle
-----
id
zoneId
name
code
createdAt
updatedAt
```

## Rack

```text
Rack
----
id
aisleId
name
code
levels
positions
createdAt
updatedAt
```

## Location

```text
Location
--------
id
rackId
code
level
position
status
width
depth
height
maxWeight
createdAt
updatedAt
```

## Product

```text
Product
-------
id
sku
name
description
barcode
unit
category
brand
active
createdAt
updatedAt
```

## Inventory

```text
Inventory
---------
id
productId
locationId
quantity
reservedQuantity
availableQuantity
createdAt
updatedAt
```

## Movement

```text
Movement
--------
id
type
productId
quantity
sourceLocationId
destinationLocationId
reference
reason
userId
createdAt
```

## User

```text
User
----
id
name
email
passwordHash
role
active
createdAt
updatedAt
```

---

# 28. Relaciones

```text
Warehouse
   │
   └── Zone
         │
         └── Aisle
               │
               └── Rack
                     │
                     └── Location
                           │
                           └── Inventory
                                 │
                                 └── Product
```

Movimientos:

```text
Product
   │
   └── Movement
          │
          ├── sourceLocation
          ├── destinationLocation
          └── User
```

---

# 29. Reglas de negocio

## Stock

Nunca permitir:

```text
quantity < 0
```

salvo que exista una configuración administrativa explícita para stock negativo.

## Salidas

Antes de confirmar:

```text
cantidad solicitada <= cantidad disponible
```

Si no:

```text
ERROR:
Stock insuficiente.
```

## Ubicación

Una ubicación bloqueada no puede recibir ni entregar inventario.

## Producto

Un producto inactivo no puede utilizarse en nuevas operaciones.

## Movimiento

Toda modificación de inventario debe generar un movimiento.

## Auditoría

No eliminar movimientos históricos.

---

# 30. API REST

## Products

```http
GET    /api/products
GET    /api/products/:id
POST   /api/products
PATCH  /api/products/:id
DELETE /api/products/:id
```

## Warehouses

```http
GET    /api/warehouses
POST   /api/warehouses
GET    /api/warehouses/:id
PATCH  /api/warehouses/:id
```

## Locations

```http
GET    /api/locations
GET    /api/locations/:id
POST   /api/locations
PATCH  /api/locations/:id
```

## Inventory

```http
GET    /api/inventory
GET    /api/inventory/location/:id
GET    /api/inventory/product/:id
```

## Movements

```http
GET    /api/movements
POST   /api/movements/entry
POST   /api/movements/exit
POST   /api/movements/transfer
POST   /api/movements/adjustment
```

---

# 31. Ejemplo de entrada

```json
{
  "productId": "uuid",
  "locationId": "uuid",
  "quantity": 48,
  "reason": "Recepción de mercancía"
}
```

Backend:

```text
BEGIN TRANSACTION

1. Validar producto
2. Validar ubicación
3. Crear/actualizar Inventory
4. Crear Movement
5. Actualizar timestamps
6. COMMIT
```

Si alguna operación falla:

```text
ROLLBACK
```

---

# 32. Ejemplo de salida

```json
{
  "productId": "uuid",
  "locationId": "uuid",
  "quantity": 10,
  "reason": "Despacho"
}
```

Validaciones:

```text
Producto existe
Ubicación existe
Producto está en ubicación
Stock >= 10
```

Luego:

```text
Inventory.quantity -= 10
Movement.type = ISSUE
```

---

# 33. Transacciones de base de datos

Las entradas, salidas y traslados deben ejecutarse dentro de transacciones PostgreSQL.

Ejemplo:

```text
TRANSFER

BEGIN

Origen:
quantity = quantity - 20

Destino:
quantity = quantity + 20

Crear Movement

COMMIT
```

Esto evita inconsistencias si ocurre un error durante la operación.

---

# 34. Seguridad

MVP:

- Login.
- JWT.
- Password hashing.
- Roles.
- Protección de endpoints.
- Validación de payloads.
- Rate limiting básico.

Roles iniciales:

```text
ADMIN
SUPERVISOR
OPERATOR
VIEWER
```

Permisos:

### ADMIN

Todo.

### SUPERVISOR

Inventario + movimientos + configuración operacional.

### OPERATOR

Entradas + salidas + traslados + consulta.

### VIEWER

Solo consulta.

---

# 35. Auditoría

Registrar:

```text
Usuario
Acción
Fecha
IP
Entidad
ID entidad
Valor anterior
Valor nuevo
```

Ejemplo:

```text
Usuario: operador01
Acción: TRANSFER
Producto: POL-001
Cantidad: 20
Origen: A-01-02-03
Destino: B-02-01-02
Fecha: 18/09/2026 11:40
```

---

# 36. Filtros de inventario

La consulta debe soportar:

```text
GET /api/inventory?
warehouseId=
zone=
aisle=
rack=
location=
product=
sku=
status=
```

El frontend debe sincronizar filtros importantes con la URL para poder compartir una búsqueda.

Ejemplo:

```text
/inventory?aisle=A&rack=01
```

---

# 37. Rendimiento

Para el MVP:

- Paginación en tablas.
- Debounce en búsquedas.
- Índices PostgreSQL.
- React Query para caché.
- Lazy loading de componentes 3D.
- No cargar todos los movimientos simultáneamente.
- No renderizar miles de objetos 3D innecesariamente.

La vista 3D debe cargar la estructura de la bodega y consultar los datos de inventario de manera eficiente.

---

# 38. Índices PostgreSQL

Crear índices sobre:

```text
Product.sku
Product.barcode
Product.name

Location.code
Location.aisle
Location.rack

Inventory.productId
Inventory.locationId

Movement.productId
Movement.createdAt
Movement.type
```

---

# 39. Diseño de la vista de ubicaciones

Debe existir una tabla además de la vista 3D.

```text
UBICACIONES

Buscar [____________________]

Pasillo ▼
Rack ▼
Estado ▼

┌────────────┬─────────┬───────────┬──────────────┐
│ Código     │ Pasillo │ Rack      │ Estado       │
├────────────┼─────────┼───────────┼──────────────┤
│ A-01-01-01 │ A       │ 01        │ OCUPADA      │
│ A-01-01-02 │ A       │ 01        │ DISPONIBLE   │
│ A-01-01-03 │ A       │ 01        │ BLOQUEADA    │
└────────────┴─────────┴───────────┴──────────────┘
```

---

# 40. Estados visuales 3D

La vista 3D debe comunicar rápidamente el estado.

Conceptualmente:

```text
Disponible → azul claro/neutro
Ocupada    → azul
Bloqueada  → rojo
Seleccionada → borde/iluminación azul
```

No depender exclusivamente del color: mostrar también etiquetas, iconos o estados textuales para accesibilidad.

---

# 41. Formularios UX

Los formularios de entrada/salida deben ser rápidos.

Ejemplo:

```text
REGISTRAR ENTRADA

Producto
[ Buscar o escribir producto ]

Cantidad
[ 48 ]

Ubicación
[ A-01-02-03 ]

Motivo
[ Recepción ]

                    [ Cancelar ] [ Confirmar entrada ]
```

La acción principal debe ser claramente visible.

---

# 42. Buscador universal

Agregar un buscador global en el header:

```text
Buscar productos, SKU, ubicaciones...
```

Resultados agrupados:

```text
PRODUCTOS
POL-001 Pechuga de pollo

UBICACIONES
A-01-02-03

MOVIMIENTOS
ENT-000125
```

---

# 43. Roadmap

## Fase 1 — MVP

Implementar:

- Login.
- Dashboard.
- Bodega.
- Pasillos.
- Racks.
- Ubicaciones.
- Productos.
- Inventario.
- Entradas.
- Salidas.
- Traslados.
- Movimientos.
- Filtros.
- Vista 3D.
- Asignación producto/ubicación.

## Fase 2

Agregar:

- Código de barras.
- Lector mediante cámara.
- PDA.
- Inventario cíclico.
- Ajustes.
- Reportes.
- Exportación Excel/CSV.
- Auditoría avanzada.

## Fase 3

Agregar:

- Lotes.
- Fechas de vencimiento.
- FEFO.
- FIFO.
- Pallets.
- SSCC.
- Picking.
- Packing.
- Despacho.
- Reposición.

## Fase 4

Agregar:

- Integración ERP.
- API externa.
- Órdenes de compra.
- Órdenes de venta.
- Multi-bodega.
- Multiempresa.
- Dashboard avanzado.

## Fase 5

Agregar:

- Optimización automática de ubicaciones.
- Rutas de picking.
- RFID.
- IoT.
- Integración con transportadores.
- Analítica avanzada.

---

# 44. Docker y entorno de desarrollo

Utilizar Docker para contenerizar la aplicación web y API cuando sea conveniente.

**No crear un contenedor PostgreSQL local como parte del stack principal**, porque la base de datos oficial del proyecto estará alojada en InsForge Cloud.

Servicios locales recomendados:

```text
api
web
```

La aplicación se conecta al PostgreSQL remoto de InsForge mediante `DATABASE_URL`.

Opcionalmente puede utilizarse una base PostgreSQL local únicamente para pruebas aisladas, pero esta no debe considerarse la fuente de verdad del proyecto.

---

# 45. Variables de entorno

Frontend:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
```

Backend:

```env
DATABASE_URL="<INSFORGE_POSTGRES_CONNECTION_STRING>"
JWT_SECRET=change-me
PORT=3001
```

Si se utiliza el SDK/API de InsForge, sus claves y endpoints también deben configurarse mediante variables de entorno del backend. Nunca exponer credenciales privilegiadas de InsForge en el frontend.

La cadena `DATABASE_URL` debe copiarse desde el proyecto correspondiente de InsForge y almacenarse únicamente como secreto/variable de entorno. No colocar credenciales reales en el `.md`, código fuente, Git ni archivos públicos.

---

# 45.1 Configuración InsForge como código

Cuando corresponda, mantener la configuración compatible con InsForge versionada mediante `insforge.toml` y utilizar el flujo oficial de `plan` / `apply` para cambios de configuración. Los secretos deben resolverse mediante variables de entorno y nunca almacenarse en el repositorio. citeturn2search11

El proyecto debe contemplar ambientes separados para desarrollo/staging/producción. Si se utiliza Backend Branching de InsForge, las ramas deben emplearse para validar cambios de backend y base de datos antes de promoverlos a producción. citeturn2search4

---

# 46. Testing

Utilizar:

### Backend

- Jest.
- Supertest.

### Frontend

- Vitest.
- React Testing Library.

### E2E

- Playwright.

Casos críticos:

```text
Entrada de stock
Salida de stock
Stock insuficiente
Traslado
Ubicación bloqueada
Producto inexistente
Asignación producto/ubicación
Filtros
Login
Permisos
```

---

# 47. Principios de desarrollo

1. TypeScript estricto.
2. No duplicar lógica de negocio.
3. Validar siempre en backend.
4. El frontend nunca debe ser la fuente de verdad del inventario.
5. Utilizar transacciones para operaciones de inventario.
6. No borrar movimientos históricos.
7. Utilizar UUID para IDs.
8. Crear migraciones versionadas.
9. Componentes UI reutilizables.
10. Separar lógica de negocio de presentación.
11. Preparar la arquitectura para múltiples bodegas.
12. Diseñar desde el inicio pensando en dispositivos móviles/PDA.

---

# 48. Prioridad de desarrollo

Orden recomendado:

```text
1. PostgreSQL
       ↓
2. Prisma schema
       ↓
3. API NestJS
       ↓
4. Auth
       ↓
5. Productos
       ↓
6. Bodegas / ubicaciones
       ↓
7. Inventario
       ↓
8. Entradas / salidas / traslados
       ↓
9. Dashboard
       ↓
10. Filtros
       ↓
11. Vista 3D
       ↓
12. Auditoría
       ↓
13. Testing
       ↓
14. Docker
```

No comenzar por la vista 3D. Primero construir el modelo de datos y las operaciones de inventario; la vista 3D debe consumir esa información.

---

# 49. Criterios de aceptación del MVP

El MVP se considera funcional cuando:

### Ubicaciones

- [ ] Se puede crear una bodega.
- [ ] Se pueden crear zonas.
- [ ] Se pueden crear pasillos.
- [ ] Se pueden crear racks.
- [ ] Se pueden crear niveles.
- [ ] Se pueden crear posiciones.
- [ ] Cada ubicación tiene código único.

### Productos

- [ ] Se puede crear producto.
- [ ] Se puede buscar por SKU.
- [ ] Se puede buscar por nombre.
- [ ] Se puede buscar por código de barras.
- [ ] Se puede escribir un producto manualmente.

### Inventario

- [ ] Se puede asignar producto a ubicación.
- [ ] Se puede registrar entrada.
- [ ] Se puede registrar salida.
- [ ] Se puede trasladar producto.
- [ ] El stock se actualiza automáticamente.
- [ ] No se permite stock negativo.
- [ ] Cada operación genera movimiento.

### Visualización

- [ ] La bodega se puede visualizar en 3D.
- [ ] Se puede seleccionar una ubicación.
- [ ] Se muestran los productos de la ubicación.
- [ ] Se puede navegar desde el 3D al detalle.
- [ ] Los filtros afectan la vista 3D.

### UX

- [ ] Diseño responsive.
- [ ] Azul/blanco/negro/rojo.
- [ ] Minimalista.
- [ ] Profesional.
- [ ] Acciones críticas claramente diferenciadas.
- [ ] Mensajes de éxito/error.
- [ ] Confirmación para acciones destructivas.

---

# 50. Prompt maestro para un agente de desarrollo

Utilizar este documento como especificación principal.

El agente debe desarrollar un WMS web MVP siguiendo estrictamente esta arquitectura:

```text
Frontend:
Next.js + React + TypeScript
Tailwind CSS
shadcn/ui
TanStack Query
Zustand
React Hook Form
Zod
Three.js
React Three Fiber
Drei

Backend:
Node.js
NestJS
TypeScript
Prisma

Database:
PostgreSQL

Testing:
Jest
Vitest
Playwright

Infrastructure:
Docker Compose
```

El sistema debe priorizar la consistencia del inventario y la trazabilidad por encima de la complejidad visual.

Toda entrada, salida o transferencia debe realizarse mediante una transacción de base de datos y generar un registro histórico.

La interfaz debe ser minimalista y profesional, utilizando azul, blanco, negro y rojo.

La vista 3D debe generarse a partir de las entidades de bodega, pasillos, racks, niveles y ubicaciones almacenadas en PostgreSQL.

No hardcodear la estructura de la bodega.

La aplicación debe ser capaz de representar diferentes tamaños y cantidades de racks a partir de datos.

El código debe ser modular, tipado, documentado cuando sea necesario y preparado para futuras funciones WMS.

---

# 51. Resultado esperado

El resultado final del MVP debe permitir este flujo:

```text
                    CREAR BODEGA
                         ↓
                 CREAR UBICACIONES
                         ↓
                  CREAR PRODUCTOS
                         ↓
              ASIGNAR PRODUCTO
                 A UBICACIÓN
                         ↓
               REGISTRAR ENTRADA
                         ↓
                 ACTUALIZAR STOCK
                         ↓
                VISUALIZAR EN 3D
                         ↓
                 BUSCAR / FILTRAR
                         ↓
                REGISTRAR SALIDA
                         ↓
                 ACTUALIZAR STOCK
                         ↓
                CONSULTAR HISTORIAL
```

La aplicación debe funcionar como una base sólida para posteriormente evolucionar hacia un WMS completo.

---

# 52. Diseño físico de la bodega — configuración inicial

La configuración física inicial de la bodega queda definida de la siguiente manera. Esta distribución es la referencia oficial para el modelo de datos, generación de ubicaciones, seed de Prisma y visualización 3D.

## 52.1 Resumen de la distribución

La bodega cuenta con **2 pasillos: Pasillo A y Pasillo B**. Ambos pasillos tienen exactamente la misma configuración.

Cada pasillo contiene:

- **Rack central:** 30 posiciones totales.
  - Nivel 1: 15 posiciones.
  - Nivel 2: 15 posiciones.
- **Rack de pared:** 44 posiciones totales.
  - Nivel 1: 22 posiciones.
  - Nivel 2: 22 posiciones.

Por lo tanto:

- Pasillo A: 30 + 44 = **74 posiciones**.
- Pasillo B: 30 + 44 = **74 posiciones**.
- Capacidad total de la bodega: **148 posiciones**.

## 52.2 Estructura física

```text
Bodega Principal
├── Pasillo A
│   ├── Rack Central A
│   │   ├── Nivel 1 → 15 posiciones
│   │   └── Nivel 2 → 15 posiciones
│   │
│   └── Rack Pared A
│       ├── Nivel 1 → 22 posiciones
│       └── Nivel 2 → 22 posiciones
│
└── Pasillo B
    ├── Rack Central B
    │   ├── Nivel 1 → 15 posiciones
    │   └── Nivel 2 → 15 posiciones
    │
    └── Rack Pared B
        ├── Nivel 1 → 22 posiciones
        └── Nivel 2 → 22 posiciones
```

## 52.3 Tabla de capacidad

| Pasillo | Rack | Nivel 1 | Nivel 2 | Total |
|---|---|---:|---:|---:|
| A | Central | 15 | 15 | 30 |
| A | Pared | 22 | 22 | 44 |
| **A** | **Total** | **37** | **37** | **74** |
| B | Central | 15 | 15 | 30 |
| B | Pared | 22 | 22 | 44 |
| **B** | **Total** | **37** | **37** | **74** |
| **TOTAL** | | **74** | **74** | **148** |

## 52.4 Codificación de ubicaciones

Formato recomendado:

```text
[PASILLO]-[TIPO_RACK]-[NIVEL]-[POSICIÓN]
```

Donde:

- `A` / `B`: pasillo.
- `C`: rack central.
- `P`: rack de pared.
- `01` / `02`: nivel.
- La posición se numera correlativamente según el rack.

Ejemplos:

```text
A-C-01-01
A-C-01-15
A-C-02-01
A-C-02-15
A-P-01-01
A-P-01-22
A-P-02-01
A-P-02-22
B-C-01-01
B-C-02-15
B-P-01-22
B-P-02-22
```

## 52.5 Cantidad de ubicaciones que debe generar el sistema

El seed inicial de Prisma debe generar automáticamente **148 ubicaciones**:

- 30 para Rack Central A.
- 44 para Rack Pared A.
- 30 para Rack Central B.
- 44 para Rack Pared B.
- **Total: 148.**

No se deben crear las 148 ubicaciones manualmente. La generación debe realizarse mediante una función/seed parametrizada para que posteriormente sea posible modificar la cantidad de posiciones, niveles o racks sin rediseñar la aplicación.

## 52.6 Visualización 3D

El modelo 3D debe representar esta distribución física y obtener sus datos desde PostgreSQL/InsForge. No debe depender de una lista de posiciones escrita directamente en el código frontend.

Cada una de las 148 posiciones debe poder seleccionarse individualmente. Al seleccionar una ubicación, mostrar como mínimo:

- Código de ubicación.
- Pasillo.
- Rack.
- Nivel.
- Número de posición.
- Producto almacenado.
- Cantidad disponible.
- Estado de la ubicación.
- Acciones: `Asignar producto`, `Registrar entrada`, `Registrar salida`, `Trasladar`, `Ver historial`.

Los filtros de pasillo, rack, nivel, producto y estado deben afectar tanto la vista tabular como la visualización 3D.

## 52.7 Dimensiones físicas

La cantidad de posiciones está definida, pero todavía no se deben inventar dimensiones físicas que no hayan sido proporcionadas. Los siguientes parámetros deben quedar configurables:

- Ancho del pasillo.
- Profundidad del rack.
- Ancho de cada posición.
- Altura entre niveles.
- Separación entre posiciones.
- Separación entre racks.
- Orientación de cada rack.
- Coordenadas X/Y/Z.

Esto permitirá ajustar posteriormente el modelo 3D a las dimensiones reales de la bodega sin modificar la estructura lógica del WMS.

## 52.8 Regla importante para el desarrollo

**La capacidad oficial inicial de la bodega es de 148 posiciones.** Toda la aplicación —base de datos, seed, inventario, filtros, movimientos, dashboard y modelo 3D— debe utilizar esta configuración como referencia inicial.

El diseño debe mantenerse parametrizado para permitir futuras ampliaciones de racks, niveles, pasillos o posiciones.


# 53. Plataforma de base de datos y backend — InsForge

La decisión tecnológica oficial para este proyecto es: **PostgreSQL alojado en InsForge Cloud**.

InsForge ofrece PostgreSQL administrado, acceso PostgreSQL directo mediante cadena de conexión y servicios backend adicionales. citeturn2search0turn2search2

## 53.1 Arquitectura definitiva

```text
┌──────────────────────────────┐
│        Next.js / React       │
│       TypeScript + UI/UX     │
└──────────────┬───────────────┘
               │ HTTPS / REST
               ▼
┌──────────────────────────────┐
│          NestJS API          │
│ Reglas de negocio / seguridad│
└──────────────┬───────────────┘
               │ Prisma
               │ DATABASE_URL
               ▼
┌──────────────────────────────┐
│      InsForge Cloud          │
│        PostgreSQL            │
│  Base de datos WMS           │
└──────────────────────────────┘
```

El frontend nunca debe contener la contraseña, connection string ni credenciales privilegiadas de PostgreSQL/InsForge.

## 53.2 Fuente de verdad

La fuente de verdad de los datos operacionales del WMS será el PostgreSQL administrado por InsForge. Esto incluye:

- Bodega.
- Pasillos.
- Racks.
- Niveles.
- Ubicaciones.
- Productos.
- Inventario.
- Entradas.
- Salidas.
- Traslados.
- Movimientos.
- Usuarios y permisos definidos por la aplicación.
- Auditoría.

## 53.3 Migraciones

Todas las modificaciones estructurales de la base de datos deben quedar versionadas. El agente de desarrollo debe evitar cambios manuales no documentados sobre producción. InsForge dispone de un sistema de migraciones para registrar los cambios aplicados. citeturn2search9

## 53.4 PostgreSQL directo vs API de InsForge

Para el MVP se mantiene **NestJS + Prisma** como capa principal de acceso a datos, utilizando la conexión PostgreSQL de InsForge.

Los servicios nativos de InsForge —por ejemplo Auth, Storage, Realtime o Edge Functions— podrán incorporarse cuando aporten una ventaja clara al WMS. InsForge también ofrece una API basada en PostgREST, pero no es obligatorio utilizarla si Prisma/NestJS ya cubren correctamente las necesidades del backend. citeturn2search8

## 53.5 Regla para el agente de programación

Antes de implementar o modificar la integración con InsForge, el agente debe consultar las instrucciones oficiales de InsForge disponibles en `https://insforge.dev/skill.md` y seguir la versión vigente de sus skills/CLI, en lugar de asumir comandos o configuraciones antiguas.

## 53.6 Regiones

La región de InsForge debe seleccionarse considerando la ubicación de los usuarios y la latencia esperada. InsForge documenta actualmente regiones como `us-east`, `us-west`, `eu-central` y `ap-southeast`. La región concreta debe definirse al crear el proyecto y quedar documentada en la configuración del entorno. citeturn2search7
