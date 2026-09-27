import { test, expect, Page } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

// ==================== REALISTIC ENTERPRISE MOCK DATA ====================

const MOCK_JWT_PAYLOAD = {
  id: 'usr-admin-master',
  email: 'jefe.operaciones@wms-logistica.com',
  name: 'Ing. Alejandro Morales',
  role: 'ADMIN',
  exp: Math.floor(Date.now() / 1000) + 86400 * 365,
};

const MOCK_TOKEN = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${Buffer.from(JSON.stringify(MOCK_JWT_PAYLOAD)).toString('base64url')}.mockSignature`;

const MOCK_PROFILE = {
  id: 'usr-admin-master',
  email: 'jefe.operaciones@wms-logistica.com',
  name: 'Ing. Alejandro Morales',
  role: 'ADMIN',
  organizationId: 'org-wms-central',
  active: true,
  permissions: {
    canViewDashboard: true,
    canViewKpis: true,
    canViewReports: true,
    canViewProducts: true,
    canViewLocations: true,
    canViewInventory: true,
    canViewMovements: true,
    canView3D: true,
    canView2D: true,
    canViewMapping: true,
    canViewAudit: true,
    canCreateEntry: true,
    canCreateExit: true,
    canCreateTransfer: true,
    canCreateAdjustment: true,
    canAuditMapping: true,
    canManageProducts: true,
    canManageLocations: true,
    canManageTeam: true,
    canBulkImport: true,
    canExportProducts: true,
    canDownloadReports: true,
    canScheduleReports: true,
    canPrintLabels: true,
  },
};

function createInitialState() {
  return {
    summary: {
      products: 52,
      locations: 148,
      occupiedLocations: 92,
      availableLocations: 56,
      totalUnits: 18450,
      entriesToday: 14,
      issuesToday: 9,
    },
    products: [
      { id: 'prod-01', sku: 'ARR-DIA-001', name: 'Arroz Diana Especial 1kg', category: 'Granos', unit: 'kg', active: true, barcode: '7702001001234' },
      { id: 'prod-02', sku: 'ACE-PRE-002', name: 'Aceite Premier 1000ml', category: 'Aceites', unit: 'litro', active: true, barcode: '7702001005678' },
      { id: 'prod-03', sku: 'JUG-HIT-003', name: 'Jugo Hit Mora 500ml', category: 'Bebidas', unit: 'unidad', active: true, barcode: '7702001009012' },
      { id: 'prod-04', sku: 'LEC-ALQ-004', name: 'Leche Entera Alquería 1L', category: 'Lácteos', unit: 'litro', active: true, barcode: '7702001003456' },
      { id: 'prod-05', sku: 'CAF-SEL-005', name: 'Café Sello Rojo 500g', category: 'Café', unit: 'unidad', active: true, barcode: '7702001007890' },
    ],
    locations: [
      { id: 'loc-01', code: 'A-C-01-01', status: 'AVAILABLE', level: 1, position: 1, rack: { id: 'rk-c', code: 'C', levels: 2, positions: 15 } },
      { id: 'loc-02', code: 'A-C-01-02', status: 'OCCUPIED', level: 1, position: 2, rack: { id: 'rk-c', code: 'C', levels: 2, positions: 15 } },
      { id: 'loc-03', code: 'A-C-02-01', status: 'AVAILABLE', level: 2, position: 1, rack: { id: 'rk-c', code: 'C', levels: 2, positions: 15 } },
      { id: 'loc-04', code: 'B-C-01-01', status: 'OCCUPIED', level: 1, position: 1, rack: { id: 'rk-c', code: 'C', levels: 2, positions: 15 } },
      { id: 'loc-05', code: 'A-P-01-01', status: 'BLOCKED', level: 1, position: 1, rack: { id: 'rk-p', code: 'P', levels: 2, positions: 22 } },
    ],
    inventory: [
      { id: 'inv-01', quantity: 600, reservedQuantity: 50, product: { id: 'prod-01', sku: 'ARR-DIA-001', name: 'Arroz Diana Especial 1kg' }, location: { id: 'loc-02', code: 'A-C-01-02' } },
      { id: 'inv-02', quantity: 340, reservedQuantity: 0, product: { id: 'prod-02', sku: 'ACE-PRE-002', name: 'Aceite Premier 1000ml' }, location: { id: 'loc-04', code: 'B-C-01-01' } },
    ],
    movements: [
      { id: 'mov-01', type: 'ENTRY', quantity: 200, createdAt: new Date().toISOString(), product: { id: 'prod-01', sku: 'ARR-DIA-001', name: 'Arroz Diana Especial 1kg' }, destinationLocation: { id: 'loc-02', code: 'A-C-01-02' }, reason: 'Recepcion Proveedor Nacional' },
      { id: 'mov-02', type: 'EXIT', quantity: 80, createdAt: new Date().toISOString(), product: { id: 'prod-02', sku: 'ACE-PRE-002', name: 'Aceite Premier 1000ml' }, sourceLocation: { id: 'loc-04', code: 'B-C-01-01' }, reason: 'Despacho Orden #9482' },
    ],
    kpis: {
      occupancy: {
        rate: 62.1,
        occupied: 92,
        total: 148,
        alert: false,
        byZone: [
          { zoneCode: 'A', zoneName: 'Zona Alimentos Secos', occupied: 45, total: 60, rate: 75 },
          { zoneCode: 'B', zoneName: 'Zona Líquidos y Aceites', occupied: 47, total: 88, rate: 53.4 },
        ],
      },
      abcClassification: {
        classA: { skuCount: 10, percentage: 80, items: [{ sku: 'ARR-DIA-001', name: 'Arroz Diana Especial 1kg', issues: 640 }] },
        classB: { skuCount: 18, percentage: 15, items: [{ sku: 'ACE-PRE-002', name: 'Aceite Premier 1000ml', issues: 190 }] },
        classC: { skuCount: 24, percentage: 5, items: [{ sku: 'JUG-HIT-003', name: 'Jugo Hit Mora 500ml', issues: 35 }] },
      },
      deadStock: { count: 2, items: [{ sku: 'OBS-OLD-999', name: 'Envase Descontinuado 5L', quantity: 15, daysSinceMovement: 110 }] },
      dsi: { value: 21, totalStock: 18450, avgDailyIssues: 878, alert: false },
      throughput: {
        trend: [
          { date: '2026-09-21', receipts: 140, issues: 95 },
          { date: '2026-09-22', receipts: 160, issues: 120 },
          { date: '2026-09-23', receipts: 190, issues: 150 },
          { date: '2026-09-24', receipts: 110, issues: 140 },
          { date: '2026-09-25', receipts: 230, issues: 180 },
          { date: '2026-09-26', receipts: 145, issues: 125 },
          { date: '2026-09-27', receipts: 175, issues: 135 },
        ],
        totalReceipts7d: 1150,
        totalIssues7d: 945,
        balance: 205,
      },
      ira: { percentage: 99.4, totalAdjustments: 1, totalStock: 18450, deviationRate: 0.6, alert: false },
      breakRisk: { count: 1, items: [{ sku: 'LEC-ALQ-004', name: 'Leche Entera Alquería 1L', quantity: 45, daysRemaining: 2 }] },
    },
    team: [
      { id: 'usr-admin-master', name: 'Ing. Alejandro Morales', email: 'jefe.operaciones@wms-logistica.com', role: 'ADMIN', active: true, createdAt: '2026-01-01' },
      { id: 'usr-sup-02', name: 'Laura Restrepo', email: 'laura.sup@wms-logistica.com', role: 'SUPERVISOR', active: true, createdAt: '2026-02-15' },
      { id: 'usr-op-03', name: 'Carlos Mendoza', email: 'carlos.op@wms-logistica.com', role: 'OPERATOR', active: true, createdAt: '2026-03-10' },
      { id: 'usr-audit-04', name: 'Mariana Gómez', email: 'mariana.audit@wms-logistica.com', role: 'VIEWER', active: true, createdAt: '2026-04-12' },
    ],
    auditLogs: [
      { id: 'log-01', action: 'MOVEMENT_ENTRY', entity: 'MOVEMENT', createdAt: new Date().toISOString(), user: { name: 'Carlos Mendoza', role: 'OPERATOR' }, details: { sku: 'ARR-DIA-001', qty: 200, location: 'A-C-01-02' }, ip: '192.168.1.100' },
      { id: 'log-02', action: 'SECURITY_2FA_ENABLED', entity: 'USER', createdAt: new Date(Date.now() - 3600000).toISOString(), user: { name: 'Ing. Alejandro Morales', role: 'ADMIN' }, details: { method: 'TOTP_AUTHENTICATOR' }, ip: '192.168.1.10' },
    ],
  };
}

async function setupE2EMockEnvironment(page: Page) {
  const state = createInitialState();
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': '*',
  };

  await page.route('**/*', async (route) => {
    try {
      const url = route.request().url();
      const method = route.request().method();

      if (method === 'OPTIONS') {
        return route.fulfill({ status: 204, headers: corsHeaders });
      }

      // External integrations & services interception
      if (url.includes('sentry.io') || url.includes('/envelope')) {
        return route.fulfill({ status: 200, headers: corsHeaders, contentType: 'application/json', body: '{}' });
      }

      if (url.includes('/api/support')) {
        return route.fulfill({
          status: 200,
          headers: corsHeaders,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true, emailStatus: 'sent', resendId: 'res-live-e2e-001' }),
        });
      }

      if (!url.includes('/api') && !url.includes('/auth/me') && !url.includes('localhost:3001') && !url.includes('insforge.app')) {
        return route.continue();
      }

      // Auth Profile & Current User
      if (url.includes('/auth/me') || url.includes('/users/me')) {
        return route.fulfill({ status: 200, headers: corsHeaders, contentType: 'application/json', body: JSON.stringify(MOCK_PROFILE) });
      }

      // Dashboard Summary
      if (url.includes('/dashboard/summary')) {
        return route.fulfill({ status: 200, headers: corsHeaders, contentType: 'application/json', body: JSON.stringify(state.summary) });
      }

      // Products API
      if (url.includes('/products') || url.includes('records/products')) {
        if (method === 'POST') {
          const reqBody = route.request().postDataJSON() || {};
          const newProduct = {
            id: `prod-${Date.now().toString().slice(-4)}`,
            sku: reqBody.sku || 'SKU-E2E-NEW',
            name: reqBody.name || 'Producto E2E Creado',
            category: reqBody.category || 'General',
            unit: reqBody.unit || 'unidad',
            active: true,
            barcode: reqBody.barcode || '7709999000123',
          };
          state.products.unshift(newProduct);
          state.summary.products += 1;
          return route.fulfill({ status: 201, headers: corsHeaders, contentType: 'application/json', body: JSON.stringify(newProduct) });
        }
        if (url.includes('records/products')) {
          return route.fulfill({ status: 200, headers: corsHeaders, contentType: 'application/json', body: JSON.stringify(state.products) });
        }
        return route.fulfill({ status: 200, headers: corsHeaders, contentType: 'application/json', body: JSON.stringify({ items: state.products, total: state.products.length, page: 1, pageSize: 50 }) });
      }

      // Movements API
      if (url.includes('/movements') || url.includes('records/movements')) {
        if (method === 'POST') {
          const reqBody = route.request().postDataJSON() || {};
          const isEntry = url.includes('/entry') || reqBody.type === 'ENTRY';
          const newMovement = {
            id: `mov-${Date.now().toString().slice(-4)}`,
            type: isEntry ? 'ENTRY' : 'EXIT',
            quantity: reqBody.quantity || 100,
            createdAt: new Date().toISOString(),
            product: state.products[0],
            destinationLocation: state.locations[0],
            reason: reqBody.reason || 'Operación E2E Registrada',
          };
          state.movements.unshift(newMovement);
          if (isEntry) {
            state.summary.entriesToday += 1;
            state.summary.totalUnits += newMovement.quantity;
          } else {
            state.summary.issuesToday += 1;
            state.summary.totalUnits = Math.max(0, state.summary.totalUnits - newMovement.quantity);
          }
          return route.fulfill({ status: 201, headers: corsHeaders, contentType: 'application/json', body: JSON.stringify(newMovement) });
        }
        if (url.includes('records/movements')) {
          return route.fulfill({ status: 200, headers: corsHeaders, contentType: 'application/json', body: JSON.stringify(state.movements) });
        }
        return route.fulfill({ status: 200, headers: corsHeaders, contentType: 'application/json', body: JSON.stringify({ items: state.movements, total: state.movements.length, page: 1, pageSize: 50 }) });
      }

      // Locations API
      if (url.includes('/locations') || url.includes('records/locations')) {
        if (url.includes('records/locations')) {
          return route.fulfill({ status: 200, headers: corsHeaders, contentType: 'application/json', body: JSON.stringify(state.locations) });
        }
        return route.fulfill({ status: 200, headers: corsHeaders, contentType: 'application/json', body: JSON.stringify({ items: state.locations, total: state.locations.length, page: 1, pageSize: 50 }) });
      }

      // Inventory API
      if (url.includes('/inventory') || url.includes('records/inventory')) {
        if (url.includes('records/inventory')) {
          return route.fulfill({ status: 200, headers: corsHeaders, contentType: 'application/json', body: JSON.stringify(state.inventory) });
        }
        return route.fulfill({ status: 200, headers: corsHeaders, contentType: 'application/json', body: JSON.stringify({ items: state.inventory, total: state.inventory.length, page: 1, pageSize: 50 }) });
      }

      // Team & Profiles
      if (url.includes('user_profiles') || url.includes('/users')) {
        if (method === 'POST') {
          const reqBody = route.request().postDataJSON() || {};
          const newUser = {
            id: `usr-new-${Date.now().toString().slice(-4)}`,
            name: reqBody.name || 'Nuevo Operador E2E',
            email: reqBody.email || 'operador.nuevo@wms.com',
            role: reqBody.role || 'OPERATOR',
            active: true,
            createdAt: new Date().toISOString(),
          };
          state.team.push(newUser);
          return route.fulfill({ status: 201, headers: corsHeaders, contentType: 'application/json', body: JSON.stringify(newUser) });
        }
        if (url.includes('user_profiles')) {
          return route.fulfill({
            status: 200,
            headers: corsHeaders,
            contentType: 'application/json',
            body: JSON.stringify(state.team.map((u) => ({ id: u.id, name: u.name, role: u.role, active: u.active, permissions: null, created_at: u.createdAt }))),
          });
        }
        return route.fulfill({ status: 200, headers: corsHeaders, contentType: 'application/json', body: JSON.stringify(state.team) });
      }

      // KPIs
      if (url.includes('/dashboard/kpis')) {
        return route.fulfill({ status: 200, headers: corsHeaders, contentType: 'application/json', body: JSON.stringify(state.kpis) });
      }

      // Audit Logs
      if (url.includes('/audit-logs') || url.includes('audit_logs')) {
        if (method === 'POST') {
          return route.fulfill({ status: 201, headers: corsHeaders, contentType: 'application/json', body: JSON.stringify([{ id: 'log-e2e-ok', ok: true }]) });
        }
        return route.fulfill({ status: 200, headers: corsHeaders, contentType: 'application/json', body: JSON.stringify(state.auditLogs) });
      }

      // Label Generation (Zebra ZPL)
      if (url.includes('/labels/')) {
        return route.fulfill({
          status: 200,
          headers: corsHeaders,
          contentType: 'application/json',
          body: JSON.stringify({
            code: 'ARR-DIA-001',
            type: 'PRODUCT',
            barcode: '7702001001234',
            zpl: '^XA^FO50,50^ADN,36,20^FDARR-DIA-001^FS^FO50,100^BY2^BCN,60,Y,N,N^FD7702001001234^FS^XZ',
          }),
        });
      }

      // Reports & Export
      if (url.includes('/reports')) {
        return route.fulfill({ status: 200, headers: corsHeaders, contentType: 'application/json', body: JSON.stringify({ rows: [], totalCount: 0 }) });
      }

      return route.fulfill({ status: 200, headers: corsHeaders, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    } catch (err) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    }
  });

  await page.addInitScript(
    ({ token, user }) => {
      localStorage.setItem(
        'wms_auth_session',
        JSON.stringify({
          accessToken: token,
          user: user,
          expiresAt: Date.now() + 86400000,
        })
      );
    },
    { token: MOCK_TOKEN, user: MOCK_PROFILE }
  );

  await page.goto('/');
  await expect(page.getByText('Rol: ADMIN')).toBeVisible();
}

async function navigateTo(page: Page, tabLabel: string) {
  const nav = page.locator('nav');
  const btn = nav.getByRole('button', { name: new RegExp(tabLabel, 'i') });
  await btn.click();
}

// ==================== MASTER E2E OPERATIONAL LIFE-CYCLE TEST SUITES ====================

test.describe('Flujos Operativos Reales E2E de Principio a Fin (Full Lifecycle WMS)', () => {

  test('Flujo E2E 1: Autenticación, Auditoría de Dashboard y Navegación del Onboarding Operativo', async ({ page }) => {
    // 1. Validar pantalla inicial de Login no autenticado
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
    await expect(page.getByPlaceholder('usuario@bodega.com')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Entrar al Sistema' })).toBeVisible();

    // 2. Probar modal de recuperación de contraseña
    await page.getByText('¿Olvidaste tu contraseña?').click();
    await expect(page.getByRole('heading', { name: 'Restablecer Contraseña' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancelar' }).click();

    // 3. Iniciar sesión como Jefe de Operaciones (ADMIN)
    await setupE2EMockEnvironment(page);
    await expect(page.getByText('jefe.operaciones@wms-logistica.com')).toBeVisible();
    await expect(page.getByText('Rol: ADMIN')).toBeVisible();

    // 4. Verificar Onboarding Operativo "Guía de Puesta en Marcha"
    await expect(page.getByRole('heading', { name: 'Bienvenido al Sistema WMS' })).toBeVisible();
    await expect(page.getByText('Explorar Layout 2D/3D')).toBeVisible();
    await expect(page.getByText('Gestión de Equipo')).toBeVisible();
    await expect(page.getByText('Movimientos de Stock')).toBeVisible();

    // 5. Interactuar con las tarjetas del Onboarding para navegar a los módulos
    await page.getByRole('button', { name: /Abrir Vista 2D/i }).click();
    await expect(page.getByRole('heading', { name: 'Vista 2D' })).toBeVisible();

    await navigateTo(page, 'Dashboard');
    await page.getByRole('button', { name: /Gestionar SKUs/i }).click();
    await expect(page.getByRole('heading', { name: 'Catálogo de Productos' })).toBeVisible();

    await navigateTo(page, 'Dashboard');
    // Ocultar la guía de onboarding
    await page.getByRole('button', { name: /Ocultar/i }).click();
    await expect(page.getByRole('heading', { name: 'Bienvenido al Sistema WMS' })).not.toBeVisible();
  });

  test('Flujo E2E 2: Ciclo de Vida de Stock: Alta de SKU -> Recepción en Bodega -> Etiquetado ZPL -> Despacho y Kardex', async ({ page }) => {
    await setupE2EMockEnvironment(page);

    // 1. Alta de Nuevo Producto en el Catálogo
    await navigateTo(page, 'Productos');
    await expect(page.getByRole('heading', { name: 'Catálogo de Productos' })).toBeVisible();
    await page.getByRole('button', { name: /Nuevo Producto/i }).first().click();
    await expect(page.getByRole('heading', { name: 'Registrar Nuevo Producto' })).toBeVisible();

    const testSku = `LUB-SYN-${Date.now().toString().slice(-4)}`;
    await page.getByPlaceholder(/ALM-ARR/i).fill(testSku);
    await page.getByPlaceholder(/Arroz Diana/i).fill('Lubricante Sintético Motor 5W-30');
    await page.getByRole('button', { name: 'Crear Producto' }).click();

    // 2. Registro de Recepción de Mercancía (Receiving)
    await navigateTo(page, 'Movimientos');
    await expect(page.getByText('Historial Reciente de Movimientos')).toBeVisible();
    await page.getByRole('button', { name: /Entrada/i }).first().click();

    const qtyInput = page.locator('input[type="number"]').first();
    await qtyInput.fill('120');
    await page.getByPlaceholder(/Recepción de proveedor/i).fill('Entrada por Orden de Compra #OC-2026-88');

    await page.getByRole('button', { name: /Confirmar entrada/i }).click();
    await expect(page.getByText(/Operación completada con éxito/i)).toBeVisible();

    // 3. Impresión de Etiqueta Zebra ZPL con Código de Barras
    const labelBtn = page.getByRole('button', { name: /Etiqueta Producto/i });
    await expect(labelBtn).toBeEnabled();
    await labelBtn.click();
    await expect(page.getByRole('heading', { name: 'Etiqueta Identificadora' })).toBeVisible();
    await expect(page.getByText('Copiar ZPL (Zebra)')).toBeVisible();
    await expect(page.getByRole('button', { name: '🖨️ Imprimir' })).toBeVisible();
    await page.getByRole('button', { name: /Copiar ZPL/i }).click();
    await expect(page.getByText('✓ ¡Copiado!')).toBeVisible();
    await page.locator('.fixed').getByRole('button', { name: '✕' }).click();

    // 4. Registro de Salida / Despacho de Stock (Picking & Dispatch)
    await page.getByRole('button', { name: /Salida/i }).first().click();
    await qtyInput.fill('25');
    await page.getByPlaceholder(/Recepción de proveedor/i).fill('Despacho para Pedido Cliente #PED-901');
    await page.getByRole('button', { name: /Confirmar salida/i }).click();
    await expect(page.getByText(/Operación completada con éxito/i)).toBeVisible();

    // 5. Auditoría del Kardex e Historial de Movimientos
    await expect(page.getByRole('cell', { name: 'ARR-DIA-001' }).first()).toBeVisible();
    await expect(page.getByRole('cell', { name: 'ENTRY' }).first()).toBeVisible();

    // 6. Validar reactividad de las métricas en Dashboard
    await navigateTo(page, 'Dashboard');
    await expect(page.getByText('Stock total')).toBeVisible();
    await expect(page.getByText('Entradas hoy')).toBeVisible();
  });

  test('Flujo E2E 3: Layout Esquemático 2D -> Auditoría Visual de Posiciones -> Mapeo y Conciliación Física', async ({ page }) => {
    await setupE2EMockEnvironment(page);

    // 1. Navegar a Vista 2D
    await navigateTo(page, 'Vista 2D');
    await expect(page.getByRole('heading', { name: 'Vista 2D' })).toBeVisible();
    await expect(page.getByText('Disponibles', { exact: true })).toBeVisible();
    await expect(page.getByText('Ocupadas', { exact: true })).toBeVisible();
    await expect(page.getByText('Bloqueadas', { exact: true })).toBeVisible();

    // 2. Exploración interactiva del plano de planta: Portón y Pasillos
    await expect(page.getByText('Bodega Principal · Plano de Planta 2D')).toBeVisible();
    await expect(page.getByText('Rack Central (Isla)')).toBeVisible();

    // 3. Seleccionar casillero del Rack Central (A-C-01-01)
    const locBtn = page.locator('button[title*="A-C-01-01"]').first();
    await expect(locBtn).toBeVisible();
    await locBtn.click();

    // 4. Inspección lateral del casillero
    await expect(page.getByText('Inspección de Ubicación')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'A-C-01-01' })).toBeVisible();

    // 5. Iniciar conciliación física navegando a Mapeo Almacén
    const auditBtn = page.getByRole('button', { name: /Auditar Posición en Mapeo/i });
    await expect(auditBtn).toBeVisible();
    await auditBtn.click();

    // 6. Verificar el módulo de Conciliación Física
    await expect(page.getByRole('heading', { name: 'Mapeo y Conciliación Física de Almacén' })).toBeVisible();
    await expect(page.getByText('Total Posiciones')).toBeVisible();
    await expect(page.getByRole('button', { name: /Plano 2D Oficial/i })).toBeVisible();
  });

  test('Flujo E2E 4: Gemelo Digital 3D, Inteligencia Logística (KPIs) y Módulo de Reportes Multiformato', async ({ page }) => {
    await setupE2EMockEnvironment(page);

    // 1. Inspeccionar Gemelo Digital 3D (Three.js WebGL Canvas)
    await navigateTo(page, 'Vista 3D');
    await expect(page.getByRole('heading', { name: 'Vista 3D' })).toBeVisible();
    await expect(page.locator('canvas')).toBeVisible();

    // 2. Centro de Mando Logístico (KPIs)
    await navigateTo(page, 'Centro de Mando');
    await expect(page.getByText('Centro de Mando — KPIs Logísticos')).toBeVisible();
    await expect(page.getByText('Ocupación Global')).toBeVisible();
    await expect(page.getByText('Días de Cobertura (DSI)')).toBeVisible();

    // 3. Análisis Pareto ABC
    await page.getByRole('button', { name: /Pareto ABC/i }).click();
    await expect(page.getByText(/Clasificación Pareto ABC/i)).toBeVisible();
    await expect(page.getByText('Arroz Diana Especial 1kg')).toBeVisible();

    // 4. Detección de Inventario Inactivo (Stock Muerto)
    await page.getByRole('button', { name: /Stock Muerto/i }).click();
    await expect(page.getByText(/Inventario Inactivo/i)).toBeVisible();

    // 5. Throughput de Entradas vs Salidas
    await page.getByRole('button', { name: /Throughput/i }).click();
    await expect(page.getByText(/Total Entradas 7d/i)).toBeVisible();

    // 6. Centro de Reportes y Operaciones Masivas
    await navigateTo(page, 'Reportes');
    await expect(page.getByText('Centro de Reportes & Operaciones Masivas')).toBeVisible();
    await expect(page.getByRole('button', { name: /Reportes Multiformato/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Carga Masiva/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Envíos Programados/i })).toBeVisible();
  });

  test('Flujo E2E 5: Gobernanza y Administración: Gestión de Equipo, Matriz RBAC, Seguridad 2FA, Bitácora y Mesa de Ayuda', async ({ page }) => {
    await setupE2EMockEnvironment(page);

    // 1. Gestión de Equipo y Roles de Usuario
    await navigateTo(page, 'Equipo');
    await expect(page.getByText('Gestión de Equipo y Accesos')).toBeVisible();
    await expect(page.getByText('Laura Restrepo')).toBeVisible();
    await expect(page.getByText('Carlos Mendoza')).toBeVisible();

    // 2. Registro de Nuevo Miembro de Equipo
    await page.getByRole('button', { name: '+ Nuevo Miembro' }).click();
    await expect(page.getByRole('heading', { name: 'Registrar Nuevo Miembro' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancelar' }).click();

    // 3. Auditoría y Configuración de Matriz RBAC de 24 Permisos
    await page.getByRole('button', { name: /Permisos/i }).first().click();
    await expect(page.getByText('Gestionar Permisos y Acceso')).toBeVisible();
    await expect(page.getByText('1. Permisos de Módulos y Visualización')).toBeVisible();
    await expect(page.getByText('2. Operaciones de Bodega y Movimientos')).toBeVisible();
    await expect(page.getByText('3. Configuración, Catálogo y Gestión')).toBeVisible();
    await expect(page.getByText('4. Importación, Exportación y Herramientas')).toBeVisible();
    await page.getByRole('button', { name: 'Cancelar' }).click();

    // 4. Seguridad de Acceso: Activación de Segundo Factor (2FA TOTP)
    await page.getByRole('button', { name: /2FA/i }).first().click();
    await expect(page.getByRole('heading', { name: 'Autenticación en Dos Pasos (2FA)' })).toBeVisible();
    await page.getByText('Ya escaneé el código → Continuar').click();
    await page.getByPlaceholder('000000').fill('654321');
    await page.getByRole('button', { name: /Confirmar y Activar 2FA/i }).click();
    await expect(page.getByText('¡2FA Activado Correctamente!')).toBeVisible();
    await expect(page.getByText('Códigos de recuperación de emergencia:')).toBeVisible();
    await page.getByRole('button', { name: /Entendido y Cerrar/i }).click();

    // 5. Bitácora Inmutable de Auditoría (Audit Log)
    await page.getByRole('button', { name: /Auditoría/i }).first().click();
    await expect(page.getByRole('heading', { name: 'Bitácora de Auditoría (Audit Log)' })).toBeVisible();
    await page.locator('.fixed').getByRole('button', { name: 'Cerrar', exact: true }).click();

    // 6. Mesa de Ayuda y Soporte Técnico con Telemetría Automática
    await page.getByRole('button', { name: /Soporte/i }).first().click();
    await expect(page.getByRole('heading', { name: 'Mesa de Ayuda y Soporte WMS' })).toBeVisible();
    await expect(page.getByText('Contexto técnico capturado automáticamente:')).toBeVisible();
    await page.getByPlaceholder(/Ej: Posición A-C-01-05/i).fill('Validación de pruebas E2E en ciclo completo');
    await page.getByPlaceholder(/Indica qué ocurrió/i).fill('Verificación de gobernanza y trazabilidad operativa integral.');
    await page.getByRole('button', { name: /Enviar Reporte/i }).click();
    await expect(page.getByRole('heading', { name: /Reporte Despachado y Registrado/i })).toBeVisible();
    await page.getByRole('button', { name: /Cerrar y Continuar/i }).click();
    await expect(page.getByRole('heading', { name: 'Mesa de Ayuda y Soporte WMS' })).not.toBeVisible();

    // 7. Términos Legales, SLA 99.5% y Cumplimiento RGPD
    await page.getByRole('button', { name: /Términos, SLA y Privacidad/i }).first().click();
    await expect(page.getByRole('heading', { name: 'Marco Legal, SLA y Privacidad' })).toBeVisible();
    await page.getByRole('button', { name: 'Entendido' }).click();
  });
});
