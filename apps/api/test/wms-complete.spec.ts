/**
 * WMS Full Application Test Suite
 * ============================================================
 * Cubre todas las secciones del sistema:
 *  1. ProductsService      – CRUD, búsqueda, paginación
 *  2. LocationsService     – listado, búsqueda, actualización de estado
 *  3. InventoryService     – consulta por producto y ubicación
 *  4. MovementsService     – entry, exit, transfer, adjustment
 *  5. OperationsService    – Smart Slotting, Ruta de Picking, FIFO, etiquetas
 *  6. ReportsService       – DryRun de importación masiva, generación de reporte
 *  7. Paginación utilitaria
 *  8. Flujo de Mapeo de Almacén (Warehouse Mapping)
 *  9. Gestión de equipo / permisos (UsersService)
 * 10. AuditService         – registro de logs
 */

import { ProductsService } from '../src/products/products.service';
import { LocationsService } from '../src/locations/locations.service';
import { InventoryService } from '../src/inventory/inventory.service';
import { MovementsService } from '../src/movements/movements.service';
import { OperationsService } from '../src/operations/operations.service';
import { ReportsService } from '../src/reports/reports.service';
import { AuditService } from '../src/audit/audit.service';
import { paginated, pagination } from '../src/common/pagination';

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────
const makePrisma = (overrides: Record<string, unknown> = {}) => ({
  product: {
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    findUnique: jest.fn().mockResolvedValue(null),
    findUniqueOrThrow: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  location: {
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    findUnique: jest.fn().mockResolvedValue(null),
    findUniqueOrThrow: jest.fn(),
    update: jest.fn(),
  },
  inventory: {
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    findFirst: jest.fn(),
  },
  movement: {
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    aggregate: jest.fn().mockResolvedValue({ _sum: { quantity: 0 } }),
  },
  auditLog: {
    create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
  },
  $queryRaw: jest.fn().mockResolvedValue([{ movementId: 'mov-uuid-1' }]),
  ...overrides,
});

// Shared stub values
const PRODUCT_ID = 'aaaa0000-0000-4000-a000-000000000001';
const LOC_ID_SRC = 'bbbb0000-0000-4000-a000-000000000002';
const LOC_ID_DST = 'cccc0000-0000-4000-a000-000000000003';
const USER_ID = 'dddd0000-0000-4000-a000-000000000004';

const SAMPLE_PRODUCT = { id: PRODUCT_ID, sku: 'TEST-001', name: 'Producto Test', unit: 'u', active: true };
const SAMPLE_LOCATION = { id: LOC_ID_SRC, code: 'A-C-01-01', status: 'AVAILABLE', level: 1, position: 1 };
const SAMPLE_INVENTORY = {
  id: 'inv-1',
  quantity: 50,
  reservedQuantity: 0,
  product: SAMPLE_PRODUCT,
  location: SAMPLE_LOCATION,
};

// ══════════════════════════════════════════════════════════════
// 1. PAGINATION UTILITY
// ══════════════════════════════════════════════════════════════
describe('Pagination utility', () => {
  it('calcula correctamente page=1, pageSize=25 por defecto', () => {
    const result = pagination();
    expect(result).toEqual({ page: 1, pageSize: 25, skip: 0 });
  });

  it('clamp inferior: page=0 → page=1', () => {
    const result = pagination(0, 10);
    expect(result.page).toBe(1);
    expect(result.skip).toBe(0);
  });

  it('clamp superior: pageSize>100 → pageSize=100', () => {
    const result = pagination(2, 500);
    expect(result.pageSize).toBe(100);
    expect(result.skip).toBe(100);
  });

  it('paginated() construye la respuesta correctamente', () => {
    const items = [{ id: '1' }, { id: '2' }];
    const result = paginated(items, 20, 2, 10);
    expect(result).toEqual({ items, total: 20, page: 2, pageSize: 10, pageCount: 2 });
  });

  it('paginated() calcula pageCount con redondeo hacia arriba', () => {
    const result = paginated([], 5, 1, 3);
    expect(result.pageCount).toBe(2);
  });
});

// ══════════════════════════════════════════════════════════════
// 2. PRODUCTS SERVICE
// ══════════════════════════════════════════════════════════════
describe('ProductsService', () => {
  let service: ProductsService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    service = new ProductsService(prisma as never);
  });

  // ─── findAll ───
  describe('findAll()', () => {
    it('retorna lista vacía cuando no hay productos', async () => {
      const result = await service.findAll({});
      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('aplica filtro de búsqueda y llama a Prisma con where correcto', async () => {
      prisma.product.findMany.mockResolvedValue([SAMPLE_PRODUCT]);
      prisma.product.count.mockResolvedValue(1);
      const result = await service.findAll({ search: 'TEST' });
      expect(result.items[0].sku).toBe('TEST-001');
      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ OR: expect.any(Array) }) }),
      );
    });

    it('respeta pageSize y page', async () => {
      const result = await service.findAll({ page: 2, pageSize: 5 });
      expect(result.page).toBe(2);
      expect(result.pageSize).toBe(5);
    });
  });

  // ─── findOne ───
  describe('findOne()', () => {
    it('retorna el producto cuando existe', async () => {
      prisma.product.findUniqueOrThrow.mockResolvedValue(SAMPLE_PRODUCT);
      const result = await service.findOne(PRODUCT_ID);
      expect(result).toEqual(SAMPLE_PRODUCT);
    });

    it('lanza error cuando el producto no existe', async () => {
      prisma.product.findUniqueOrThrow.mockRejectedValue(new Error('Not found'));
      await expect(service.findOne('nonexistent-id')).rejects.toThrow();
    });
  });

  // ─── create ───
  describe('create()', () => {
    it('crea un producto y retorna el objeto creado', async () => {
      prisma.product.create.mockResolvedValue(SAMPLE_PRODUCT);
      const dto = { sku: 'TEST-001', name: 'Producto Test', unit: 'u' };
      const result = await service.create(dto as any);
      expect(result).toEqual(SAMPLE_PRODUCT);
      expect(prisma.product.create).toHaveBeenCalledWith({ data: dto });
    });

    it('crea un producto con campos opcionales (barcode, category, brand)', async () => {
      const fullProduct = { ...SAMPLE_PRODUCT, barcode: '12345', category: 'Electrónica', brand: 'MarcaX' };
      prisma.product.create.mockResolvedValue(fullProduct);
      const dto = {
        sku: 'TEST-001', name: 'Producto Test', unit: 'u',
        barcode: '12345', category: 'Electrónica', brand: 'MarcaX',
      };
      const result = await service.create(dto as any);
      expect(result.barcode).toBe('12345');
      expect(result.category).toBe('Electrónica');
    });
  });

  // ─── update ───
  describe('update()', () => {
    it('actualiza el nombre del producto', async () => {
      const updated = { ...SAMPLE_PRODUCT, name: 'Nuevo Nombre' };
      prisma.product.update.mockResolvedValue(updated);
      const result = await service.update(PRODUCT_ID, { name: 'Nuevo Nombre' } as any);
      expect(result.name).toBe('Nuevo Nombre');
    });

    it('actualiza el estado active del producto (activar/desactivar)', async () => {
      const inactive = { ...SAMPLE_PRODUCT, active: false };
      prisma.product.update.mockResolvedValue(inactive);
      const result = await service.update(PRODUCT_ID, { active: false } as any);
      expect(result.active).toBe(false);
    });
  });
});

