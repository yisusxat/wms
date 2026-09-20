import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AuditService } from './audit.service';
import { Request } from 'express';

@Controller('audit-logs')
@UseGuards(AuthGuard, RolesGuard)
@Roles('ADMIN')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  async getAuditLogs(
    @Req() req: Request,
    @Query('organizationId') orgId?: string,
    @Query('limit') limit = '50',
  ) {
    const activeOrgId = orgId || req.header('x-organization-id');
    return this.auditService.findAll(activeOrgId, Number(limit) || 50);
  }
}
