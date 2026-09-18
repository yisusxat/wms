import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { InventoryQueryDto } from './dto/inventory-query.dto';
import { InventoryService } from './inventory.service';

@Controller('inventory')
@UseGuards(AuthGuard, RolesGuard)
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get()
  findAll(@Query() query: InventoryQueryDto) {
    return this.inventory.findAll(query);
  }

  @Get('location/:id')
  findByLocation(@Param('id') id: string) {
    return this.inventory.findByLocation(id);
  }

  @Get('product/:id')
  findByProduct(@Param('id') id: string) {
    return this.inventory.findByProduct(id);
  }
}