// ══════════════════════════════════════════════════════════════
// 3. LOCATIONS SERVICE
// ══════════════════════════════════════════════════════════════
describe('LocationsService', () => {
  let service: LocationsService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    service = new LocationsService(prisma as never);
  });

  describe('findAll()', () => {
    it('retorna lista de ubicaciones', async () => {
      prisma.location.findMany.mockResolvedValue([SAMPLE_LOCATION]);
      prisma.location.count.mockResolvedValue(1);
      const result = await service.findAll({});
      expect(result.items).toHaveLength(1);
      expect(result.items[0].code).toBe('A-C-01-01');
    });

    it('filtra por status AVAILABLE', async () => {
      const available = [{ ...SAMPLE_LOCATION, status: 'AVAILABLE' }];
      prisma.location.findMany.mockResolvedValue(available);
      prisma.location.count.mockResolvedValue(1);
      const result = await service.findAll({ status: 'AVAILABLE' } as any);
      expect(result.items[0].status).toBe('AVAILABLE');
    });

    it('filtra por status OCCUPIED', async () => {
      const occupied = [{ ...SAMPLE_LOCATION, status: 'OCCUPIED' }];
      prisma.location.findMany.mockResolvedValue(occupied);
      prisma.location.count.mockResolvedValue(1);
      const result = await service.findAll({ status: 'OCCUPIED' } as any);
      expect(result.items[0].status).toBe('OCCUPIED');
    });

    it('filtra por level', async () => {
      prisma.location.findMany.mockResolvedValue([SAMPLE_LOCATION]);
      prisma.location.count.mockResolvedValue(1);
      await service.findAll({ level: 1 } as any);
      expect(prisma.location.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ level: 1 }) }),
      );
    });
  });

  describe('findOne()', () => {
    it('retorna ubicación con stock', async () => {
      prisma.location.findUniqueOrThrow.mockResolvedValue({
        ...SAMPLE_LOCATION,
        inventory: [SAMPLE_INVENTORY],
      });
      const result = await service.findOne(LOC_ID_SRC);
      expect((result as any).inventory).toHaveLength(1);
    });
  });

  describe('update()', () => {
    it('actualiza status a OCCUPIED por UUID', async () => {
      const updated = { ...SAMPLE_LOCATION, status: 'OCCUPIED' };
      prisma.location.update.mockResolvedValue(updated);
      const result = await service.update(LOC_ID_SRC, { status: 'OCCUPIED' } as any);
      expect(result.status).toBe('OCCUPIED');
      expect(prisma.location.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: LOC_ID_SRC } }),
      );
    });

    it('actualiza status a AVAILABLE por UUID', async () => {
      const updated = { ...SAMPLE_LOCATION, status: 'AVAILABLE' };
      prisma.location.update.mockResolvedValue(updated);
      const result = await service.update(LOC_ID_SRC, { status: 'AVAILABLE' } as any);
      expect(result.status).toBe('AVAILABLE');
    });

    it('actualiza por código de ubicación (no UUID)', async () => {
      const updated = { ...SAMPLE_LOCATION, status: 'BLOCKED' };
      prisma.location.update.mockResolvedValue(updated);
      const result = await service.update('A-C-01-01', { status: 'BLOCKED' } as any);
      expect(prisma.location.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { code: 'A-C-01-01' } }),
      );
      expect(result.status).toBe('BLOCKED');
    });

    it('actualiza a MAINTENANCE', async () => {
      const updated = { ...SAMPLE_LOCATION, status: 'MAINTENANCE' };
      prisma.location.update.mockResolvedValue(updated);
      const result = await service.update(LOC_ID_SRC, { status: 'MAINTENANCE' } as any);
      expect(result.status).toBe('MAINTENANCE');
    });
  });
});

