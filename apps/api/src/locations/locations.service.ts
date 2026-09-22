import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { paginated, pagination } from '../common/pagination';
import { LocationsQueryDto } from './dto/locations-query.dto';

import { UpdateLocationDto } from './dto/update-location.dto';

@Injectable()
export class LocationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: LocationsQueryDto) {
    const { page, pageSize, skip } = pagination(query.page, query.pageSize);
    const where: Prisma.LocationWhereInput = {
      status: query.status,
      level: query.level,
      OR: query.search
        ? [
            { code: { contains: query.search, mode: 'insensitive' } },
            { rack: { code: { contains: query.search, mode: 'insensitive' } } },
          ]
        : undefined,
      rack: {
        code: query.rack ? { equals: query.rack, mode: 'insensitive' } : undefined,
        aisle: query.aisle
          ? { code: { equals: query.aisle, mode: 'insensitive' } }
          : undefined,
      },
    };
    const [items, total] = await Promise.all([
      this.prisma.location.findMany({
        where,
        include: { rack: { include: { aisle: { include: { zone: { include: { warehouse: true } } } } } } },
        orderBy: { code: 'asc' },
        skip,
        take: pageSize,
      }),
      this.prisma.location.count({ where }),
    ]);
    return paginated(items, total, page, pageSize);
  }

  findOne(id: string) {
    return this.prisma.location.findUniqueOrThrow({
      where: { id },
      include: {
        rack: { include: { aisle: { include: { zone: { include: { warehouse: true } } } } } },
        inventory: { include: { product: true }, orderBy: { createdAt: 'asc' } },
      },
    });
  }

  async update(idOrCode: string, body: UpdateLocationDto) {
    const isIdUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrCode);
    const where = isIdUuid ? { id: idOrCode } : { code: idOrCode };
    return this.prisma.location.update({
      where,
      data: { status: body.status },
      include: {
        rack: { include: { aisle: { include: { zone: { include: { warehouse: true } } } } } },
      },
    });
  }
}
