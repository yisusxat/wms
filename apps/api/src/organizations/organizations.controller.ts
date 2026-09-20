import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { OrganizationsService } from './organizations.service';
import { Request } from 'express';

class CreateOrgDto {
  name!: string;
  slug?: string;
}

@Controller('organizations')
@UseGuards(AuthGuard)
export class OrganizationsController {
  constructor(private readonly orgService: OrganizationsService) {}

  @Get()
  async list(@Req() req: Request) {
    const userId = (req as any).user.sub;
    return this.orgService.getUserOrganizations(userId);
  }

  @Get('current')
  async getCurrent(@Req() req: Request) {
    const userId = (req as any).user.sub;
    const requestedOrgId = req.header('x-organization-id');
    return this.orgService.getCurrentOrganization(userId, requestedOrgId);
  }

  @Post()
  async create(@Req() req: Request, @Body() body: CreateOrgDto) {
    const userId = (req as any).user.sub;
    return this.orgService.createOrganization(userId, body.name, body.slug);
  }

  @Get('members')
  async listMembers(@Req() req: Request) {
    const userId = (req as any).user.sub;
    const current = await this.orgService.getCurrentOrganization(userId, req.header('x-organization-id'));
    return this.orgService.getMembers(current.id);
  }
}