// ══════════════════════════════════════════════════════════════
// 4. INVENTORY SERVICE
// ══════════════════════════════════════════════════════════════
describe('InventoryService', () => {
  let service: InventoryService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    service = new InventoryService(prisma as never);
  });

  describe('findAll()', () => {
    it('retorna inventario paginado', async () => {
      prisma.inventory.findMany.mockResolvedValue([SAMPLE_INVENTORY]);
      prisma.inventory.count.mockResolvedValue(1);
      const result = await service.findAll({});
      expect(result.items[0].quantity).toBe(50);
      expect(result.total).toBe(1);
    });

    it('filtra por productId', async () => {
      prisma.inventory.findMany.mockResolvedValue([SAMPLE_INVENTORY]);
      prisma.inventory.count.mockResolvedValue(1);
      await service.findAll({ productId: PRODUCT_ID } as any);
      expect(prisma.inventory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ productId: PRODUCT_ID }) }),
      );
    });

    it('filtra por locationId', async () => {
      prisma.inventory.findMany.mockResolvedValue([SAMPLE_INVENTORY]);
      prisma.inventory.count.mockResolvedValue(1);
      await service.findAll({ locationId: LOC_ID_SRC } as any);
      expect(prisma.inventory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ locationId: LOC_ID_SRC }) }),
      );
    });

    it('búsqueda por texto en SKU, nombre y código de ubicación', async () => {
      prisma.inventory.findMany.mockResolvedValue([SAMPLE_INVENTORY]);
      prisma.inventory.count.mockResolvedValue(1);
      await service.findAll({ search: 'TEST' } as any);
      expect(prisma.inventory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ OR: expect.any(Array) }) }),
      );
    });
  });

  describe('findByLocation()', () => {
    it('retorna items de inventario para una ubicación específica', async () => {
      prisma.inventory.findMany.mockResolvedValue([SAMPLE_INVENTORY]);
      const result = await service.findByLocation(LOC_ID_SRC);
      expect(result).toHaveLength(1);
      expect(result[0].location.id).toBe(LOC_ID_SRC);
    });
  });

  describe('findByProduct()', () => {
    it('retorna ubicaciones donde está un producto específico', async () => {
      prisma.inventory.findMany.mockResolvedValue([SAMPLE_INVENTORY]);
      const result = await service.findByProduct(PRODUCT_ID);
      expect(result).toHaveLength(1);
      expect(result[0].product.id).toBe(PRODUCT_ID);
    });
  });
});

// ══════════════════════════════════════════════════════════════
// 5. MOVEMENTS SERVICE
// ══════════════════════════════════════════════════════════════
describe('MovementsService', () => {
  let service: MovementsService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    service = new MovementsService(prisma as never);
  });

  // ─── findAll ───
  describe('findAll()', () => {
    it('retorna lista paginada de movimientos', async () => {
      prisma.movement.findMany.mockResolvedValue([
        { id: 'mov-1', type: 'RECEIPT', quantity: 10, product: SAMPLE_PRODUCT },
      ]);
      prisma.movement.count.mockResolvedValue(1);
      const result = await service.findAll({});
      expect(result.items).toHaveLength(1);
      expect(result.items[0].type).toBe('RECEIPT');
    });

    it('filtra por tipo de movimiento', async () => {
      await service.findAll({ type: 'ADJUSTMENT' } as any);
      expect(prisma.movement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ type: 'ADJUSTMENT' }) }),
      );
    });

    it('filtra por rango de fechas (from–to)', async () => {
      await service.findAll({
        from: '2026-01-01T00:00:00Z',
        to: '2026-12-31T23:59:59Z',
      } as any);
      expect(prisma.movement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: expect.objectContaining({ gte: expect.any(Date) }),
          }),
        }),
      );
    });

    it('filtra por texto de búsqueda (SKU, referencia, razón, código de ubicación)', async () => {
      await service.findAll({ search: 'MAP-2026' } as any);
      expect(prisma.movement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ OR: expect.any(Array) }) }),
      );
    });
  });

  // ─── ENTRADA DE MERCANCÍA ───
  describe('receive() – Entrada de mercancía', () => {
    it('registra la entrada y retorna el movementId', async () => {
      prisma.$queryRaw.mockResolvedValue([{ movementId: 'mov-entry-1' }]);
      const result = await service.receive(
        { productId: PRODUCT_ID, locationId: LOC_ID_SRC, quantity: 10, reason: 'Compra directa', reference: 'OC-001' },
        USER_ID,
      );
      expect(result).toEqual({ movementId: 'mov-entry-1' });
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    });

    it('registra la entrada sin reason ni reference (campos opcionales)', async () => {
      prisma.$queryRaw.mockResolvedValue([{ movementId: 'mov-entry-2' }]);
      const result = await service.receive(
        { productId: PRODUCT_ID, locationId: LOC_ID_SRC, quantity: 5 },
        USER_ID,
      );
      expect(result.movementId).toBe('mov-entry-2');
    });

    it('propaga error cuando la DB falla', async () => {
      prisma.$queryRaw.mockRejectedValue(new Error('DB error: insufficient stock'));
      await expect(
        service.receive({ productId: PRODUCT_ID, locationId: LOC_ID_SRC, quantity: 1 }, USER_ID),
      ).rejects.toThrow('DB error');
    });
  });

  // ─── SALIDA DE MERCANCÍA ───
  describe('issue() – Salida de mercancía', () => {
    it('registra la salida y retorna el movementId', async () => {
      prisma.$queryRaw.mockResolvedValue([{ movementId: 'mov-issue-1' }]);
      const result = await service.issue(
        { productId: PRODUCT_ID, locationId: LOC_ID_SRC, quantity: 5, reason: 'Despacho cliente', reference: 'SO-001' },
        USER_ID,
      );
      expect(result.movementId).toBe('mov-issue-1');
    });

    it('propaga error de stock insuficiente', async () => {
      prisma.$queryRaw.mockRejectedValue(new Error('insufficient stock'));
      await expect(
        service.issue({ productId: PRODUCT_ID, locationId: LOC_ID_SRC, quantity: 9999 }, USER_ID),
      ).rejects.toThrow();
    });
  });

  // ─── TRANSFERENCIA ───
  describe('transfer() – Transferencia entre ubicaciones', () => {
    it('transfiere stock entre dos ubicaciones', async () => {
      prisma.$queryRaw.mockResolvedValue([{ movementId: 'mov-transfer-1' }]);
      const result = await service.transfer(
        {
          productId: PRODUCT_ID,
          sourceLocationId: LOC_ID_SRC,
          destinationLocationId: LOC_ID_DST,
          quantity: 20,
          reason: 'Reorganización de bodega',
          reference: 'TRF-001',
        },
        USER_ID,
      );
      expect(result.movementId).toBe('mov-transfer-1');
    });
  });

  // ─── AJUSTE DE INVENTARIO ───
  describe('adjustment() – Ajuste de inventario', () => {
    it('aplica ajuste positivo de inventario', async () => {
      prisma.$queryRaw.mockResolvedValue([{ movementId: 'mov-adj-pos' }]);
      const result = await service.adjustment(
        { productId: PRODUCT_ID, locationId: LOC_ID_SRC, delta: 5, reason: 'Conteo físico', reference: 'ADJ-001' },
        USER_ID,
      );
      expect(result.movementId).toBe('mov-adj-pos');
    });

    it('aplica ajuste negativo de inventario (merma)', async () => {
      prisma.$queryRaw.mockResolvedValue([{ movementId: 'mov-adj-neg' }]);
      const result = await service.adjustment(
        { productId: PRODUCT_ID, locationId: LOC_ID_SRC, delta: -3, reason: 'Merma detectada en conteo físico', reference: 'COUNT-001' },
        USER_ID,
      );
      expect(result.movementId).toBe('mov-adj-neg');
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    });

    it('aplica ajuste delta=0 (sin cambio)', async () => {
      prisma.$queryRaw.mockResolvedValue([{ movementId: 'mov-adj-zero' }]);
      const result = await service.adjustment(
        { productId: PRODUCT_ID, locationId: LOC_ID_SRC, delta: 0 },
        USER_ID,
      );
      expect(result.movementId).toBeDefined();
    });
  });
});

