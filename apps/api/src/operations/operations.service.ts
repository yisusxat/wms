import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

export interface SlottingSuggestion {
  locationId: string;
  locationCode: string;
  zone: string;
  aisle: string;
  rack: string;
  level: number;
  position: number;
  score: number;
  abcClass: "A" | "B" | "C";
  reasons: string[];
}

export interface PickingRouteItem {
  step: number;
  locationId: string;
  locationCode: string;
  aisle: string;
  rack: string;
  level: number;
  position: number;
  productId: string;
  sku: string;
  productName: string;
  quantityAvailable: number;
  requestedQuantity: number;
}

export interface LabelData {
  code: string;
  type: "LOCATION" | "PALLET" | "PRODUCT";
  title: string;
  subtitle?: string;
  barcode: string;
  qrPayload: string;
  zpl: string;
}

@Injectable()
export class OperationsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─────────────────────────────────────────────────────────────
  // 1. SMART SLOTTING ENGINE
  // ─────────────────────────────────────────────────────────────
  async suggestSlotting(productId: string): Promise<SlottingSuggestion[]> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });
    if (!product) {
      throw new NotFoundException("Producto no encontrado");
    }

    // 1. Calcular rotación ABC de los últimos 30 días para este producto
    const day30Ago = new Date(Date.now() - 30 * 86400000);
    const [allIssues, productIssues] = await Promise.all([
      this.prisma.movement.aggregate({
        where: { type: "ISSUE", createdAt: { gte: day30Ago } },
        _sum: { quantity: true },
      }),
      this.prisma.movement.aggregate({
        where: { type: "ISSUE", productId, createdAt: { gte: day30Ago } },
        _sum: { quantity: true },
      }),
    ]);

    const totalIssued = allIssues._sum.quantity ?? 0;
    const itemIssued = productIssues._sum.quantity ?? 0;
    const ratio = totalIssued > 0 ? (itemIssued / totalIssued) * 100 : 0;

    let abcClass: "A" | "B" | "C" = "C";
    if (ratio >= 5 || itemIssued > 20) {
      abcClass = "A";
    } else if (ratio >= 1 || itemIssued > 5) {
      abcClass = "B";
    }

    // 2. Obtener todas las ubicaciones candidatas (AVAILABLE o que ya tengan este producto)
    const locations = await this.prisma.location.findMany({
      where: {
        status: { in: ["AVAILABLE", "OCCUPIED"] },
      },
      include: {
        rack: {
          include: {
            aisle: {
              include: {
                zone: true,
              },
            },
          },
        },
        inventory: {
          where: { productId },
        },
      },
      take: 150,
    });

    const suggestions: SlottingSuggestion[] = [];

    for (const loc of locations) {
      let score = 50;
      const reasons: string[] = [];

      // A) Consolidación: Si ya tiene este producto, priorizarlo para no dispersar stock
      const hasProduct = loc.inventory.length > 0;
      if (hasProduct) {
        score += 35;
        reasons.push("Consolidación: ubicación con stock previo del mismo SKU (+35)");
      }

      // B) Nivel Ergonómico según ABC:
      // Nivel 1 y 2 son niveles ergonómicos (Golden Zone)
      if (abcClass === "A") {
        if (loc.level === 1 || loc.level === 2) {
          score += 25;
          reasons.push("Alta rotación A: Nivel 1/2 ergonómico rápido (+25)");
        } else if (loc.level >= 4) {
          score -= 15;
          reasons.push("Penalización nivel alto para clase A (-15)");
        }
      } else if (abcClass === "B") {
        if (loc.level === 2 || loc.level === 3) {
          score += 15;
          reasons.push("Media rotación B: Nivel 2/3 intermedio (+15)");
        }
      } else {
        // Clase C (baja rotación) -> niveles altos o racks de reserva
        if (loc.level >= 3) {
          score += 20;
          reasons.push("Baja rotación C: Optimiza espacio en nivel alto (+20)");
        } else if (loc.level === 1) {
          score -= 10;
          reasons.push("Preserva nivel bajo para SKUs más activos (-10)");
        }
      }

      // C) Proximidad a muelle / Pasillos iniciales (A, B)
      const aisleCode = loc.rack.aisle.code.toUpperCase();
      if (aisleCode === "A" || aisleCode === "1" || aisleCode === "PASILLO 1") {
        if (abcClass === "A") {
          score += 15;
          reasons.push("Proximidad muelle: Pasillo frontal rápido (+15)");
        }
      }

      // D) Disponibilidad de espacio
      if (loc.status === "AVAILABLE") {
        score += 10;
        reasons.push("Ubicación 100% libre (+10)");
      }

      const finalScore = Math.max(0, Math.min(100, score));

      suggestions.push({
        locationId: loc.id,
        locationCode: loc.code,
        zone: loc.rack.aisle.zone.name,
        aisle: loc.rack.aisle.code,
        rack: loc.rack.code,
        level: loc.level,
        position: loc.position,
        score: finalScore,
        abcClass,
        reasons,
      });
    }

    return suggestions
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }

  // ─────────────────────────────────────────────────────────────
  // 2. RUTAS DE PICKING ÓPTIMAS (S-SHAPE / SERPENTINA)
  // ─────────────────────────────────────────────────────────────
  async calculatePickingRoute(items: { productId: string; quantity: number }[]): Promise<PickingRouteItem[]> {
    const routeItems: PickingRouteItem[] = [];

    for (const req of items) {
      const invList = await this.prisma.inventory.findMany({
        where: {
          productId: req.productId,
          quantity: { gt: 0 },
        },
        include: {
          product: true,
          location: {
            include: {
              rack: {
                include: {
                  aisle: true,
                },
              },
            },
          },
        },
        orderBy: {
          quantity: "desc",
        },
      });

      if (invList.length > 0) {
        // Tomamos la mejor ubicación con stock
        const chosen = invList[0];
        routeItems.push({
          step: 0,
          locationId: chosen.location.id,
          locationCode: chosen.location.code,
          aisle: chosen.location.rack.aisle.code,
          rack: chosen.location.rack.code,
          level: chosen.location.level,
          position: chosen.location.position,
          productId: chosen.productId,
          sku: chosen.product.sku,
          productName: chosen.product.name,
          quantityAvailable: chosen.quantity,
          requestedQuantity: Math.min(req.quantity, chosen.quantity),
        });
      }
    }

    // Algoritmo S-Shape (Serpentina):
    // 1. Agrupar por Pasillo (Aisle).
    // 2. Ordenar pasillos cronológicamente (Aisle 1, 2, 3...)
    // 3. En pasillos impares, ordenar racks ascendentemente (recorrer hacia el fondo).
    // 4. En pasillos pares, ordenar racks descendentemente (regresar hacia el inicio).
    const aisleGroups = new Map<string, typeof routeItems>();
    for (const item of routeItems) {
      const list = aisleGroups.get(item.aisle) ?? [];
      list.push(item);
      aisleGroups.set(item.aisle, list);
    }

    const sortedAisles = Array.from(aisleGroups.keys()).sort();
    const orderedResult: PickingRouteItem[] = [];

    sortedAisles.forEach((aisleCode, aisleIndex) => {
      const group = aisleGroups.get(aisleCode) ?? [];
      const isEven = aisleIndex % 2 === 1;

      group.sort((a, b) => {
        if (a.rack !== b.rack) {
          return isEven ? b.rack.localeCompare(a.rack) : a.rack.localeCompare(b.rack);
        }
        if (a.level !== b.level) {
          return a.level - b.level;
        }
        return a.position - b.position;
      });

      orderedResult.push(...group);
    });

    return orderedResult.map((item, index) => ({
      ...item,
      step: index + 1,
    }));
  }

  // ─────────────────────────────────────────────────────────────
  // 3. GENERADOR DE ETIQUETAS Y ZPL (ZEBRA)
  // ─────────────────────────────────────────────────────────────
  generateLabel(code: string, type: "LOCATION" | "PALLET" | "PRODUCT", title: string, subtitle?: string): LabelData {
    // Generar formato ZPL nativo para impresoras industriales Zebra (resolución 203 DPI standard 4x2 pulgadas)
    const zpl = `^XA
^PW812
^LL406
^FO50,40^A0N,36,36^FDWMS ENTERPRISE^FS
^FO50,85^A0N,28,28^FD${type}: ${title}^FS
${subtitle ? `^FO50,120^A0N,22,22^FD${subtitle}^FS` : ""}
^FO50,160^BCN,100,Y,N,N^FD${code}^FS
^FO550,160^BQN,2,5^FDQA,${code}^FS
^XZ`;

    return {
      code,
      type,
      title,
      subtitle,
      barcode: code,
      qrPayload: JSON.stringify({ type, code, title }),
      zpl,
    };
  }

  async getLocationLabel(locationId: string): Promise<LabelData> {
    const loc = await this.prisma.location.findUnique({
      where: { id: locationId },
      include: {
        rack: {
          include: {
            aisle: {
              include: { zone: true },
            },
          },
        },
      },
    });
    if (!loc) throw new NotFoundException("Ubicación no encontrada");

    return this.generateLabel(
      loc.code,
      "LOCATION",
      `Posición ${loc.code}`,
      `Zona ${loc.rack.aisle.zone.name} · Pasillo ${loc.rack.aisle.code} · Nivel ${loc.level}`
    );
  }

  async getProductLabel(productId: string): Promise<LabelData> {
    const prod = await this.prisma.product.findUnique({
      where: { id: productId },
    });
    if (!prod) throw new NotFoundException("Producto no encontrado");

    return this.generateLabel(
      prod.sku,
      "PRODUCT",
      prod.name,
      `SKU: ${prod.sku} · Unidad: ${prod.unit} · Cat: ${prod.category ?? "General"}`
    );
  }

  // ─────────────────────────────────────────────────────────────
  // 4. TRAZABILIDAD FIFO / FEFO (SUGERENCIA DE DESPACHO)
  // ─────────────────────────────────────────────────────────────
  async suggestDispatchFifo(productId: string, quantity: number) {
    const inventories = await this.prisma.inventory.findMany({
      where: {
        productId,
        quantity: { gt: 0 },
      },
      include: {
        location: true,
      },
      orderBy: {
        createdAt: "asc", // FIFO estricto por antigüedad de entrada
      },
    });

    let remaining = quantity;
    const suggestions = [];

    for (const inv of inventories) {
      if (remaining <= 0) break;
      const takeQty = Math.min(inv.quantity, remaining);
      remaining -= takeQty;

      suggestions.push({
        locationId: inv.locationId,
        locationCode: inv.location.code,
        availableQuantity: inv.quantity,
        suggestedQuantity: takeQty,
        entryDate: inv.createdAt,
        rule: "FIFO (First-In, First-Out - Lote más antiguo primero)",
      });
    }

    return {
      productId,
      requestedQuantity: quantity,
      allocatedQuantity: quantity - remaining,
      missingQuantity: remaining,
      canFulfill: remaining === 0,
      suggestions,
    };
  }
}
