import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { paginated, pagination } from '../common/pagination';
import { InventoryQueryDto } from './dto/inventory-query.dto';

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: InventoryQueryDto) {
    const { page, pageSize, skip } = pagination(query.page, query.pageSize);
    const where: Prisma.InventoryWhereInput = {
      productId: query.productId,
      locationId: query.locationId,
      OR: query.search
        ? [
            { product: { sku: { contains: query.search, mode: 'insensitive' } } },
            { product: { name: { contains: query.search, mode: 'insensitive' } } },
            { location: { code: { contains: query.search, mode: 'insensitive' } } },
          ]
        : undefined,
      location: {
        rack: {
          code: query.rack ? { equals: query.rack, mode: 'insensitive' } : undefined,
          aisle: query.aisle ? { code: { equals: query.aisle, mode: 'insensitive' } } : undefined,
        },
      },
    };
    const [items, total] = await Promise.all([
      this.prisma.inventory.findMany({
        where,
        include: { product: true, location: { include: { rack: { include: { aisle: true } } } } },
        orderBy: [{ location: { code: 'asc' } }, { product: { name: 'asc' } }],
        skip,
        take: pageSize,
      }),
      this.prisma.inventory.count({ where }),
    ]);
    return paginated(items, total, page, pageSize);
  }

  findByLocation(locationId: string) {
    return this.prisma.inventory.findMany({
      where: { locationId },
      include: { product: true, location: true },
      orderBy: { product: { name: 'asc' } },
    });
  }

  findByProduct(productId: string) {
    return this.prisma.inventory.findMany({
      where: { productId },
      include: { product: true, location: { include: { rack: { include: { aisle: true } } } } },
      orderBy: { location: { code: 'asc' } },
    });
  }
}