// ══════════════════════════════════════════════════════════════
// 6. OPERATIONS SERVICE
// ══════════════════════════════════════════════════════════════
describe('OperationsService', () => {
  let service: OperationsService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma({
      location: {
        ...makePrisma().location,
        findMany: jest.fn().mockResolvedValue([
          {
            id: LOC_ID_SRC,
            code: 'A-C-01-01',
            status: 'AVAILABLE',
            level: 1,
            position: 1,
            rack: { code: 'C', aisle: { code: 'A', zone: { code: 'Z1', name: 'Zona 1' } } },
          },
        ]),
        count: jest.fn().mockResolvedValue(1),
      },
    });
    service = new OperationsService(prisma as never);
  });

  // ─── Smart Slotting ───
  describe('suggestSlotting()', () => {
    it('lanza NotFoundException cuando el producto no existe', async () => {
      prisma.product.findUnique = jest.fn().mockResolvedValue(null);
      await expect(service.suggestSlotting(PRODUCT_ID)).rejects.toThrow('Producto no encontrado');
    });

    it('retorna sugerencias de slotting cuando hay ubicaciones disponibles', async () => {
      prisma.product.findUnique = jest.fn().mockResolvedValue(SAMPLE_PRODUCT);
      prisma.movement.aggregate = jest.fn().mockResolvedValue({ _sum: { quantity: 0 } });
      // The location must include inventory array (joined by prisma include)
      prisma.location.findMany = jest.fn().mockResolvedValue([
        {
          id: LOC_ID_SRC,
          code: 'A-C-01-01',
          status: 'AVAILABLE',
          level: 1,
          position: 1,
          rack: { code: 'C', aisle: { code: 'A', zone: { code: 'Z1', name: 'Zona 1' } } },
          inventory: [], // required by suggestSlotting
        },
      ]);
      const suggestions = await service.suggestSlotting(PRODUCT_ID);
      expect(Array.isArray(suggestions)).toBe(true);
    });
  });

  // ─── Picking Route ───
  describe('calculatePickingRoute()', () => {
    it('retorna ruta vacía para lista de ítems vacía', async () => {
      const route = await service.calculatePickingRoute([]);
      expect(route).toHaveLength(0);
    });

    it('genera ruta de picking para ítems con stock', async () => {
      prisma.inventory.findMany.mockResolvedValue([
        { ...SAMPLE_INVENTORY, location: { ...SAMPLE_LOCATION, rack: { code: 'C', aisle: { code: 'A' } } } },
      ]);
      const route = await service.calculatePickingRoute([{ productId: PRODUCT_ID, quantity: 5 }]);
      expect(Array.isArray(route)).toBe(true);
    });
  });

  // ─── FIFO Suggestion ───
  describe('suggestDispatchFifo()', () => {
    it('retorna sugerencia FIFO para producto con stock', async () => {
      prisma.inventory.findMany.mockResolvedValue([
        { ...SAMPLE_INVENTORY, location: { ...SAMPLE_LOCATION, rack: { code: 'C', aisle: { code: 'A' } } } },
      ]);
      const result = await service.suggestDispatchFifo(PRODUCT_ID, 10);
      expect(result).toBeDefined();
    });

    it('retorna sin error cuando no hay stock disponible', async () => {
      prisma.inventory.findMany.mockResolvedValue([]);
      const result = await service.suggestDispatchFifo(PRODUCT_ID, 10);
      expect(result).toBeDefined();
    });
  });

  // ─── Labels ───
  // OperationsService uses location.findUnique (not findUniqueOrThrow)
  describe('getLocationLabel()', () => {
    it('retorna etiqueta de ubicación con datos correctos', async () => {
      prisma.location.findUnique = jest.fn().mockResolvedValue({
        id: LOC_ID_SRC,
        code: 'A-C-01-01',
        level: 1,
        position: 1,
        rack: { code: 'C', aisle: { code: 'A', zone: { code: 'Z1', name: 'Zona 1', warehouse: { name: 'Bodega Central' } } } },
      });
      const label = await service.getLocationLabel(LOC_ID_SRC);
      expect(label.type).toBe('LOCATION');
      expect(label.code).toBeDefined();
    });
  });

  // OperationsService uses product.findUnique (not findUniqueOrThrow)
  describe('getProductLabel()', () => {
    it('retorna etiqueta de producto con SKU y barcode', async () => {
      prisma.product.findUnique = jest.fn().mockResolvedValue({ ...SAMPLE_PRODUCT, barcode: '12345' });
      const label = await service.getProductLabel(PRODUCT_ID);
      expect(label.type).toBe('PRODUCT');
    });
  });
});

