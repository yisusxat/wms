import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
@UseGuards(AuthGuard, RolesGuard)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('summary')
  summary() {
    return this.dashboard.summary();
  }

  @Get('kpis')
  kpis(
    @Query('organizationId') organizationId?: string,
    @Query('category') category?: string,
  ) {
    return this.dashboard.getKpis(organizationId, category);
  }

  @Post('refresh')
  async refresh() {
    await this.dashboard.refreshDashboardViews();
    return { success: true };
  }
}
