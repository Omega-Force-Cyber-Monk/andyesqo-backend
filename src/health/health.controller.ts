import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ApiData } from '../common/swagger/swagger.js';
import { Health } from '../common/swagger/responses.dto.js';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Health check (database connectivity)' })
  @ApiData(Health)
  async check() {
    const started = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException({
        status: 'error',
        database: 'down',
      });
    }
    return {
      status: 'ok',
      database: 'up',
      dbLatencyMs: Date.now() - started,
      uptimeSec: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}