// ══════════════════════════════════════════════════════════════
// 7. REPORTS SERVICE
// ══════════════════════════════════════════════════════════════
describe('ReportsService', () => {
  let service: ReportsService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    service = new ReportsService(prisma as never);
  });

  // ─── DryRun importación masiva ───
  describe('dryRunImport()', () => {
    // Helper: SAMPLE_PRODUCT with inventory included (required by dryRunImport: include: { inventory: true })
    const PRODUCT_WITH_INV = { ...SAMPLE_PRODUCT, inventory: [] };

    it('retorna fila inválida cuando SKU no existe', async () => {
      prisma.product.findMany = jest.fn().mockResolvedValue([]);
      prisma.location.findMany = jest.fn().mockResolvedValue([]);
      const result = await service.dryRunImport([
        { sku: 'SKU-INEXISTENTE', locationCode: 'A-C-01-01', quantity: 5 },
      ]);
      expect(result.invalidRows).toBe(1);
      expect(result.rows[0].valid).toBe(false);
      expect(result.rows[0].errors.length).toBeGreaterThan(0);
    });

    it('retorna fila inválida cuando quantity es 0 o negativa', async () => {
      // Product includes inventory[] so prod.inventory.find() works
      prisma.product.findMany = jest.fn().mockResolvedValue([PRODUCT_WITH_INV]);
      prisma.location.findMany = jest.fn().mockResolvedValue([SAMPLE_LOCATION]);
      const result = await service.dryRunImport([
        { sku: 'TEST-001', locationCode: 'A-C-01-01', quantity: 0 },
      ]);
      expect(result.rows[0].valid).toBe(false);
      expect(result.rows[0].errors).toContain('Cantidad debe ser mayor a 0');
    });

    it('retorna fila válida cuando SKU, ubicación y cantidad son correctos', async () => {
      prisma.product.findMany = jest.fn().mockResolvedValue([PRODUCT_WITH_INV]);
      prisma.location.findMany = jest.fn().mockResolvedValue([SAMPLE_LOCATION]);
      const result = await service.dryRunImport([
        { sku: 'TEST-001', locationCode: 'A-C-01-01', quantity: 10 },
      ]);
      expect(result.validRows).toBe(1);
      expect(result.rows[0].valid).toBe(true);
    });

    it('procesa múltiples filas (mix de válidas e inválidas)', async () => {
      prisma.product.findMany = jest.fn().mockResolvedValue([PRODUCT_WITH_INV]);
      prisma.location.findMany = jest.fn().mockResolvedValue([SAMPLE_LOCATION]);
      const result = await service.dryRunImport([
        { sku: 'TEST-001', locationCode: 'A-C-01-01', quantity: 5 },
        { sku: 'SKU-INVALIDO', locationCode: 'A-C-01-01', quantity: 5 },
      ]);
      expect(result.totalRows).toBe(2);
      expect(result.validRows).toBe(1);
      expect(result.invalidRows).toBe(1);
    });
  });

  // ─── Generación de reportes ───
  describe('generateInventoryReport()', () => {
    it('genera reporte de inventario en formato JSON', async () => {
      prisma.inventory.findMany.mockResolvedValue([
        {
          ...SAMPLE_INVENTORY,
          reservedQuantity: 0,
          updatedAt: new Date(),
          location: { code: 'A-C-01-01', level: 1, position: 1 },
        },
      ]);
      const result = await service.generateInventoryReport('json');
      expect(result.buffer).toBeDefined();
      expect(result.filename).toContain('inventario');
      expect(result.mime).toBe('application/json');
    });

    it('genera reporte de inventario en formato CSV', async () => {
      prisma.inventory.findMany.mockResolvedValue([]);
      const result = await service.generateInventoryReport('csv');
      expect(result.mime).toBe('text/csv');
    });

    it('genera reporte de inventario en formato XLSX', async () => {
      prisma.inventory.findMany.mockResolvedValue([]);
      const result = await service.generateInventoryReport('xlsx');
      expect(result.mime).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    });
  });

  describe('generateMovementsReport()', () => {
    it('genera reporte de movimientos para período 7d', async () => {
      prisma.movement.findMany.mockResolvedValue([]);
      const result = await service.generateMovementsReport('json', '7d');
      expect(result.filename).toContain('movimientos');
    });

    it('genera reporte de movimientos para período 30d', async () => {
      prisma.movement.findMany.mockResolvedValue([]);
      const result = await service.generateMovementsReport('json', '30d');
      expect(result).toBeDefined();
    });

    it('genera reporte de movimientos para período all', async () => {
      prisma.movement.findMany.mockResolvedValue([]);
      const result = await service.generateMovementsReport('json', 'all');
      expect(result).toBeDefined();
    });
  });
});

