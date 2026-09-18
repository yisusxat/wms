import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { WarehousesService } from './warehouses.service';

@Controller('warehouses')
@UseGuards(AuthGuard, RolesGuard)
export class WarehousesController {
  constructor(private readonly warehouses: WarehousesService) {}

  @Get()
  findAll() {
    return this.warehouses.findAll();
  }
}
