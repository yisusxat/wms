import { Injectable } from '@nestjs/common';
import { MovementType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface KpiResult {
  occupancy: {
    rate: number;
    occupied: number;
    total: number;
    alert: boolean;
    byZone: { zoneCode: string; zoneName: string; occupied: number; total: number; rate: number }[];
  };
  abcClassification: {
    classA: { skuCount: number; percentage: number; items: { sku: string; name: string; issues: number }[] };
    classB: { skuCount: number; percentage: number; items: { sku: string; name: string; issues: number }[] };
    classC: { skuCount: number; percentage: number; items: { sku: string; name: string; issues: number }[] };
  };
  deadStock: {
    count: number;
    items: { sku: string; name: string; quantity: number; lastMovement: Date | null; daysSinceMovement: number }[];
  };
  dsi: {
    value: number;
    totalStock: number;
    avgDailyIssues: number;
    alert: boolean;
  };
  throughput: {
    trend: { date: string; receipts: number; issues: number }[];
    totalReceipts7d: number;
    totalIssues7d: number;
    balance: number;
  };
  ira: {
    percentage: number;
    totalAdjustments: number;
    totalStock: number;
    deviationRate: number;
    alert: boolean;
  };
  breakRisk: {
    count: number;
    items: { sku: string; name: string; quantity: number; daysRemaining: number }[];
  };
}

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

  async getKpis(organizationId?: string): Promise<KpiResult> {
    const now = new Date();
    const day60Ago = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    const day30Ago = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const orgFilter = organizationId ? { organizationId } : {};

    // ── 1. OCCUPANCY ──
    const [totalLocations, occupiedLocations, allZones] = await Promise.all([
      this.prisma.location.count(),
      this.prisma.location.count({ where: { status: 'OCCUPIED' } }),
      this.prisma.zone.findMany({
        include: {
          aisles: {
            include: {
              racks: {
                include: { locations: { select: { status: true } } },
              },
            },
          },
        },
      }),
    ]);

    const occupancyRate =
      totalLocations > 0 ? Math.round((occupiedLocations / totalLocations) * 1000) / 10 : 0;

    const byZone = allZones.map((zone) => {
      const locs = zone.aisles.flatMap((a) => a.racks.flatMap((r) => r.locations));
      const occ = locs.filter((l) => l.status === 'OCCUPIED').length;
      return {
        zoneCode: zone.code,
        zoneName: zone.name,
        occupied: occ,
        total: locs.length,
        rate: locs.length > 0 ? Math.round((occ / locs.length) * 1000) / 10 : 0,
      };
    });

    // ── 2. ABC CLASSIFICATION (ISSUE movements last 30d) ──
    const issueMovements = await this.prisma.movement.groupBy({
      by: ['productId'],
      where: { type: MovementType.ISSUE, createdAt: { gte: day30Ago }, ...orgFilter },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: 'desc' } },
    });

    const totalIssued = issueMovements.reduce((s, m) => s + (m._sum.quantity ?? 0), 0);
    let cumulativePercent = 0;
    const classA: typeof issueMovements = [];
    const classB: typeof issueMovements = [];
    const classC: typeof issueMovements = [];
    for (const m of issueMovements) {
      cumulativePercent += totalIssued > 0 ? ((m._sum.quantity ?? 0) / totalIssued) * 100 : 0;
      if (cumulativePercent <= 80) classA.push(m);
      else if (cumulativePercent <= 95) classB.push(m);
      else classC.push(m);
    }

    const pIds = issueMovements.map((m) => m.productId);
    const prods =
      pIds.length > 0
        ? await this.prisma.product.findMany({
            where: { id: { in: pIds } },
            select: { id: true, sku: true, name: true },
          })
        : [];
    const pMap = new Map(prods.map((p) => [p.id, p]));

    const mapClass = (items: typeof issueMovements) =>
      items.map((m) => ({
        sku: pMap.get(m.productId)?.sku ?? m.productId,
        name: pMap.get(m.productId)?.name ?? 'Desconocido',
        issues: m._sum.quantity ?? 0,
      }));

    // ── 3. DEAD STOCK (no ISSUE in 60+ days) ──
    const activeProds = await this.prisma.product.findMany({
      where: { active: true, ...orgFilter },
      select: { id: true, sku: true, name: true },
    });
    const recentlyMoved = new Set(
      (
        await this.prisma.movement.findMany({
          where: { type: MovementType.ISSUE, createdAt: { gte: day60Ago }, ...orgFilter },
          select: { productId: true },
          distinct: ['productId'],
        })
      ).map((m) => m.productId),
    );

    const deadIds = activeProds.filter((p) => !recentlyMoved.has(p.id)).map((p) => p.id);
    const deadInv =
      deadIds.length > 0
        ? await this.prisma.inventory.findMany({
            where: { productId: { in: deadIds }, quantity: { gt: 0 } },
            include: { product: { select: { sku: true, name: true } } },
          })
        : [];

    const lastMovMap = new Map(
      (
        deadIds.length > 0
          ? await this.prisma.movement.findMany({
              where: { productId: { in: deadIds }, ...orgFilter },
              orderBy: { createdAt: 'desc' },
              distinct: ['productId'],
              select: { productId: true, createdAt: true },
            })
          : []
      ).map((m) => [m.productId, m.createdAt]),
    );

    const deadByProd = new Map<string, { sku: string; name: string; quantity: number }>();
    for (const inv of deadInv) {
      const ex = deadByProd.get(inv.productId);
      if (ex) ex.quantity += inv.quantity;
      else deadByProd.set(inv.productId, { sku: inv.product.sku, name: inv.product.name, quantity: inv.quantity });
    }

    const deadStockItems = Array.from(deadByProd.entries()).map(([pid, item]) => {
      const lm = lastMovMap.get(pid) ?? null;
      const days = lm ? Math.floor((now.getTime() - lm.getTime()) / 86400000) : 999;
      return { ...item, lastMovement: lm, daysSinceMovement: days };
    });

    // ── 4. DSI ──
    const totalStockAgg = await this.prisma.inventory.aggregate({ _sum: { quantity: true } });
    const totalStock = totalStockAgg._sum.quantity ?? 0;
    const issued30Agg = await this.prisma.movement.aggregate({
      where: { type: MovementType.ISSUE, createdAt: { gte: day30Ago }, ...orgFilter },
      _sum: { quantity: true },
    });
    const avgDailyIssues = (issued30Agg._sum.quantity ?? 0) / 30;
    const dsiValue = avgDailyIssues > 0 ? Math.round(totalStock / avgDailyIssues) : 9999;

    // ── 5. THROUGHPUT (7-day trend) ──
    const throughputTrend: { date: string; receipts: number; issues: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const ds = new Date(now);
      ds.setDate(ds.getDate() - i);
      ds.setHours(0, 0, 0, 0);
      const de = new Date(ds);
      de.setHours(23, 59, 59, 999);
      const [r, s] = await Promise.all([
        this.prisma.movement.aggregate({
          where: { type: MovementType.RECEIPT, createdAt: { gte: ds, lte: de }, ...orgFilter },
          _sum: { quantity: true },
        }),
        this.prisma.movement.aggregate({
          where: { type: MovementType.ISSUE, createdAt: { gte: ds, lte: de }, ...orgFilter },
          _sum: { quantity: true },
        }),
      ]);
      throughputTrend.push({ date: ds.toISOString().split('T')[0], receipts: r._sum.quantity ?? 0, issues: s._sum.quantity ?? 0 });
    }
    const totalR7 = throughputTrend.reduce((s, d) => s + d.receipts, 0);
    const totalI7 = throughputTrend.reduce((s, d) => s + d.issues, 0);

    // ── 6. IRA % ──
    const adjAgg = await this.prisma.movement.aggregate({
      where: { type: MovementType.ADJUSTMENT, createdAt: { gte: day30Ago }, ...orgFilter },
      _sum: { quantity: true },
      _count: { id: true },
    });
    const totalAdj = Math.abs(adjAgg._sum.quantity ?? 0);
    const deviationRate = totalStock > 0 ? Math.round((totalAdj / totalStock) * 10000) / 100 : 0;
    const iraPercentage = Math.max(0, Math.round((100 - deviationRate) * 10) / 10);

    // ── 7. BREAK RISK (DSI < 7 days per SKU) ──
    const allInv = await this.prisma.inventory.findMany({
      where: { quantity: { gt: 0 } },
      include: { product: { select: { id: true, sku: true, name: true } } },
    });

    const breakRiskItems: { sku: string; name: string; quantity: number; daysRemaining: number }[] = [];
    for (const inv of allInv) {
      const skuIssued = issueMovements.find((m) => m.productId === inv.productId)?._sum.quantity ?? 0;
      const dailyAvg = skuIssued / 30;
      if (dailyAvg > 0) {
        const daysLeft = Math.floor(inv.quantity / dailyAvg);
        if (daysLeft <= 7) breakRiskItems.push({ sku: inv.product.sku, name: inv.product.name, quantity: inv.quantity, daysRemaining: daysLeft });
      }
    }
    breakRiskItems.sort((a, b) => a.daysRemaining - b.daysRemaining);

    return {
      occupancy: { rate: occupancyRate, occupied: occupiedLocations, total: totalLocations, alert: occupancyRate > 85, byZone },
      abcClassification: {
        classA: { skuCount: classA.length, percentage: Math.round((classA.length / Math.max(issueMovements.length, 1)) * 100), items: mapClass(classA) },
        classB: { skuCount: classB.length, percentage: Math.round((classB.length / Math.max(issueMovements.length, 1)) * 100), items: mapClass(classB) },
        classC: { skuCount: classC.length, percentage: Math.round((classC.length / Math.max(issueMovements.length, 1)) * 100), items: mapClass(classC) },
      },
      deadStock: { count: deadStockItems.length, items: deadStockItems },
      dsi: { value: dsiValue, totalStock, avgDailyIssues: Math.round(avgDailyIssues * 10) / 10, alert: dsiValue < 7 || dsiValue === 9999 },
      throughput: { trend: throughputTrend, totalReceipts7d: totalR7, totalIssues7d: totalI7, balance: totalR7 - totalI7 },
      ira: { percentage: iraPercentage, totalAdjustments: adjAgg._count.id, totalStock, deviationRate, alert: iraPercentage < 95 },
      breakRisk: { count: breakRiskItems.length, items: breakRiskItems },
    };
  }
}