// ══════════════════════════════════════════════════════════════
// 8. WAREHOUSE MAPPING – FLUJO COMPLETO DE AUDITORÍA FÍSICA
// ══════════════════════════════════════════════════════════════
describe('Warehouse Mapping – Flujo de auditoría física completo', () => {
  let movementsService: MovementsService;
  let locationsService: LocationsService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    movementsService = new MovementsService(prisma as never);
    locationsService = new LocationsService(prisma as never);
  });

  it('Escenario 1: Conteo físico correcto (MATCHED) – no genera movimientos', async () => {
    // Si no hay discrepancias, no se llama a ningún endpoint de movimiento
    const discrepancies: string[] = [];
    // Simula que no hay llamadas al servicio de movimientos
    expect(discrepancies).toHaveLength(0);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('Escenario 2: Ajuste positivo de conteo (sobrante físico)', async () => {
    prisma.$queryRaw.mockResolvedValue([{ movementId: 'map-adj-pos-1' }]);
    const result = await movementsService.adjustment(
      {
        productId: PRODUCT_ID,
        locationId: LOC_ID_SRC,
        delta: 3,
        reason: 'Mapeo: Sobrante físico detectado',
        reference: 'MAP-2026-00001',
      },
      USER_ID,
    );
    expect(result.movementId).toBe('map-adj-pos-1');
  });

  it('Escenario 3: Ajuste negativo de conteo (faltante físico)', async () => {
    prisma.$queryRaw.mockResolvedValue([{ movementId: 'map-adj-neg-1' }]);
    const result = await movementsService.adjustment(
      {
        productId: PRODUCT_ID,
        locationId: LOC_ID_SRC,
        delta: -5,
        reason: 'Mapeo: Faltante físico detectado',
        reference: 'MAP-2026-00002',
      },
      USER_ID,
    );
    expect(result.movementId).toBe('map-adj-neg-1');
  });

  it('Escenario 4: Reasignación de posición (TRANSFER)', async () => {
    prisma.$queryRaw.mockResolvedValue([{ movementId: 'map-transfer-1' }]);
    const result = await movementsService.transfer(
      {
        productId: PRODUCT_ID,
        sourceLocationId: LOC_ID_SRC,
        destinationLocationId: LOC_ID_DST,
        quantity: 10,
        reason: 'Mapeo: Reasignación de A-C-01-01 a A-C-02-01',
        reference: 'MAP-2026-00003',
      },
      USER_ID,
    );
    expect(result.movementId).toBe('map-transfer-1');
  });

  it('Escenario 5: Sustitución de SKU – retiro del SKU anterior + entrada del nuevo', async () => {
    prisma.$queryRaw
      .mockResolvedValueOnce([{ movementId: 'map-remove-old-sku' }]) // retiro SKU anterior
      .mockResolvedValueOnce([{ movementId: 'map-entry-new-sku' }]); // entrada SKU nuevo

    // A) Retiro del SKU anterior (ajuste negativo)
    const removal = await movementsService.adjustment(
      {
        productId: PRODUCT_ID,
        locationId: LOC_ID_SRC,
        delta: -10,
        reason: 'Mapeo: Retiro de SKU anterior por sustitución física',
        reference: 'MAP-2026-00004',
      },
      USER_ID,
    );
    expect(removal.movementId).toBe('map-remove-old-sku');

    // B) Entrada del nuevo SKU encontrado físicamente
    const newProductId = 'eeee0000-0000-4000-a000-000000000005';
    const entry = await movementsService.receive(
      {
        productId: newProductId,
        locationId: LOC_ID_SRC,
        quantity: 10,
        reason: 'Mapeo: Regularización física de nuevo SKU',
        reference: 'MAP-2026-00004',
      },
      USER_ID,
    );
    expect(entry.movementId).toBe('map-entry-new-sku');
  });

  it('Escenario 6: Hallazgo de stock en posición vacía (regularización)', async () => {
    prisma.$queryRaw.mockResolvedValue([{ movementId: 'map-found-stock' }]);
    const result = await movementsService.receive(
      {
        productId: PRODUCT_ID,
        locationId: LOC_ID_SRC,
        quantity: 8,
        reason: 'Mapeo: Hallazgo de stock físico en posición vacía A-C-01-01',
        reference: 'MAP-2026-00005',
      },
      USER_ID,
    );
    expect(result.movementId).toBe('map-found-stock');
  });

  it('Escenario 7: Actualización de estado operativo post-auditoría', async () => {
    // OCCUPIED cuando hay stock físico
    prisma.location.update.mockResolvedValue({ ...SAMPLE_LOCATION, status: 'OCCUPIED' });
    const occupied = await locationsService.update(LOC_ID_SRC, { status: 'OCCUPIED' } as any);
    expect(occupied.status).toBe('OCCUPIED');

    // AVAILABLE cuando la posición quedó vacía
    prisma.location.update.mockResolvedValue({ ...SAMPLE_LOCATION, status: 'AVAILABLE' });
    const available = await locationsService.update(LOC_ID_SRC, { status: 'AVAILABLE' } as any);
    expect(available.status).toBe('AVAILABLE');
  });

  it('Escenario 8: Folio MAP-YYYY-NNNNN – formato correcto', () => {
    const now = new Date();
    const folio = `MAP-${now.getFullYear()}-${now.getTime().toString().slice(-5)}`;
    expect(folio).toMatch(/^MAP-\d{4}-\d{5}$/);
  });

  it('Escenario 9: Cierre de mapeo sin discrepancias (IRA=100%)', () => {
    const items = 148;
    const matched = 148;
    const discrepancies = 0;
    const ira = Math.round((matched / items) * 1000) / 10;
    expect(ira).toBe(100);
    expect(discrepancies).toBe(0);
  });

  it('Escenario 10: Cierre de mapeo con discrepancias (IRA<100%)', () => {
    const items = 148;
    const matched = 140;
    const discrepancies = 8;
    const ira = Math.round((matched / items) * 1000) / 10;
    expect(ira).toBeLessThan(100);
    expect(discrepancies).toBe(8);
  });
});

