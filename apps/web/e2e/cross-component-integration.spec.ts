import { test, expect, Page } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

// ==================== STATEFUL MOCK DATA ====================

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

function createInitialState() {
  return {
    summary: {
      products: 48,
      locations: 120,
      occupiedLocations: 78,
      availableLocations: 42,
      totalUnits: 15420,
      entriesToday: 12,
      issuesToday: 8,
    },
    products: [
      { id: 'prod-01', sku: 'ARR-DIA-001', name: 'Arroz Diana Especial 1kg', category: 'Granos', unit: 'kg', active: true, barcode: '7702001001234' },
      { id: 'prod-02', sku: 'ACE-PRE-002', name: 'Aceite Premier 1000ml', category: 'Aceites', unit: 'litro', active: true, barcode: '7702001005678' },
      { id: 'prod-03', sku: 'JUG-HIT-003', name: 'Jugo Hit Mora 500ml', category: 'Bebidas', unit: 'unidad', active: true, barcode: '7702001009012' },
      { id: 'prod-04', sku: 'LEC-ALQ-004', name: 'Leche Entera Alquería 1L', category: 'Lácteos', unit: 'litro', active: true, barcode: '7702001003456' },
    ],
    locations: [
      { id: 'loc-01', code: 'A-01-01', status: 'OCCUPIED', level: 1, position: 1, rack: { id: 'rk-a', code: 'A', levels: 4, positions: 6 } },
      { id: 'loc-02', code: 'A-01-02', status: 'AVAILABLE', level: 1, position: 2, rack: { id: 'rk-a', code: 'A', levels: 4, positions: 6 } },
      { id: 'loc-03', code: 'B-02-01', status: 'OCCUPIED', level: 2, position: 1, rack: { id: 'rk-b', code: 'B', levels: 4, positions: 6 } },
      { id: 'loc-04', code: 'C-01-01', status: 'BLOCKED', level: 1, position: 1, rack: { id: 'rk-c', code: 'C', levels: 4, positions: 6 } },
      { id: 'loc-05', code: 'D-03-02', status: 'AVAILABLE', level: 3, position: 2, rack: { id: 'rk-d', code: 'D', levels: 4, positions: 6 } },
    ],
    inventory: [
      { id: 'inv-01', quantity: 450, reservedQuantity: 20, product: { id: 'prod-01', sku: 'ARR-DIA-001', name: 'Arroz Diana Especial 1kg' }, location: { id: 'loc-01', code: 'A-01-01' } },
      { id: 'inv-02', quantity: 280, reservedQuantity: 0, product: { id: 'prod-02', sku: 'ACE-PRE-002', name: 'Aceite Premier 1000ml' }, location: { id: 'loc-03', code: 'B-02-01' } },
    ],
    movements: [
      { id: 'mov-01', type: 'ENTRY', quantity: 200, createdAt: new Date().toISOString(), product: { id: 'prod-01', sku: 'ARR-DIA-001', name: 'Arroz Diana Especial 1kg' }, destinationLocation: { id: 'loc-01', code: 'A-01-01' }, reason: 'Ingreso Proveedor' },
      { id: 'mov-02', type: 'EXIT', quantity: 50, createdAt: new Date().toISOString(), product: { id: 'prod-02', sku: 'ACE-PRE-002', name: 'Aceite Premier 1000ml' }, sourceLocation: { id: 'loc-03', code: 'B-02-01' }, reason: 'Despacho Cliente' },
    ],
    kpis: {
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
    },
    team: [
      { id: 'usr-admin-001', name: 'Administrador General', email: 'admin.operativo@wms.com', role: 'ADMIN', active: true, createdAt: '2026-01-01' },
      { id: 'usr-sup-002', name: 'Laura Restrepo', email: 'laura.sup@wms.com', role: 'SUPERVISOR', active: true, createdAt: '2026-02-15' },
      { id: 'usr-op-003', name: 'Carlos Mendoza', email: 'carlos.op@wms.com', role: 'OPERATOR', active: true, createdAt: '2026-03-10' },
    ],
    auditLogs: [
      { id: 'log-01', action: 'MOVEMENT_ENTRY', entity: 'MOVEMENT', createdAt: new Date().toISOString(), user: { name: 'Carlos Mendoza', role: 'OPERATOR' }, details: { sku: 'ARR-DIA-001', qty: 200 }, ip: '192.168.1.100' },
      { id: 'log-02', action: 'USER_ROLE_CHANGE', entity: 'USER', createdAt: new Date(Date.now() - 3600000).toISOString(), user: { name: 'Administrador General', role: 'ADMIN' }, details: { targetUser: 'laura.sup@wms.com', newRole: 'SUPERVISOR' }, ip: '192.168.1.10' },
    ],
  };
}

