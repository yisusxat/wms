import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { IssueStockDto } from './dto/issue-stock.dto';
import { ReceiveStockDto } from './dto/receive-stock.dto';
import { TransferStockDto } from './dto/transfer-stock.dto';
import { MovementsQueryDto } from './dto/movements-query.dto';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { paginated, pagination } from '../common/pagination';

@Injectable()
export class MovementsService {
  constructor(private readonly prisma: PrismaService) {}

  private async callMovementFunction(sql: Prisma.Sql) {
    const rows = await this.prisma.$queryRaw<{ movementId: string }[]>(sql);
    return { movementId: rows[0].movementId };
  }

  async findAll(query: MovementsQueryDto) {
    const { page, pageSize, skip } = pagination(query.page, query.pageSize);
    const where: Prisma.MovementWhereInput = {
      type: query.type,
      createdAt: query.from || query.to
        ? { gte: query.from ? new Date(query.from) : undefined, lte: query.to ? new Date(query.to) : undefined }
        : undefined,
      OR: query.search
        ? [
            { reference: { contains: query.search, mode: 'insensitive' } },
            { reason: { contains: query.search, mode: 'insensitive' } },
            { product: { sku: { contains: query.search, mode: 'insensitive' } } },
            { product: { name: { contains: query.search, mode: 'insensitive' } } },
            { sourceLocation: { code: { contains: query.search, mode: 'insensitive' } } },
            { destinationLocation: { code: { contains: query.search, mode: 'insensitive' } } },
          ]
        : undefined,
    };
    const [items, total] = await Promise.all([
      this.prisma.movement.findMany({
        where,
        include: { product: true, sourceLocation: true, destinationLocation: true, user: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.movement.count({ where }),
    ]);
    return paginated(items, total, page, pageSize);
  }

  receive(data: ReceiveStockDto, userId: string) {
    return this.callMovementFunction(Prisma.sql`
      SELECT public.wms_receive_stock(
        ${data.productId}::uuid, ${data.locationId}::uuid, ${data.quantity},
        ${data.reason ?? null}, ${userId}::uuid, ${data.reference ?? null}
      ) AS "movementId"
    `);
  }

  issue(data: IssueStockDto, userId: string) {
    return this.callMovementFunction(Prisma.sql`
      SELECT public.wms_issue_stock(
        ${data.productId}::uuid, ${data.locationId}::uuid, ${data.quantity},
        ${data.reason ?? null}, ${userId}::uuid, ${data.reference ?? null}
      ) AS "movementId"
    `);
  }

  transfer(data: TransferStockDto, userId: string) {
    return this.callMovementFunction(Prisma.sql`
      SELECT public.wms_transfer_stock(
        ${data.productId}::uuid, ${data.sourceLocationId}::uuid,
        ${data.destinationLocationId}::uuid, ${data.quantity},
        ${data.reason ?? null}, ${userId}::uuid, ${data.reference ?? null}
      ) AS "movementId"
    `);
  }

  adjustment(data: AdjustStockDto, userId: string) {
    return this.callMovementFunction(Prisma.sql`
      SELECT public.wms_adjust_stock(
        ${data.productId}::uuid, ${data.locationId}::uuid, ${data.delta},
        ${data.reason ?? null}, ${userId}::uuid, ${data.reference ?? null}
      ) AS "movementId"
    `);
  }
}