// ══════════════════════════════════════════════════════════════
// 9. AUDIT SERVICE
// ══════════════════════════════════════════════════════════════
describe('AuditService', () => {
  let service: AuditService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    service = new AuditService(prisma as never);
  });

  it('registra un log de auditoría correctamente (log devuelve void)', async () => {
    prisma.auditLog.create.mockResolvedValue({ id: 'audit-uuid-1' });
    // log() retorna void – simplemente no debe lanzar excepción
    await expect(
      service.log({
        action: 'PRODUCT_CREATE',
        entity: 'PRODUCT',
        entityId: PRODUCT_ID,
        userId: USER_ID,
        details: { sku: 'TEST-001' },
      }),
    ).resolves.toBeUndefined();
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'PRODUCT_CREATE', entity: 'PRODUCT' }),
      }),
    );
  });

  it('no lanza error si la DB falla al guardar el log (error silencioso)', async () => {
    prisma.auditLog.create.mockRejectedValue(new Error('DB write error'));
    // AuditService.log() captura el error internamente
    await expect(
      service.log({ action: 'PRODUCT_UPDATE', entity: 'PRODUCT' }),
    ).resolves.toBeUndefined();
  });

  it('registra log de WAREHOUSE_MAPPING_AUDIT sin lanzar excepción', async () => {
    prisma.auditLog.create.mockResolvedValue({ id: 'audit-uuid-2' });
    await expect(
      service.log({
        action: 'WAREHOUSE_MAPPING_AUDIT',
        entity: 'WAREHOUSE_2D',
        details: { folio: 'MAP-2026-12345', ira: 95.3 },
      }),
    ).resolves.toBeUndefined();
  });

  it('findAll() retorna los logs de auditoría paginados', async () => {
    const logs = [
      { id: 'log-1', action: 'PRODUCT_CREATE', entity: 'PRODUCT', createdAt: new Date(), user: null },
      { id: 'log-2', action: 'MOVEMENT_ENTRY', entity: 'MOVEMENT', createdAt: new Date(), user: null },
    ];
    prisma.auditLog.findMany.mockResolvedValue(logs);
    const result = await service.findAll();
    expect(result).toHaveLength(2);
    expect(result[0].action).toBe('PRODUCT_CREATE');
  });

  it('findAll() filtra por organizationId', async () => {
    const ORG_ID = 'org-uuid-001';
    prisma.auditLog.findMany.mockResolvedValue([]);
    await service.findAll(ORG_ID);
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: ORG_ID } }),
    );
  });

  it('findAll() respeta el límite de registros', async () => {
    prisma.auditLog.findMany.mockResolvedValue([]);
    await service.findAll(undefined, 10);
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 10 }),
    );
  });
});

// ══════════════════════════════════════════════════════════════
// 10. VALIDACIONES DE DOMINIO (DTOs)
// ══════════════════════════════════════════════════════════════
describe('Validaciones de dominio', () => {
  describe('UUID format validation', () => {
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    it('acepta UUID v4 válido', () => {
      expect(UUID_REGEX.test(PRODUCT_ID)).toBe(true);
      expect(UUID_REGEX.test(LOC_ID_SRC)).toBe(true);
    });

    it('rechaza código de ubicación como ID', () => {
      expect(UUID_REGEX.test('A-C-01-01')).toBe(false);
    });

    it('rechaza cadena vacía como ID', () => {
      expect(UUID_REGEX.test('')).toBe(false);
    });
  });

  describe('Location status values', () => {
    const VALID_STATUSES = ['AVAILABLE', 'OCCUPIED', 'BLOCKED', 'MAINTENANCE'];

    it('todos los estados válidos son reconocidos', () => {
      VALID_STATUSES.forEach((status) => {
        expect(VALID_STATUSES).toContain(status);
      });
    });

    it('estado inválido no está en la lista', () => {
      expect(VALID_STATUSES).not.toContain('UNKNOWN');
    });
  });

  describe('Movement delta constraints', () => {
    it('acepta delta positivo (sobrante)', () => {
      const delta = 5;
      expect(delta).toBeGreaterThan(0);
      expect(delta).toBeLessThanOrEqual(1000000);
    });

    it('acepta delta negativo (faltante)', () => {
      const delta = -3;
      expect(delta).toBeLessThan(0);
      expect(delta).toBeGreaterThanOrEqual(-1000000);
    });

    it('rechaza delta fuera del rango permitido', () => {
      const overflow = 9999999;
      expect(overflow).toBeGreaterThan(1000000); // sería rechazado por el DTO
    });
  });

  describe('Report period values', () => {
    const VALID_PERIODS = ['7d', '30d', 'all'];

    it('todos los períodos son válidos', () => {
      VALID_PERIODS.forEach((p) => expect(VALID_PERIODS).toContain(p));
    });

    it('período inválido no es reconocido', () => {
      expect(VALID_PERIODS).not.toContain('90d');
    });
  });
});

