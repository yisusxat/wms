import { test, expect, Page } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

// ==================== MOCK DATA FOR EXHAUSTIVE COMPONENT TESTING ====================

const MOCK_JWT_PAYLOAD = {
  id: 'usr-admin-001',
  email: 'admin.operativo@wms.com',
  name: 'Administrador General',
  role: 'ADMIN',
  exp: Math.floor(Date.now() / 1000) + 86400 * 365,
};

const MOCK_TOKEN = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${Buffer.from(JSON.stringify(MOCK_JWT_PAYLOAD)).toString('base64url')}.mockSignature`;

const MOCK_PROFILE = {
  id: 'usr-admin-001',
  email: 'admin.operativo@wms.com',
  name: 'Administrador General',
  role: 'ADMIN',
  organizationId: 'org-wms-001',
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

const MOCK_SUMMARY = {
  products: 48,
  locations: 120,
  occupiedLocations: 78,
  availableLocations: 42,
  totalUnits: 15420,
  entriesToday: 12,
  issuesToday: 8,
};

const MOCK_LOCATIONS = [
  { id: 'loc-01', code: 'A-01-01', status: 'OCCUPIED', level: 1, position: 1, rack: { id: 'rk-a', code: 'A', levels: 4, positions: 6 } },
  { id: 'loc-02', code: 'A-01-02', status: 'AVAILABLE', level: 1, position: 2, rack: { id: 'rk-a', code: 'A', levels: 4, positions: 6 } },
  { id: 'loc-03', code: 'B-02-01', status: 'OCCUPIED', level: 2, position: 1, rack: { id: 'rk-b', code: 'B', levels: 4, positions: 6 } },
  { id: 'loc-04', code: 'C-01-01', status: 'BLOCKED', level: 1, position: 1, rack: { id: 'rk-c', code: 'C', levels: 4, positions: 6 } },
  { id: 'loc-05', code: 'D-03-02', status: 'AVAILABLE', level: 3, position: 2, rack: { id: 'rk-d', code: 'D', levels: 4, positions: 6 } },
];

const MOCK_PRODUCTS = [
  { id: 'prod-01', sku: 'ARR-DIA-001', name: 'Arroz Diana Especial 1kg', category: 'Granos', unit: 'kg', active: true, barcode: '7702001001234' },
  { id: 'prod-02', sku: 'ACE-PRE-002', name: 'Aceite Premier 1000ml', category: 'Aceites', unit: 'litro', active: true, barcode: '7702001005678' },
  { id: 'prod-03', sku: 'JUG-HIT-003', name: 'Jugo Hit Mora 500ml', category: 'Bebidas', unit: 'unidad', active: true, barcode: '7702001009012' },
  { id: 'prod-04', sku: 'LEC-ALQ-004', name: 'Leche Entera Alquería 1L', category: 'Lácteos', unit: 'litro', active: true, barcode: '7702001003456' },
];

const MOCK_INVENTORY = [
  { id: 'inv-01', quantity: 450, reservedQuantity: 20, product: MOCK_PRODUCTS[0], location: MOCK_LOCATIONS[0] },
  { id: 'inv-02', quantity: 280, reservedQuantity: 0, product: MOCK_PRODUCTS[1], location: MOCK_LOCATIONS[2] },
];

const MOCK_MOVEMENTS = [
  { id: 'mov-01', type: 'ENTRY', quantity: 200, createdAt: new Date().toISOString(), product: MOCK_PRODUCTS[0], destinationLocation: MOCK_LOCATIONS[0], reason: 'Ingreso Proveedor' },
  { id: 'mov-02', type: 'EXIT', quantity: 50, createdAt: new Date().toISOString(), product: MOCK_PRODUCTS[1], sourceLocation: MOCK_LOCATIONS[2], reason: 'Despacho Cliente' },
  { id: 'mov-03', type: 'TRANSFER', quantity: 30, createdAt: new Date().toISOString(), product: MOCK_PRODUCTS[0], sourceLocation: MOCK_LOCATIONS[0], destinationLocation: MOCK_LOCATIONS[1], reason: 'Reubicación' },
];

const MOCK_KPIS = {
  occupancy: {
    rate: 65,
    occupied: 78,
    total: 120,
    alert: false,
    byZone: [{ zoneCode: 'A', zoneName: 'Zona Alimentos', occupied: 30, total: 40, rate: 75 }],
  },
  abcClassification: {
    classA: { skuCount: 8, percentage: 80, items: [{ sku: 'ARR-DIA-001', name: 'Arroz Diana Especial 1kg', issues: 540 }] },
    classB: { skuCount: 15, percentage: 15, items: [{ sku: 'ACE-PRE-002', name: 'Aceite Premier 1000ml', issues: 120 }] },
    classC: { skuCount: 25, percentage: 5, items: [{ sku: 'JUG-HIT-003', name: 'Jugo Hit Mora 500ml', issues: 25 }] },
  },
  deadStock: { count: 3, items: [{ sku: 'OBS-OLD-999', name: 'Envase Descontinuado 5L', quantity: 15, daysSinceMovement: 95 }] },
  dsi: { value: 18, totalStock: 15420, avgDailyIssues: 856, alert: false },
  throughput: {
    trend: [
      { date: '2026-09-21', receipts: 120, issues: 90 },
      { date: '2026-09-22', receipts: 150, issues: 110 },
      { date: '2026-09-23', receipts: 180, issues: 140 },
      { date: '2026-09-24', receipts: 95, issues: 130 },
      { date: '2026-09-25', receipts: 210, issues: 170 },
      { date: '2026-09-26', receipts: 130, issues: 115 },
      { date: '2026-09-27', receipts: 160, issues: 125 },
    ],
    totalReceipts7d: 1045,
    totalIssues7d: 880,
    balance: 165,
  },
  ira: { percentage: 99.2, totalAdjustments: 2, totalStock: 15420, deviationRate: 0.8, alert: false },
  breakRisk: { count: 1, items: [{ sku: 'LEC-ALQ-004', name: 'Leche Entera Alquería 1L', quantity: 40, daysRemaining: 3 }] },
};

const MOCK_TEAM = [
  { id: 'usr-admin-001', name: 'Administrador General', email: 'admin.operativo@wms.com', role: 'ADMIN', active: true, createdAt: '2026-01-01' },
  { id: 'usr-sup-002', name: 'Laura Restrepo', email: 'laura.sup@wms.com', role: 'SUPERVISOR', active: true, createdAt: '2026-02-15' },
  { id: 'usr-op-003', name: 'Carlos Mendoza', email: 'carlos.op@wms.com', role: 'OPERATOR', active: true, createdAt: '2026-03-10' },
  { id: 'usr-view-004', name: 'Marta Visualizadora', email: 'marta.view@wms.com', role: 'VIEWER', active: false, createdAt: '2026-04-05' },
];

const MOCK_AUDIT_LOGS = [
  { id: 'log-01', action: 'MOVEMENT_ENTRY', entity: 'MOVEMENT', createdAt: new Date().toISOString(), user: { name: 'Carlos Mendoza', role: 'OPERATOR' }, details: { sku: 'ARR-DIA-001', qty: 200 }, ip: '192.168.1.100' },
  { id: 'log-02', action: 'USER_ROLE_CHANGE', entity: 'USER', createdAt: new Date(Date.now() - 3600000).toISOString(), user: { name: 'Administrador General', role: 'ADMIN' }, details: { targetUser: 'laura.sup@wms.com', newRole: 'SUPERVISOR' }, ip: '192.168.1.10' },
];

// Setup route interception helper for comprehensive API mocking
async function setupMockApiRoutes(page: Page) {
  page.on('pageerror', (err) => console.log('BROWSER PAGE ERROR:', err.message));
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

      if (!url.includes('/api') && !url.includes('/auth/me') && !url.includes('localhost:3001') && !url.includes('insforge.app')) {
        return route.continue();
      }

      if (url.includes('/dashboard/summary')) {
        return route.fulfill({ status: 200, headers: corsHeaders, contentType: 'application/json', body: JSON.stringify(MOCK_SUMMARY) });
      }
      if (url.includes('/auth/me') || url.includes('/users/me')) {
        return route.fulfill({ status: 200, headers: corsHeaders, contentType: 'application/json', body: JSON.stringify(MOCK_PROFILE) });
      }
      if (url.includes('user_profiles') || url.includes('/users')) {
        if (method === 'POST') {
          return route.fulfill({ status: 201, headers: corsHeaders, contentType: 'application/json', body: JSON.stringify({ id: 'usr-new', name: 'Nuevo Test', email: 'test@wms.com', role: 'OPERATOR', active: true }) });
        }
        if (url.includes('user_profiles')) {
          return route.fulfill({
            status: 200,
            headers: corsHeaders,
            contentType: 'application/json',
            body: JSON.stringify(MOCK_TEAM.map((u) => ({ id: u.id, name: u.name, role: u.role, active: u.active, permissions: null, created_at: u.createdAt }))),
          });
        }
        return route.fulfill({ status: 200, headers: corsHeaders, contentType: 'application/json', body: JSON.stringify(MOCK_TEAM) });
      }
      if (url.includes('/locations') || url.includes('records/locations')) {
        if (url.includes('records/locations')) {
          return route.fulfill({ status: 200, headers: corsHeaders, contentType: 'application/json', body: JSON.stringify(MOCK_LOCATIONS) });
        }
        return route.fulfill({ status: 200, headers: corsHeaders, contentType: 'application/json', body: JSON.stringify({ items: MOCK_LOCATIONS, total: MOCK_LOCATIONS.length, page: 1, pageSize: 50 }) });
      }
      if (url.includes('/products') || url.includes('records/products')) {
        if (method === 'POST') {
          return route.fulfill({ status: 201, headers: corsHeaders, contentType: 'application/json', body: JSON.stringify({ id: 'prod-new', sku: 'NEW-001', name: 'Nuevo Producto Test', unit: 'unidad', active: true }) });
        }
        if (url.includes('records/products')) {
          return route.fulfill({ status: 200, headers: corsHeaders, contentType: 'application/json', body: JSON.stringify(MOCK_PRODUCTS) });
        }
        return route.fulfill({ status: 200, headers: corsHeaders, contentType: 'application/json', body: JSON.stringify({ items: MOCK_PRODUCTS, total: MOCK_PRODUCTS.length, page: 1, pageSize: 50 }) });
      }
      if (url.includes('/inventory') || url.includes('records/inventory')) {
        if (url.includes('records/inventory')) {
          return route.fulfill({ status: 200, headers: corsHeaders, contentType: 'application/json', body: JSON.stringify(MOCK_INVENTORY) });
        }
        return route.fulfill({ status: 200, headers: corsHeaders, contentType: 'application/json', body: JSON.stringify({ items: MOCK_INVENTORY, total: MOCK_INVENTORY.length, page: 1, pageSize: 50 }) });
      }
      if (url.includes('/movements') || url.includes('records/movements')) {
        if (method === 'POST') {
          return route.fulfill({ status: 201, headers: corsHeaders, contentType: 'application/json', body: JSON.stringify({ id: 'mov-new', type: 'ENTRY', quantity: 10, createdAt: new Date().toISOString() }) });
        }
        if (url.includes('records/movements')) {
          return route.fulfill({ status: 200, headers: corsHeaders, contentType: 'application/json', body: JSON.stringify(MOCK_MOVEMENTS) });
        }
        return route.fulfill({ status: 200, headers: corsHeaders, contentType: 'application/json', body: JSON.stringify({ items: MOCK_MOVEMENTS, total: MOCK_MOVEMENTS.length, page: 1, pageSize: 50 }) });
      }
      if (url.includes('/labels/')) {
        return route.fulfill({
          status: 200,
          headers: corsHeaders,
          contentType: 'application/json',
          body: JSON.stringify({
            code: 'ARR-DIA-001',
            type: 'PRODUCT',
            barcode: '7702001001234',
            zpl: '^XA^FO50,50^ADN,36,20^FDARR-DIA-001^FS^XZ',
          }),
        });
      }
      if (url.includes('/dashboard/kpis')) {
        return route.fulfill({ status: 200, headers: corsHeaders, contentType: 'application/json', body: JSON.stringify(MOCK_KPIS) });
      }
      if (url.includes('/audit-logs')) {
        return route.fulfill({ status: 200, headers: corsHeaders, contentType: 'application/json', body: JSON.stringify(MOCK_AUDIT_LOGS) });
      }
      if (url.includes('/reports')) {
        return route.fulfill({ status: 200, headers: corsHeaders, contentType: 'application/json', body: JSON.stringify({ rows: [], totalCount: 0 }) });
      }

      return route.fulfill({ status: 200, headers: corsHeaders, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    } catch (err) {
      console.error('ROUTE HANDLER ERROR:', err);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    }
  });
}

// Inject authenticated session and ensure admin profile is loaded
async function loginAndNavigate(page: Page, targetTabLabel?: string) {
  await setupMockApiRoutes(page);
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

  if (targetTabLabel) {
    const nav = page.locator('nav');
    const tabButton = nav.getByRole('button', { name: new RegExp(targetTabLabel, 'i') });
    await tabButton.click();
  }
}

// ==================== TEST SUITES ====================

test.describe('1. Autenticación, Dashboard y Navegación Principal', () => {
  test('Renderizado de Login y formulario con opciones de recordar credenciales y restablecer clave', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Iniciar sesión' })).toBeVisible();
    await expect(page.getByPlaceholder('usuario@bodega.com')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Recordar contraseña' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Entrar al Sistema' })).toBeVisible();
    await expect(page.getByText('¿Olvidaste tu contraseña?')).toBeVisible();

    // Open ForgotPasswordModal from login
    await page.getByText('¿Olvidaste tu contraseña?').click();
    await expect(page.getByRole('heading', { name: 'Restablecer Contraseña' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancelar' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancelar' }).click();
  });

  test('Dashboard principal: Resumen de KPIs, tarjetas operativas y guía de puesta en marcha', async ({ page }) => {
    await loginAndNavigate(page);

    // Verify main header and profile email
    await expect(page.getByText('admin.operativo@wms.com')).toBeVisible();

    // Verify Dashboard Summary cards
    await expect(page.getByText('Productos', { exact: true })).toBeVisible();
    await expect(page.getByText('Ubicaciones', { exact: true })).toBeVisible();
    await expect(page.getByText('Stock total', { exact: true })).toBeVisible();
    await expect(page.getByText('Ocupadas', { exact: true })).toBeVisible();
    await expect(page.getByText('Disponibles', { exact: true })).toBeVisible();

    // Verify Onboarding Guide
    await expect(page.getByText('Bienvenido al Sistema WMS')).toBeVisible();
    await expect(page.getByText('Explorar Layout 2D/3D')).toBeVisible();
    await expect(page.getByText('Catálogo de Productos')).toBeVisible();
    await expect(page.getByText('Gestión de Equipo')).toBeVisible();

    // Test dismissing onboarding guide
    await page.getByRole('button', { name: '✕ Ocultar' }).click();
    await expect(page.getByText('Bienvenido al Sistema WMS')).not.toBeVisible();
  });
});

test.describe('2. Componentes de Vista de Bodega (2D y 3D)', () => {
  test('Warehouse2D: Plano esquemático, filtros de ubicación y acciones de entrada/salida', async ({ page }) => {
    await loginAndNavigate(page, 'Vista 2D');

    // Check Warehouse2D header & controls
    await expect(page.getByRole('heading', { name: 'Vista 2D' })).toBeVisible();
    await expect(page.getByText('Disponibles', { exact: true })).toBeVisible();
    await expect(page.getByText('Ocupadas', { exact: true })).toBeVisible();
    await expect(page.getByText('Bloqueadas', { exact: true })).toBeVisible();
    await expect(page.getByPlaceholder('Buscar por código (ej: A-C-01-05 o 12)...')).toBeVisible();

    // Verify quick action buttons
    await expect(page.getByRole('button', { name: /Entrada de Mercancía/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Salida de Producto/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Actualizar Plano/i })).toBeVisible();
  });

  test('Warehouse3D: Gemelo digital tridimensional interactivo', async ({ page }) => {
    await loginAndNavigate(page, 'Vista 3D');

    // Check Three.js container
    await expect(page.getByRole('heading', { name: 'Vista 3D' })).toBeVisible();
    await expect(page.locator('canvas')).toBeVisible();
    await expect(page.getByText('Disponibles', { exact: true })).toBeVisible();
    await expect(page.getByText('Ocupadas', { exact: true })).toBeVisible();
  });

  test('WarehouseMappingView & MappingModal: Auditoría física de casilleros', async ({ page }) => {
    await loginAndNavigate(page, 'Mapeo Almacén');

    await expect(page.getByRole('heading', { name: 'Mapeo y Conciliación Física de Almacén' })).toBeVisible();
    await expect(page.getByText('Total Posiciones')).toBeVisible();
    await expect(page.getByRole('button', { name: /Plano 2D Oficial/i })).toBeVisible();
  });
});

test.describe('3. Catálogo de SKUs e Importación/Exportación', () => {
  test('ProductsPanel: Tabla de productos, búsqueda y modal de nuevo SKU', async ({ page }) => {
    await loginAndNavigate(page, 'Productos');

    await expect(page.getByRole('heading', { name: 'Catálogo de Productos' })).toBeVisible();
    await expect(page.getByText('Arroz Diana Especial 1kg')).toBeVisible();
    await expect(page.getByText('ARR-DIA-001')).toBeVisible();

    // Open New Product Modal
    await page.getByRole('button', { name: /Nuevo Producto/i }).first().click();
    await expect(page.getByRole('heading', { name: 'Registrar Nuevo Producto' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  });

  test('ProductImportExportModal: Plantillas descargables y área de arrastrar archivo', async ({ page }) => {
    await loginAndNavigate(page, 'Productos');

    // Open Import Modal
    await page.getByRole('button', { name: /Importar/i }).first().click();
    await expect(page.getByRole('heading', { name: 'Importar Catálogo de Productos' })).toBeVisible();
    await expect(page.getByText('Plantilla Excel (.xlsx)')).toBeVisible();
    await expect(page.getByText('Plantilla CSV (.csv)')).toBeVisible();
    await expect(page.getByText('Plantilla JSON (.json)')).toBeVisible();

    await page.locator('.fixed').getByRole('button', { name: '✕' }).click();
  });

  test('LabelModal: Impresión y copia de código Zebra ZPL', async ({ page }) => {
    await loginAndNavigate(page, 'Movimientos');

    // Click label action
    const labelBtn = page.getByRole('button', { name: /Etiqueta Producto/i });
    await expect(labelBtn).toBeEnabled();
    await labelBtn.click();

    await expect(page.getByRole('heading', { name: 'Etiqueta Identificadora' })).toBeVisible();
    await expect(page.getByText('Copiar ZPL (Zebra)')).toBeVisible();
    await expect(page.getByRole('button', { name: '🖨️ Imprimir' })).toBeVisible();

    // Close label modal
    await page.locator('.fixed').getByRole('button', { name: '✕' }).click();
  });
});

test.describe('4. Operaciones, Movimientos de Stock y Picking', () => {
  test('MovementsPanel: Registro de entradas, salidas, traslados y kardex', async ({ page }) => {
    await loginAndNavigate(page, 'Movimientos');

    await expect(page.getByText('Historial Reciente de Movimientos')).toBeVisible();
    await expect(page.getByRole('button', { name: /Entrada/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Salida/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Transferencia/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Ajuste/i }).first()).toBeVisible();

    // Check movements table entries
    await expect(page.getByRole('cell', { name: 'ARR-DIA-001' }).first()).toBeVisible();
    await expect(page.getByRole('cell', { name: 'ENTRY' }).first()).toBeVisible();
  });

  test('Entry2DModal & Exit2DModal: Modales de asignación visual de ubicaciones', async ({ page }) => {
    await loginAndNavigate(page, 'Vista 2D');

    // Test opening Exit2DModal from 2D view
    await page.getByRole('button', { name: /Salida de Producto/i }).click();
    await expect(page.getByText('Salida y Despacho de Productos (Layout 2D)')).toBeVisible();
    await page.locator('.fixed').getByRole('button', { name: '✕' }).click();
  });
});

test.describe('5. Centro de Mando (KPIs) y Módulo de Reportes', () => {
  test('KPIPanel: Navegación por las 5 pestañas de inteligencia logística', async ({ page }) => {
    await loginAndNavigate(page, 'Centro de Mando');

    await expect(page.getByText('Centro de Mando — KPIs Logísticos')).toBeVisible();
    await expect(page.getByText('Ocupación Global')).toBeVisible();
    await expect(page.getByText('Días de Cobertura (DSI)')).toBeVisible();

    // Tab ABC
    await page.getByRole('button', { name: /Pareto ABC/i }).click();
    await expect(page.getByText(/Clasificación Pareto ABC/i)).toBeVisible();

    // Tab Dead Stock
    await page.getByRole('button', { name: /Stock Muerto/i }).click();
    await expect(page.getByText(/Inventario Inactivo/i)).toBeVisible();

    // Tab Throughput
    await page.getByRole('button', { name: /Throughput/i }).click();
    await expect(page.getByText(/Total Entradas 7d/i)).toBeVisible();

    // Tab Stockout Risk
    await page.getByRole('button', { name: /Riesgo Quiebre/i }).click();
    await expect(page.getByText(/quiebre/i).first()).toBeVisible();
  });

  test('ReportsPanel: Balance General, Kardex y descarga de reportes', async ({ page }) => {
    await loginAndNavigate(page, 'Reportes');

    await expect(page.getByText('Centro de Reportes & Operaciones Masivas')).toBeVisible();
    await expect(page.getByRole('button', { name: /Reportes Multiformato/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Carga Masiva/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Envíos Programados/i })).toBeVisible();
  });
});

test.describe('6. Gestión de Equipo y Permisos Granulares RBAC', () => {
  test('TeamPanel: Listado de usuarios, cambio de roles y modal de nuevo miembro', async ({ page }) => {
    await loginAndNavigate(page, 'Equipo');

    await expect(page.getByText('Gestión de Equipo y Accesos')).toBeVisible();
    await expect(page.getByText('Laura Restrepo')).toBeVisible();
    await expect(page.getByText('Carlos Mendoza')).toBeVisible();

    // Open New Member Modal
    await page.getByRole('button', { name: '+ Nuevo Miembro' }).click();
    await expect(page.getByRole('heading', { name: 'Registrar Nuevo Miembro' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancelar' }).click();
  });

  test('PermissionsModal: Configuración de 24 permisos y conmutadores de grupo', async ({ page }) => {
    await loginAndNavigate(page, 'Equipo');

    // Click on permissions of first member
    await page.getByRole('button', { name: /Permisos/i }).first().click();
    await expect(page.getByText('Gestionar Permisos y Acceso')).toBeVisible();
    await expect(page.getByText('1. Permisos de Módulos y Visualización')).toBeVisible();
    await expect(page.getByText('2. Operaciones de Bodega y Movimientos')).toBeVisible();
    await expect(page.getByText('3. Configuración, Catálogo y Gestión')).toBeVisible();
    await expect(page.getByText('4. Importación, Exportación y Herramientas')).toBeVisible();

    // Check global toggles
    await expect(page.getByRole('button', { name: '✓ Marcar Todos' })).toBeVisible();
    await expect(page.getByRole('button', { name: '✕ Desmarcar Todos' })).toBeVisible();

    // Close modal
    await page.getByRole('button', { name: 'Cancelar' }).click();
  });
});

test.describe('7. Modales de Soporte, Legal, Auditoría y Seguridad', () => {
  test('SupportModal: Diagnóstico del cliente y formulario de incidencia', async ({ page }) => {
    await loginAndNavigate(page);

    // Click on header help trigger
    await page.getByRole('button', { name: /Soporte/i }).first().click();
    await expect(page.getByRole('heading', { name: 'Mesa de Ayuda y Soporte WMS' })).toBeVisible();
    await expect(page.getByText('Contexto técnico capturado automáticamente')).toBeVisible();
    await page.getByRole('button', { name: 'Cancelar' }).click();
  });

  test('AuditLogsModal: Bitácora inmutable de eventos', async ({ page }) => {
    await loginAndNavigate(page);

    await page.getByRole('button', { name: /Auditoría/i }).first().click();
    await expect(page.getByRole('heading', { name: 'Bitácora de Auditoría (Audit Log)' })).toBeVisible();
    await expect(page.locator('.fixed').getByRole('button', { name: 'Cerrar', exact: true })).toBeVisible();
    await page.locator('.fixed').getByRole('button', { name: 'Cerrar', exact: true }).click();
  });

  test('LegalModal: Marco legal, SLA 99.5% y RGPD', async ({ page }) => {
    await loginAndNavigate(page);

    await page.getByRole('button', { name: /Términos, SLA y Privacidad/i }).first().click();
    await expect(page.getByRole('heading', { name: 'Marco Legal, SLA y Privacidad' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Términos de Servicio (ToS)' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Acuerdo de Nivel de Servicio (SLA)' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Privacidad & RGPD (Derecho al Olvido)' })).toBeVisible();
    await page.getByRole('button', { name: 'Entendido' }).click();
  });

  test('TwoFactorModal: Flujo de activación 2FA TOTP con códigos de respaldo', async ({ page }) => {
    await loginAndNavigate(page);

    await page.getByRole('button', { name: /2FA/i }).first().click();
    await expect(page.getByRole('heading', { name: 'Autenticación en Dos Pasos (2FA)' })).toBeVisible();
    await expect(page.getByText('Ya escaneé el código → Continuar')).toBeVisible();
    await page.locator('.fixed').getByRole('button', { name: '✕', exact: true }).click();
  });

  test('BarcodeScanner: Escáner universal con fallback y conmutación a modo manual', async ({ page }) => {
    await loginAndNavigate(page);

    await page.getByRole('button', { name: /Escanear/i }).first().click();
    await expect(page.getByText('Escáner de Código')).toBeVisible();
    await expect(page.getByRole('button', { name: '📷 Cámara' })).toBeVisible();
    await expect(page.getByRole('button', { name: '⌨️ Manual' })).toBeVisible();

    // Switch to manual mode
    await page.getByRole('button', { name: '⌨️ Manual' }).click();
    await expect(page.getByPlaceholder('Escribe o pega el código...')).toBeVisible();

    // Enter a code and submit
    await page.getByPlaceholder('Escribe o pega el código...').fill('SKU-TEST-999');
    await page.getByRole('button', { name: 'Confirmar código' }).click();

    // Scanner closes and routes appropriately
    await expect(page.getByText('Escáner de Código')).not.toBeVisible();
  });
});

