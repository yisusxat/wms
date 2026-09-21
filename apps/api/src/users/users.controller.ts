import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { UsersService } from './users.service';
import { Request } from 'express';

@Controller('users')
@UseGuards(AuthGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  findAll(@Req() req: Request) {
    const orgId = req.header('x-organization-id');
    return this.users.findAll(orgId);
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post()
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  createUser(@Req() req: Request, @Body() body: CreateUserDto) {
    const adminId = (req as any).user.sub;
    const orgId = req.header('x-organization-id');
    return this.users.createUser(body, orgId, adminId);
  }

  @Patch(':id/role')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  updateRole(@Req() req: Request, @Param('id') id: string, @Body() body: UpdateRoleDto) {
    const adminId = (req as any).user.sub;
    return this.users.updateRole(id, body, adminId);
  }

  @Patch(':id/status')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  updateStatus(@Req() req: Request, @Param('id') id: string, @Body() body: UpdateStatusDto) {
    const adminId = (req as any).user.sub;
    return this.users.updateStatus(id, body, adminId);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  updateUser(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    const adminId = (req as any).user.sub;
    return this.users.updateProfile(id, body, adminId);
  }

  @Post('me/anonymize')
  anonymizeMe(@Req() req: Request) {
    const userId = (req as any).user.sub;
    return this.users.anonymizeUser(userId);
  }
}