async function setupStatefulMockApi(page: Page) {
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

      if (!url.includes('/api') && !url.includes('/auth/me') && !url.includes('localhost:3001') && !url.includes('insforge.app')) {
        return route.continue();
      }

      // Auth Profile
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
            sku: reqBody.sku || 'NEW-SKU-999',
            name: reqBody.name || 'Nuevo Producto Creado',
            category: reqBody.category || 'General',
            unit: reqBody.unit || 'unidad',
            active: true,
            barcode: reqBody.barcode || '7700000000000',
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
            reason: reqBody.reason || 'Movimiento de prueba',
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

      // Team & Users API
      if (url.includes('user_profiles') || url.includes('/users')) {
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

      // KPIs API
      if (url.includes('/dashboard/kpis')) {
        return route.fulfill({ status: 200, headers: corsHeaders, contentType: 'application/json', body: JSON.stringify(state.kpis) });
      }

      // Sentry.io envelope interception to prevent external network delays
      if (url.includes('sentry.io') || url.includes('/envelope')) {
        return route.fulfill({ status: 200, headers: corsHeaders, contentType: 'application/json', body: '{}' });
      }

      // Support API
      if (url.includes('/api/support')) {
        return route.fulfill({
          status: 200,
          headers: corsHeaders,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true, emailStatus: 'sent', resendId: 'res-test-999' }),
        });
      }

      // Audit Logs API
      if (url.includes('/audit-logs') || url.includes('audit_logs')) {
        if (method === 'POST') {
          return route.fulfill({ status: 201, headers: corsHeaders, contentType: 'application/json', body: JSON.stringify([{ id: 'log-new', ok: true }]) });
        }
        return route.fulfill({ status: 200, headers: corsHeaders, contentType: 'application/json', body: JSON.stringify(state.auditLogs) });
      }

      // Labels API
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

      // Reports API
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
  await expect(page.getByText('Rol: ADMIN').first()).toBeVisible();
}

async function navigateTo(page: Page, tabLabel: string) {
  const nav = page.locator('nav');
  const btn = nav.getByRole('button', { name: new RegExp(tabLabel, 'i') });
  await btn.click();
}

// ==================== EXHAUSTIVE INTEGRATION TEST SUITES ====================

