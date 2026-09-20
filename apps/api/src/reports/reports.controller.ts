import { Controller, Get, Query, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
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
    @Res() res: Response,
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
    @Res() res: Response,
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
    @Res() res: Response,
  ) {
    const result = await this.reports.generateBreakRiskReport(format, organizationId);
    res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
    res.setHeader("Content-Type", result.mime);
    res.send(result.buffer);
  }
}
