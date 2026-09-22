import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    const start = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      const latencyMs = Date.now() - start;
      return {
        status: 'ok',
        service: 'wms-api',
        database: {
          status: 'connected',
          latencyMs,
        },
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      throw new ServiceUnavailableException({
        message: error?.message ?? 'Database unreachable',
        status: 'error',
        service: 'wms-api',
        database: {
          status: 'disconnected',
          error: error?.message ?? 'Database unreachable',
        },
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
      });
    }
  }
}