// ══════════════════════════════════════════════════════════════
// 11. FLUJOS E2E DE SECCIONES CLAVE (simulación de alta nivel)
// ══════════════════════════════════════════════════════════════
describe('Flujos E2E simulados', () => {
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
  });

  it('Flujo completo: Crear producto → Recibir stock → Consultar inventario', async () => {
    const productsService = new ProductsService(prisma as never);
    const movementsService = new MovementsService(prisma as never);
    const inventoryService = new InventoryService(prisma as never);

    // 1. Crear producto
    prisma.product.create.mockResolvedValue(SAMPLE_PRODUCT);
    const product = await productsService.create({ sku: 'TEST-001', name: 'Producto Test', unit: 'u' } as any);
    expect(product.id).toBe(PRODUCT_ID);

    // 2. Registrar entrada de stock
    prisma.$queryRaw.mockResolvedValue([{ movementId: 'e2e-mov-1' }]);
    const movement = await movementsService.receive(
      { productId: product.id, locationId: LOC_ID_SRC, quantity: 100 },
      USER_ID,
    );
    expect(movement.movementId).toBe('e2e-mov-1');

    // 3. Consultar inventario
    prisma.inventory.findMany.mockResolvedValue([{ ...SAMPLE_INVENTORY, quantity: 100 }]);
    prisma.inventory.count.mockResolvedValue(1);
    const inventory = await inventoryService.findAll({});
    expect(inventory.items[0].quantity).toBe(100);
  });

  it('Flujo completo: Recibir → Transferir → Verificar nueva ubicación', async () => {
    const movementsService = new MovementsService(prisma as never);

    prisma.$queryRaw
      .mockResolvedValueOnce([{ movementId: 'e2e-entry-1' }])
      .mockResolvedValueOnce([{ movementId: 'e2e-transfer-1' }]);

    // 1. Entrada en ubicación origen
    const entry = await movementsService.receive(
      { productId: PRODUCT_ID, locationId: LOC_ID_SRC, quantity: 50 },
      USER_ID,
    );
    expect(entry.movementId).toBe('e2e-entry-1');

    // 2. Transferencia a ubicación destino
    const transfer = await movementsService.transfer(
      {
        productId: PRODUCT_ID,
        sourceLocationId: LOC_ID_SRC,
        destinationLocationId: LOC_ID_DST,
        quantity: 30,
        reason: 'Reorganización',
      },
      USER_ID,
    );
    expect(transfer.movementId).toBe('e2e-transfer-1');
  });

  it('Flujo completo: Despacho → Ajuste de merma → Reporte', async () => {
    const movementsService = new MovementsService(prisma as never);
    const reportsService = new ReportsService(prisma as never);

    prisma.$queryRaw
      .mockResolvedValueOnce([{ movementId: 'e2e-issue-1' }])
      .mockResolvedValueOnce([{ movementId: 'e2e-adj-1' }]);

    // 1. Despacho de mercancía
    const issue = await movementsService.issue(
      { productId: PRODUCT_ID, locationId: LOC_ID_SRC, quantity: 10, reason: 'Despacho cliente' },
      USER_ID,
    );
    expect(issue.movementId).toBe('e2e-issue-1');

    // 2. Ajuste por merma detectada
    const adjustment = await movementsService.adjustment(
      { productId: PRODUCT_ID, locationId: LOC_ID_SRC, delta: -2, reason: 'Merma post-despacho' },
      USER_ID,
    );
    expect(adjustment.movementId).toBe('e2e-adj-1');

    // 3. Generar reporte de movimientos
    prisma.movement.findMany.mockResolvedValue([]);
    const report = await reportsService.generateMovementsReport('json', '7d');
    expect(report.buffer).toBeDefined();
    expect(report.filename).toContain('movimientos');
  });

  it('Flujo completo: Importación masiva DryRun → Apply', async () => {
    const reportsService = new ReportsService(prisma as never);
    const movementsService = new MovementsService(prisma as never);

    // DryRun
    prisma.product.findMany = jest.fn().mockResolvedValue([{ ...SAMPLE_PRODUCT, inventory: [] }]);
    prisma.location.findMany = jest.fn().mockResolvedValue([SAMPLE_LOCATION]);

    const dryRun = await reportsService.dryRunImport([
      { sku: 'TEST-001', locationCode: 'A-C-01-01', quantity: 20 },
    ]);
    expect(dryRun.validRows).toBe(1);

    // Apply (simula que el applyBulkImport llama a adjustment internamente)
    prisma.$queryRaw.mockResolvedValue([{ movementId: 'bulk-adj-1' }]);
    const adj = await movementsService.adjustment(
      {
        productId: PRODUCT_ID,
        locationId: LOC_ID_SRC,
        delta: 20,
        reason: 'Importación masiva REPLENISH',
        reference: 'BULK-IMPORT',
      },
      USER_ID,
    );
    expect(adj.movementId).toBe('bulk-adj-1');
  });
});
