import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { LocationsQueryDto } from './dto/locations-query.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
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

  @Patch(':id')
  @Roles('ADMIN', 'SUPERVISOR', 'OPERATOR')
  update(@Param('id') id: string, @Body() body: UpdateLocationDto) {
    return this.locations.update(id, body);
  }
}
