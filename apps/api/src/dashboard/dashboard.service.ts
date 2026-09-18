import { Injectable } from '@nestjs/common';
import { MovementType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async summary() {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const [products, locations, occupied, available, stock, entries, issues, recentMovements] = await Promise.all([
      this.prisma.product.count({ where: { active: true } }),
      this.prisma.location.count(),
      this.prisma.location.count({ where: { status: 'OCCUPIED' } }),
      this.prisma.location.count({ where: { status: 'AVAILABLE' } }),
      this.prisma.inventory.aggregate({ _sum: { quantity: true } }),
      this.prisma.movement.count({ where: { type: MovementType.RECEIPT, createdAt: { gte: startOfDay } } }),
      this.prisma.movement.count({ where: { type: MovementType.ISSUE, createdAt: { gte: startOfDay } } }),
      this.prisma.movement.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: { product: true, sourceLocation: true, destinationLocation: true },
      }),
    ]);

    return {
      products,
      locations,
      occupiedLocations: occupied,
      availableLocations: available,
      totalUnits: stock._sum.quantity ?? 0,
      entriesToday: entries,
      issuesToday: issues,
      recentMovements,
    };
  }
}
