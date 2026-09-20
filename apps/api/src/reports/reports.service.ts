import { Injectable, StreamableFile } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import * as ExcelJS from "exceljs";

export type ReportFormat = "xlsx" | "csv" | "json";
export type ReportPeriod = "7d" | "30d" | "all";

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  private periodToDate(period: ReportPeriod): Date | null {
    const now = new Date();
    if (period === "7d") return new Date(now.getTime() - 7 * 86400000);
    if (period === "30d") return new Date(now.getTime() - 30 * 86400000);
    return null;
  }

  // ─── INVENTORY REPORT ───
  async generateInventoryReport(format: ReportFormat, organizationId?: string): Promise<{ buffer: Buffer; filename: string; mime: string }> {
    const orgFilter = organizationId ? { organizationId } : {};

    const rows = await this.prisma.inventory.findMany({
      where: { quantity: { gte: 0 }, product: { active: true, ...orgFilter } },
      include: {
        product: { select: { sku: true, name: true, category: true, unit: true, brand: true } },
        location: { select: { code: true, level: true, position: true } },
      },
      orderBy: [{ product: { sku: "asc" } }],
    });

    const data = rows.map((r) => ({
      SKU: r.product.sku,
      Nombre: r.product.name,
      Categoria: r.product.category ?? "",
      Marca: r.product.brand ?? "",
      Unidad: r.product.unit,
      Ubicacion: r.location.code,
      Nivel: r.location.level,
      Posicion: r.location.position,
      Cantidad: r.quantity,
      CantidadReservada: r.reservedQuantity,
      CantidadDisponible: r.quantity - r.reservedQuantity,
      FechaActualizacion: r.updatedAt.toISOString(),
    }));

    return this.buildReport(data, format, `inventario_${this.dateStamp()}`);
  }

  // ─── MOVEMENTS REPORT ───
  async generateMovementsReport(format: ReportFormat, period: ReportPeriod = "30d", organizationId?: string): Promise<{ buffer: Buffer; filename: string; mime: string }> {
    const since = this.periodToDate(period);
    const orgFilter = organizationId ? { organizationId } : {};

    const rows = await this.prisma.movement.findMany({
      where: { ...(since ? { createdAt: { gte: since } } : {}), ...orgFilter },
      include: {
        product: { select: { sku: true, name: true } },
        sourceLocation: { select: { code: true } },
        destinationLocation: { select: { code: true } },
        user: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const data = rows.map((r) => ({
      ID: r.id,
      Tipo: r.type,
      SKU: r.product.sku,
      Producto: r.product.name,
      Cantidad: r.quantity,
      UbicacionOrigen: r.sourceLocation?.code ?? "-",
      UbicacionDestino: r.destinationLocation?.code ?? "-",
      Referencia: r.reference ?? "",
      Razon: r.reason ?? "",
      Usuario: r.user?.name ?? "Sistema",
      Fecha: r.createdAt.toISOString(),
    }));

    return this.buildReport(data, format, `movimientos_${period}_${this.dateStamp()}`);
  }

  // ─── AUDIT REPORT ───
  async generateBreakRiskReport(format: ReportFormat, organizationId?: string): Promise<{ buffer: Buffer; filename: string; mime: string }> {
    const day30Ago = new Date(Date.now() - 30 * 86400000);
    const orgFilter = organizationId ? { organizationId } : {};

    const issuesByProduct = await this.prisma.movement.groupBy({
      by: ["productId"],
      where: { type: "ISSUE", createdAt: { gte: day30Ago }, ...orgFilter },
      _sum: { quantity: true },
    });

    const issueMap = new Map(issuesByProduct.map((m) => [m.productId, m._sum.quantity ?? 0]));

    const allInv = await this.prisma.inventory.findMany({
      where: { quantity: { gt: 0 } },
      include: { product: { select: { sku: true, name: true, category: true } } },
    });

    const data = allInv.map((inv) => {
      const issued = issueMap.get(inv.productId) ?? 0;
      const dailyAvg = issued / 30;
      const daysLeft = dailyAvg > 0 ? Math.floor(inv.quantity / dailyAvg) : 9999;
      return {
        SKU: inv.product.sku,
        Nombre: inv.product.name,
        Categoria: inv.product.category ?? "",
        Stock: inv.quantity,
        SalidasUltimos30d: issued,
        PromedioSalidaDiaria: Math.round(dailyAvg * 10) / 10,
        DiasDeCobertura: daysLeft === 9999 ? "Sin rotacion" : daysLeft,
        Alerta: daysLeft <= 3 ? "🔴 CRITICO" : daysLeft <= 7 ? "🟡 BAJO" : "🟢 OK",
      };
    });

    data.sort((a) => (a.Alerta.startsWith("🔴") ? -1 : a.Alerta.startsWith("🟡") ? 0 : 1));

    return this.buildReport(data, format, `quiebres_riesgo_${this.dateStamp()}`);
  }

  // ─── PRIVATE HELPERS ───
  private async buildReport(
    data: Record<string, unknown>[],
    format: ReportFormat,
    baseName: string,
  ): Promise<{ buffer: Buffer; filename: string; mime: string }> {
    if (format === "json") {
      const payload = JSON.stringify({ generatedAt: new Date().toISOString(), rowCount: data.length, rows: data }, null, 2);
      return { buffer: Buffer.from(payload, "utf8"), filename: `${baseName}.json`, mime: "application/json" };
    }

    if (format === "csv") {
      if (data.length === 0) return { buffer: Buffer.from("\uFEFF"), filename: `${baseName}.csv`, mime: "text/csv" };
      const headers = Object.keys(data[0]);
      const csvLines = [
        headers.join(","),
        ...data.map((row) =>
          headers
            .map((h) => {
              const val = String(row[h] ?? "").replace(/"/g, '""');
              return /[,"\n\r]/.test(val) ? `"${val}"` : val;
            })
            .join(","),
        ),
      ];
      const csv = "\uFEFF" + csvLines.join("\r\n");
      return { buffer: Buffer.from(csv, "utf8"), filename: `${baseName}.csv`, mime: "text/csv;charset=utf-8" };
    }

    // XLSX
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "WMS Enterprise";
    workbook.created = new Date();
    const sheet = workbook.addWorksheet("Reporte", { views: [{ state: "frozen", ySplit: 1 }] });

    if (data.length > 0) {
      const headers = Object.keys(data[0]);
      sheet.columns = headers.map((h) => ({ header: h, key: h, width: Math.max(h.length + 4, 16) }));

      // Style header row
      const headerRow = sheet.getRow(1);
      headerRow.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
        cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
        cell.alignment = { vertical: "middle", horizontal: "center" };
        cell.border = { bottom: { style: "medium", color: { argb: "FF1E3A5F" } } };
      });
      headerRow.height = 22;

      data.forEach((row, idx) => {
        const excelRow = sheet.addRow(row);
        excelRow.eachCell((cell) => {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: idx % 2 === 0 ? "FFF0F4FA" : "FFFFFFFF" } };
          cell.alignment = { vertical: "middle" };
        });
      });

      sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };
    }

    const buf = await workbook.xlsx.writeBuffer();
    return { buffer: Buffer.from(buf), filename: `${baseName}.xlsx`, mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
  }

  private dateStamp(): string {
    return new Date().toISOString().slice(0, 10).replace(/-/g, "");
  }
}