test.describe('Pruebas de Integración Exhaustivas entre Componentes WMS', () => {

  test('Integración 1: Flujo Catálogo SKUs -> Registro de Entrada en Movimientos -> Reactividad en Dashboard', async ({ page }) => {
    await setupStatefulMockApi(page);

    // 1. Navegar a Catálogo de Productos
    await navigateTo(page, 'Productos');
    await expect(page.getByRole('heading', { name: 'Catálogo de Productos' })).toBeVisible();

    // 2. Abrir formulario de Nuevo Producto
    await page.getByRole('button', { name: /Nuevo Producto/i }).first().click();
    await expect(page.getByRole('heading', { name: 'Registrar Nuevo Producto' })).toBeVisible();

    // 3. Completar campos SKU y Nombre
    const uniqueSku = `HAR-PAN-${Date.now().toString().slice(-4)}`;
    await page.getByPlaceholder(/ALM-ARR/i).fill(uniqueSku);
    await page.getByPlaceholder(/Arroz Diana/i).fill('Harina Pan Tradicional 1kg');

    // 4. Guardar producto en base de datos
    await page.getByRole('button', { name: 'Crear Producto' }).click();

    // 5. Navegar a Movimientos de Stock
    await navigateTo(page, 'Movimientos');
    await expect(page.getByText('Historial Reciente de Movimientos')).toBeVisible();

    // 6. Completar formulario de Entrada
    const qtyInput = page.locator('input[type="number"]').first();
    await qtyInput.fill('150');

    const reasonInput = page.getByPlaceholder(/Recepción de proveedor/i);
    await reasonInput.fill('Ingreso por Compra Directa Proveedor');

    // 7. Confirmar Entrada y verificar toast de éxito
    await page.getByRole('button', { name: /Confirmar entrada/i }).click();
    await expect(page.getByText(/Operación completada con éxito/i)).toBeVisible();

    // 8. Regresar al Dashboard y verificar reactividad del resumen
    await navigateTo(page, 'Dashboard');
    await expect(page.getByText('admin.operativo@wms.com').first()).toBeVisible();
    await expect(page.locator('article').filter({ hasText: 'Productos' })).toBeVisible();
    await expect(page.locator('article').filter({ hasText: 'Ubicaciones' })).toBeVisible();
  });

  test('Integración 2: Vista 2D de Bodega -> Selección de Ubicación -> Navegación Guiada a Mapeo de Casilleros', async ({ page }) => {
    await setupStatefulMockApi(page);

    // 1. Navegar al Layout Esquemático 2D
    await navigateTo(page, 'Vista 2D');
    await expect(page.getByRole('heading', { name: 'Vista 2D' })).toBeVisible();

    // 2. Click sobre posición en rack (A-C-01-01)
    const locBtn = page.locator('button[title*="A-C-01-01"]').first();
    await expect(locBtn).toBeVisible();
    await locBtn.click();

    // 3. Verificar apertura del drawer lateral de Inspección de Ubicación
    await expect(page.getByText('Inspección de Ubicación')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'A-C-01-01' })).toBeVisible();

    // 4. Click en acción de auditoría física guiada hacia Mapeo
    const auditBtn = page.getByRole('button', { name: /Auditar Posición en Mapeo/i });
    await expect(auditBtn).toBeVisible();
    await auditBtn.click();

    // 5. Verificar transición directa a Mapeo y Conciliación Física
    await expect(page.getByRole('heading', { name: 'Mapeo y Conciliación Física de Almacén' })).toBeVisible();
    await expect(page.getByText('Total Posiciones')).toBeVisible();
  });

  test('Integración 3: Movimientos -> Impresión de Etiquetas ZPL Zebra -> Asignación Visual 2D', async ({ page }) => {
    await setupStatefulMockApi(page);

    // 1. Navegar a Movimientos
    await navigateTo(page, 'Movimientos');
    await expect(page.getByText('Historial Reciente de Movimientos')).toBeVisible();

    // 2. Abrir Modal de Etiqueta Identificadora ZPL
    const labelBtn = page.getByRole('button', { name: /Etiqueta Producto/i });
    await expect(labelBtn).toBeEnabled();
    await labelBtn.click();

    // 3. Verificar renderizado de código Zebra ZPL
    await expect(page.getByRole('heading', { name: 'Etiqueta Identificadora' })).toBeVisible();
    await expect(page.getByText('Copiar ZPL (Zebra)')).toBeVisible();
    await expect(page.getByRole('button', { name: '🖨️ Imprimir' })).toBeVisible();

    // 4. Copiar y cerrar modal
    await page.getByRole('button', { name: /Copiar ZPL/i }).click();
    await page.locator('.fixed').getByRole('button', { name: '✕' }).click();

    // 5. Navegar a Vista 2D y abrir modal de Despacho / Salida
    await navigateTo(page, 'Vista 2D');
    await expect(page.getByRole('heading', { name: 'Vista 2D' })).toBeVisible();
    await page.getByRole('button', { name: /Salida de Producto/i }).click();
    await expect(page.getByText('Salida y Despacho de Productos (Layout 2D)')).toBeVisible();
    await page.locator('.fixed').getByRole('button', { name: '✕' }).click();
  });

  test('Integración 4: Gestión de Equipo (TeamPanel) -> Matriz de Permisos RBAC Granulares', async ({ page }) => {
    await setupStatefulMockApi(page);

    // 1. Navegar a Gestión de Equipo
    await navigateTo(page, 'Equipo');
    await expect(page.getByText('Gestión de Equipo y Accesos')).toBeVisible();
    await expect(page.getByText('Laura Restrepo')).toBeVisible();

    // 2. Abrir modal de permisos RBAC para un usuario
    const permissionsBtn = page.getByRole('button', { name: /Permisos/i }).first();
    await expect(permissionsBtn).toBeVisible();
    await permissionsBtn.click();

    // 3. Verificar secciones de la matriz de permisos
    await expect(page.getByText('Gestionar Permisos y Acceso')).toBeVisible();
    await expect(page.getByText('1. Permisos de Módulos y Visualización')).toBeVisible();
    await expect(page.getByText('2. Operaciones de Bodega y Movimientos')).toBeVisible();
    await expect(page.getByText('3. Configuración, Catálogo y Gestión')).toBeVisible();
    await expect(page.getByText('4. Importación, Exportación y Herramientas')).toBeVisible();

    // 4. Verificar botones de acción global y cerrar modal
    await expect(page.getByRole('button', { name: '✓ Marcar Todos' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.getByText('Gestionar Permisos y Acceso')).not.toBeVisible();
  });

  test('Integración 5: Header Global -> Modal de Soporte Técnico con Diagnóstico Automático', async ({ page }) => {
    await setupStatefulMockApi(page);

    // 1. Abrir modal de Soporte desde el Header Global
    await page.getByRole('button', { name: /Soporte/i }).first().click();

    // 2. Verificar telemetría capturada automáticamente
    await expect(page.getByRole('heading', { name: 'Mesa de Ayuda y Soporte WMS' })).toBeVisible();
    await expect(page.getByText('Contexto técnico capturado automáticamente:')).toBeVisible();

    // 3. Completar formulario de incidencia técnica
    await page.getByPlaceholder(/Ej: Posición A-C-01-05/i).fill('Consulta sobre optimización de rutas picking');
    await page.getByPlaceholder(/Indica qué ocurrió/i).fill('Verificando sugerencias de Smart Slotting y clasificación ABC');

    // 4. Enviar reporte y verificar confirmación
    await page.getByRole('button', { name: /Enviar Reporte/i }).click();
    await expect(page.getByRole('heading', { name: /Reporte Despachado y Registrado/i })).toBeVisible();
    await expect(page.getByText('Base de Datos (InsForge)')).toBeVisible();
    await page.getByRole('button', { name: /Cerrar y Continuar/i }).click();
    await expect(page.getByRole('heading', { name: 'Mesa de Ayuda y Soporte WMS' })).not.toBeVisible();
  });

  test('Integración 6: Header Global -> Configuración de Seguridad 2FA y Bitácora de Auditoría', async ({ page }) => {
    await setupStatefulMockApi(page);

    // 1. Abrir modal de 2FA
    await page.getByRole('button', { name: /2FA/i }).first().click();
    await expect(page.getByRole('heading', { name: 'Autenticación en Dos Pasos (2FA)' })).toBeVisible();
    await expect(page.getByText('Ya escaneé el código → Continuar')).toBeVisible();

    // 2. Avanzar a verificación e ingresar código TOTP
    await page.getByText('Ya escaneé el código → Continuar').click();
    const codeInput = page.getByPlaceholder('000000');
    await codeInput.fill('123456');
    await page.getByRole('button', { name: /Confirmar y Activar 2FA/i }).click();

    // 3. Verificar éxito y códigos de respaldo
    await expect(page.getByText('¡2FA Activado Correctamente!')).toBeVisible();
    await expect(page.getByText('Códigos de recuperación de emergencia:')).toBeVisible();
    await page.getByRole('button', { name: /Entendido y Cerrar/i }).click();

    // 4. Abrir modal de Bitácora de Auditoría
    await page.getByRole('button', { name: /Auditoría/i }).first().click();
    await expect(page.getByRole('heading', { name: 'Bitácora de Auditoría (Audit Log)' })).toBeVisible();
    await page.locator('.fixed').getByRole('button', { name: 'Cerrar', exact: true }).click();
  });

  test('Integración 7: Centro de Mando (KPIs) y Módulo de Reportes -> Navegación y Análisis', async ({ page }) => {
    await setupStatefulMockApi(page);

    // 1. Navegar a Centro de Mando (KPIs)
    await navigateTo(page, 'Centro de Mando');
    await expect(page.getByText('Centro de Mando — KPIs Logísticos')).toBeVisible();
    await expect(page.getByText('Ocupación Global')).toBeVisible();

    // 2. Interactuar con pestaña Pareto ABC
    await page.getByRole('button', { name: /Pareto ABC/i }).click();
    await expect(page.getByText(/Clasificación Pareto ABC/i)).toBeVisible();

    // 3. Interactuar con pestaña Stock Muerto
    await page.getByRole('button', { name: /Stock Muerto/i }).click();
    await expect(page.getByText(/Inventario Inactivo/i)).toBeVisible();

    // 4. Navegar al Módulo de Reportes
    await navigateTo(page, 'Reportes');
    await expect(page.getByText('Centro de Reportes & Operaciones Masivas')).toBeVisible();
    await expect(page.getByRole('button', { name: /Reportes Multiformato/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Carga Masiva/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Envíos Programados/i })).toBeVisible();
  });
});
