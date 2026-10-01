import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OperationsService } from '../operations/operations.service';

export interface CreateOrderDto {
  reference: string;
  priority?: number;
  notes?: string;
  lines: { productId: string; quantity: number }[];
}

export interface CreateWaveDto {
  name?: string;
  orderIds: string[];
}

@Injectable()
export class WavesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly operationsService: OperationsService,
  ) {}

  // ─── Órdenes ─────────────────────────────────────────────────────

  async createOrder(dto: CreateOrderDto) {
    if (!dto.lines || dto.lines.length === 0) {
      throw new BadRequestException('La orden debe tener al menos una línea de producto.');
    }
    return this.prisma.outboundOrder.create({
      data: {
        reference: dto.reference,
        priority:  dto.priority ?? 5,
        notes:     dto.notes,
        lines: {
          create: dto.lines.map((l) => ({
            productId: l.productId,
            quantity:  l.quantity,
          })),
        },
      },
      include: { lines: { include: { product: true } } },
    });
  }

  async findAllOrders(status?: string) {
    return this.prisma.outboundOrder.findMany({
      where: status ? { status } : {},
      include: {
        lines:  { include: { product: true } },
        wave:   { select: { id: true, name: true, status: true } },
      },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async findOneOrder(id: string) {
    const order = await this.prisma.outboundOrder.findUnique({
      where: { id },
      include: { lines: { include: { product: true } }, wave: true },
    });
    if (!order) throw new NotFoundException('Orden no encontrada');
    return order;
  }

  // ─── Olas (Waves) ───────────────────────────────────────────────

  async createWave(dto: CreateWaveDto) {
    const { orderIds } = dto;
    if (!orderIds || orderIds.length === 0) {
      throw new BadRequestException('La ola debe incluir al menos una orden.');
    }

    // Verificar que las órdenes existen y están en estado PENDING
    const orders = await this.prisma.outboundOrder.findMany({
      where: { id: { in: orderIds } },
      include: { lines: { include: { product: true } } },
    });

    if (orders.length !== orderIds.length) {
      throw new BadRequestException('Algunas órdenes no fueron encontradas.');
    }

    const nonPending = orders.filter((o) => o.status !== 'PENDING');
    if (nonPending.length > 0) {
      throw new BadRequestException(
        `Las siguientes órdenes no están en estado PENDING: ${nonPending.map((o) => o.reference).join(', ')}`,
      );
    }

    // Consolidar líneas: sumar cantidades del mismo productId en todas las órdenes
    const consolidatedMap = new Map<
      string,
      { productId: string; totalQty: number; orderBreakdown: { orderId: string; ref: string; qty: number }[] }
    >();

    for (const order of orders) {
      for (const line of order.lines) {
        const existing = consolidatedMap.get(line.productId) ?? {
          productId: line.productId,
          totalQty: 0,
          orderBreakdown: [],
        };
        existing.totalQty += line.quantity;
        existing.orderBreakdown.push({ orderId: order.id, ref: order.reference, qty: line.quantity });
        consolidatedMap.set(line.productId, existing);
      }
    }

    // Calcular ruta óptima (S-Shape) con cantidades consolidadas
    const routeItems = await this.operationsService.calculatePickingRoute(
      Array.from(consolidatedMap.values()).map((v) => ({
        productId: v.productId,
        quantity: v.totalQty,
      })),
    );

    // Enriquecer con desglose por orden
    const batchRoute = routeItems.map((item) => ({
      ...item,
      orderBreakdown: consolidatedMap.get(item.productId)?.orderBreakdown ?? [],
    }));

    // Generar nombre automático si no se provee
    const waveName =
      dto.name ??
      `OLA-${new Date().toISOString().slice(0, 10)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    // Crear la ola y actualizar estados de órdenes en una transacción
    const wave = await this.prisma.$transaction(async (tx) => {
      const w = await tx.wave.create({
        data: {
          name:   waveName,
          status: 'PICKING',
          route:  batchRoute as any,
        },
      });

      await tx.outboundOrder.updateMany({
        where: { id: { in: orderIds } },
        data:  { status: 'PICKING', waveId: w.id },
      });

      return w;
    });

    return {
      wave,
      consolidatedRoute: batchRoute,
      totalOrders:  orders.length,
      totalItems:   batchRoute.length,
    };
  }

  async findAllWaves() {
    return this.prisma.wave.findMany({
      include: {
        orders: {
          select: {
            id: true, reference: true, status: true, priority: true,
            lines: { select: { quantity: true, pickedQty: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async closeWave(id: string) {
    const wave = await this.prisma.wave.findUnique({ where: { id } });
    if (!wave) throw new NotFoundException('Ola no encontrada');
    if (wave.status === 'CLOSED') throw new BadRequestException('La ola ya está cerrada.');

    return this.prisma.$transaction(async (tx) => {
      await tx.outboundOrder.updateMany({
        where: { waveId: id },
        data:  { status: 'PACKED' },
      });
      return tx.wave.update({
        where: { id },
        data:  { status: 'CLOSED' },
      });
    });
  }

  async updatePickedQty(lineId: string, pickedQty: number) {
    return this.prisma.outboundOrderLine.update({
      where: { id: lineId },
      data:  { pickedQty },
    });
  }
}
