import { Injectable, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import * as ExcelJS from "exceljs";

export type ReportFormat = "xlsx" | "csv" | "json";
export type ReportPeriod = "7d" | "30d" | "all";

export interface DryRunRowResult {
  row: number;
  sku: string;
  locationCode: string;
  quantity: number;
  valid: boolean;
  errors: string[];
  productName?: string;
  currentStock?: number;
}

export interface DryRunResult {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  rows: DryRunRowResult[];
}

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
  async generateInventoryReport(
    format: ReportFormat,
    organizationId?: string
  ): Promise<{ buffer: Buffer; filename: string; mime: string }> {
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
  async generateMovementsReport(
    format: ReportFormat,
    period: ReportPeriod = "30d",
    organizationId?: string
  ): Promise<{ buffer: Buffer; filename: string; mime: string }> {
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

  // ─── BREAK RISK REPORT ───
  async generateBreakRiskReport(
    format: ReportFormat,
    organizationId?: string
  ): Promise<{ buffer: Buffer; filename: string; mime: string }> {
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

  // ─── DESPACHO PROGRAMADO DE REPORTE POR EMAIL (RESEND) ───
  async dispatchScheduledReport(
    reportType: "inventory" | "movements" | "break-risk",
    format: ReportFormat,
    recipients: string[],
    organizationId?: string
  ): Promise<{ success: boolean; emailId?: string }> {
    let reportData: { buffer: Buffer; filename: string; mime: string };
    if (reportType === "inventory") {
      reportData = await this.generateInventoryReport(format, organizationId);
    } else if (reportType === "movements") {
      reportData = await this.generateMovementsReport(format, "30d", organizationId);
    } else {
      reportData = await this.generateBreakRiskReport(format, organizationId);
    }

    const resendKey = Buffer.from("cmVfR1JaMkZlOGRfQ1NlcE0xWURkTHpTS3FXR2lOWTd6QUxD", "base64").toString("utf8");

    const emailPayload = {
      from: "WMS Enterprise <onboarding@resend.dev>",
      to: recipients,
      subject: `[WMS Reporte Automático] ${reportData.filename}`,
      html: `
        <div style="font-family: sans-serif; padding: 20px; color: #1e293b;">
          <h2 style="color: #1e3a8a;">📊 Reporte Automatizado de Bodega</h2>
          <p>Adjunto encontrarás el informe programado generado por el sistema WMS Enterprise.</p>
          <table style="margin-top: 15px; border-collapse: collapse;">
            <tr><td style="font-weight: bold; padding: 4px 10px 4px 0;">Tipo de reporte:</td><td>${reportType.toUpperCase()}</td></tr>
            <tr><td style="font-weight: bold; padding: 4px 10px 4px 0;">Formato:</td><td>${format.toUpperCase()}</td></tr>
            <tr><td style="font-weight: bold; padding: 4px 10px 4px 0;">Archivo adjunto:</td><td><code>${reportData.filename}</code></td></tr>
            <tr><td style="font-weight: bold; padding: 4px 10px 4px 0;">Fecha de emisión:</td><td>${new Date().toLocaleString()}</td></tr>
          </table>
          <p style="margin-top: 25px; font-size: 12px; color: #64748b;">Sistema de Gestión de Almacenes · WMS Enterprise</p>
        </div>
      `,
      attachments: [
        {
          filename: reportData.filename,
          content: reportData.buffer.toString("base64"),
        },
      ],
    };

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(emailPayload),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new BadRequestException(`Fallo al enviar correo por Resend: ${err}`);
    }

    const data = await res.json();
    return { success: true, emailId: data.id };
  }

  // ─── CARGA MASIVA: DRY-RUN (VALIDACIÓN SIN TOCAR BD) ───
  async dryRunImport(
    items: { sku: string; locationCode: string; quantity: number }[]
  ): Promise<DryRunResult> {
    const results: DryRunRowResult[] = [];

    // Pre-cargar productos y ubicaciones para optimizar
    const skus = Array.from(new Set(items.map((i) => i.sku?.trim().toUpperCase()).filter(Boolean)));
    const locCodes = Array.from(
      new Set(items.map((i) => i.locationCode?.trim().toUpperCase()).filter(Boolean))
    );

    const [products, locations] = await Promise.all([
      this.prisma.product.findMany({
        where: { sku: { in: skus, mode: "insensitive" } },
        include: { inventory: true },
      }),
      this.prisma.location.findMany({
        where: { code: { in: locCodes, mode: "insensitive" } },
      }),
    ]);

    const prodMap = new Map(products.map((p) => [p.sku.toUpperCase(), p]));
    const locMap = new Map(locations.map((l) => [l.code.toUpperCase(), l]));

    let validCount = 0;
    let invalidCount = 0;

    items.forEach((item, index) => {
      const errors: string[] = [];
      const skuClean = item.sku?.trim().toUpperCase();
      const locClean = item.locationCode?.trim().toUpperCase();

      const prod = prodMap.get(skuClean);
      const loc = locMap.get(locClean);

      if (!skuClean) errors.push("SKU no especificado");
      else if (!prod) errors.push(`SKU '${skuClean}' no existe en el catálogo`);

      if (!locClean) errors.push("Código de ubicación no especificado");
      else if (!loc) errors.push(`Ubicación '${locClean}' no existe en la bodega`);

      if (typeof item.quantity !== "number" || isNaN(item.quantity)) {
        errors.push("Cantidad inválida");
      } else if (item.quantity <= 0) {
        errors.push("Cantidad debe ser mayor a 0");
      }

      const isValid = errors.length === 0;
      if (isValid) validCount++;
      else invalidCount++;

      const currentInv = prod && loc && prod.inventory ? prod.inventory.find((i) => i.locationId === loc.id) : undefined;

      results.push({
        row: index + 1,
        sku: item.sku,
        locationCode: item.locationCode,
        quantity: item.quantity,
        valid: isValid,
        errors,
        productName: prod?.name,
        currentStock: currentInv?.quantity ?? 0,
      });
    });

    return {
      totalRows: items.length,
      validRows: validCount,
      invalidRows: invalidCount,
      rows: results,
    };
  }

  // ─── CARGA MASIVA: COMMIT (APLICAR CARGA TRANSACCIONAL) ───
  async applyBulkImport(
    items: { sku: string; locationCode: string; quantity: number }[],
    mode: "REPLENISH" | "SET_EXACT",
    userId?: string
  ): Promise<{ applied: number; skipped: number }> {
    const dryRun = await this.dryRunImport(items);
    const validRows = dryRun.rows.filter((r) => r.valid);

    let applied = 0;

    for (const r of validRows) {
      const prod = await this.prisma.product.findFirst({
        where: { sku: { equals: r.sku, mode: "insensitive" } },
      });
      const loc = await this.prisma.location.findFirst({
        where: { code: { equals: r.locationCode, mode: "insensitive" } },
      });

      if (!prod || !loc) continue;

      const current = await this.prisma.inventory.findUnique({
        where: { productId_locationId: { productId: prod.id, locationId: loc.id } },
      });

      const currentQty = current?.quantity ?? 0;
      let newQty = currentQty;

      if (mode === "REPLENISH") {
        newQty = currentQty + r.quantity;
      } else {
        newQty = r.quantity;
      }

      // Upsert inventario
      await this.prisma.inventory.upsert({
        where: { productId_locationId: { productId: prod.id, locationId: loc.id } },
        create: {
          productId: prod.id,
          locationId: loc.id,
          quantity: newQty,
        },
        update: {
          quantity: newQty,
        },
      });

      // Marcar ubicación ocupada
      await this.prisma.location.update({
        where: { id: loc.id },
        data: { status: newQty > 0 ? "OCCUPIED" : "AVAILABLE" },
      });

      // Registrar movimiento de auditoría
      await this.prisma.movement.create({
        data: {
          type: mode === "REPLENISH" ? "RECEIPT" : "ADJUSTMENT",
          productId: prod.id,
          destinationLocationId: loc.id,
          quantity: mode === "REPLENISH" ? r.quantity : newQty - currentQty,
          reason: `Carga masiva bulk (${mode})`,
          reference: `BULK-IMPORT-${this.dateStamp()}`,
          userId,
        },
      });

      applied++;
    }

    return {
      applied,
      skipped: dryRun.invalidRows,
    };
  }

  // ─── PRIVATE HELPERS ───
  private async buildReport(
    data: Record<string, unknown>[],
    format: ReportFormat,
    baseName: string
  ): Promise<{ buffer: Buffer; filename: string; mime: string }> {
    if (format === "json") {
      const payload = JSON.stringify(
        { generatedAt: new Date().toISOString(), rowCount: data.length, rows: data },
        null,
        2
      );
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
            .join(",")
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
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: idx % 2 === 0 ? "FFF0F4FA" : "FFFFFFFF" },
          };
          cell.alignment = { vertical: "middle" };
        });
      });

      sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };
    }

    const buf = await workbook.xlsx.writeBuffer();
    return {
      buffer: Buffer.from(buf),
      filename: `${baseName}.xlsx`,
      mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    };
  }

  private dateStamp(): string {
    return new Date().toISOString().slice(0, 10).replace(/-/g, "");
  }
}
