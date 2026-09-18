import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WarehousesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.warehouse.findMany({
      where: { active: true },
      include: {
        zones: {
          include: { aisles: { include: { racks: { include: { _count: { select: { locations: true } } } } } } },
        },
      },
      orderBy: { name: 'asc' },
    });
  }
}
