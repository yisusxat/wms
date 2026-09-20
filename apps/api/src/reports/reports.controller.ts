import { Body, Controller, Get, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import type { Response, Request } from "express";
import { AuthGuard } from "../auth/auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { ReportFormat, ReportPeriod, ReportsService } from "./reports.service";

@Controller("reports")
@UseGuards(AuthGuard, RolesGuard)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get("inventory")
  async inventory(
    @Query("format") format: ReportFormat = "xlsx",
    @Query("organizationId") organizationId: string | undefined,
    @Res() res: Response
  ) {
    const result = await this.reports.generateInventoryReport(format, organizationId);
    res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
    res.setHeader("Content-Type", result.mime);
    res.send(result.buffer);
  }

  @Get("movements")
  async movements(
    @Query("format") format: ReportFormat = "xlsx",
    @Query("period") period: ReportPeriod = "30d",
    @Query("organizationId") organizationId: string | undefined,
    @Res() res: Response
  ) {
    const result = await this.reports.generateMovementsReport(format, period, organizationId);
    res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
    res.setHeader("Content-Type", result.mime);
    res.send(result.buffer);
  }

  @Get("break-risk")
  async breakRisk(
    @Query("format") format: ReportFormat = "xlsx",
    @Query("organizationId") organizationId: string | undefined,
    @Res() res: Response
  ) {
    const result = await this.reports.generateBreakRiskReport(format, organizationId);
    res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
    res.setHeader("Content-Type", result.mime);
    res.send(result.buffer);
  }

  @Post("schedule/dispatch")
  async dispatchSchedule(
    @Body()
    body: {
      reportType: "inventory" | "movements" | "break-risk";
      format: ReportFormat;
      recipients: string[];
      organizationId?: string;
    }
  ) {
    return this.reports.dispatchScheduledReport(
      body.reportType,
      body.format ?? "xlsx",
      body.recipients ?? ["yisusxat@gmail.com"],
      body.organizationId
    );
  }

  @Post("bulk/dry-run")
  async bulkDryRun(
    @Body() body: { items: { sku: string; locationCode: string; quantity: number }[] }
  ) {
    return this.reports.dryRunImport(body.items ?? []);
  }

  @Post("bulk/apply")
  async bulkApply(
    @Body()
    body: {
      items: { sku: string; locationCode: string; quantity: number }[];
      mode: "REPLENISH" | "SET_EXACT";
    },
    @Req() req: Request
  ) {
    const user = (req as any).user;
    return this.reports.applyBulkImport(body.items ?? [], body.mode ?? "REPLENISH", user?.id);
  }
}
