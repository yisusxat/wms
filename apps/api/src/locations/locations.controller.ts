import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { LocationsQueryDto } from './dto/locations-query.dto';
import { LocationsService } from './locations.service';

@Controller('locations')
@UseGuards(AuthGuard, RolesGuard)
export class LocationsController {
  constructor(private readonly locations: LocationsService) {}

  @Get()
  findAll(@Query() query: LocationsQueryDto) {
    return this.locations.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.locations.findOne(id);
  }
}
