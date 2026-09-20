import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type LogActionParams = {
  organizationId?: string;
  userId?: string;
  action: string;
  entity: string;
  entityId?: string;
  details?: Record<string, any>;
  ip?: string;
  userAgent?: string;
};

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(params: LogActionParams): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          organizationId: params.organizationId,
          userId: params.userId,
          action: params.action,
          entity: params.entity,
          entityId: params.entityId,
          details: params.details,
          ip: params.ip,
          userAgent: params.userAgent,
        },
      });
      this.logger.log(`Audit logged: ${params.action} on ${params.entity} (${params.entityId || '-'})`);
    } catch (err) {
      this.logger.error(`Failed to record audit log for ${params.action}`, err);
    }
  }

  async findAll(organizationId?: string, limit = 50) {
    return this.prisma.auditLog.findMany({
      where: organizationId ? { organizationId } : {},
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        user: {
          select: { id: true, name: true, role: true },
        },
      },
    });
  }
}
