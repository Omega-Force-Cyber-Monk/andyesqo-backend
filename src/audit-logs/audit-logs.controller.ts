import {
  Controller,
  Get,
  Header,
  Injectable,
  Module,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, IsUUID } from 'class-validator';
import { Prisma } from '../generated/prisma/client.js';
import { PermissionModule, UserRole } from '../generated/prisma/enums.js';
import { RequirePermission } from '../common/access/permission.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { RawResponse } from '../common/decorators/raw-response.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { BusinessQueryDto } from '../common/dto/business-query.dto.js';
import { pageResult, paginate } from '../common/dto/pagination.dto.js';
import type { AuthUser } from '../common/types/auth-user.js';
import { toCsv } from '../common/utils/csv.js';
import { businessFilter, dayOf, dayRange } from '../common/utils/tenant.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ApiCsv, ApiPage } from '../common/swagger/swagger.js';
import { AuditLogModel } from '../common/swagger/entities.dto.js';

export class AuditQueryDto extends BusinessQueryDto {
  @IsOptional() @IsString() module?: string;
  @IsOptional() @IsUUID() actorId?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}

@Injectable()
export class AuditLogsService {
  constructor(private readonly prisma: PrismaService) {}

  private where(actor: AuthUser, q: AuditQueryDto): Prisma.AuditLogWhereInput {
    return {
      ...businessFilter(actor, q.businessId),
      module: q.module,
      actorId: q.actorId,
      createdAt: {
        gte: q.from ? dayRange(dayOf(q.from)).gte : undefined,
        lte: q.to ? dayRange(dayOf(q.to)).lte : undefined,
      },
      ...(q.search && {
        OR: [
          { action: { contains: q.search, mode: 'insensitive' } },
          { details: { contains: q.search, mode: 'insensitive' } },
          { actor: { firstName: { contains: q.search, mode: 'insensitive' } } },
          { business: { name: { contains: q.search, mode: 'insensitive' } } },
        ],
      }),
    };
  }

  private include = {
    actor: {
      select: { id: true, firstName: true, lastName: true, role: true },
    },
    business: { select: { id: true, name: true } },
  } satisfies Prisma.AuditLogInclude;

  async list(actor: AuthUser, q: AuditQueryDto) {
    const { skip, take, page, limit } = paginate(q);
    const where = this.where(actor, q);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        skip,
        take,
        include: this.include,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return pageResult(items, total, page, limit);
  }

  async csv(actor: AuthUser, q: AuditQueryDto) {
    const rows = await this.prisma.auditLog.findMany({
      where: this.where(actor, q),
      include: this.include,
      orderBy: { createdAt: 'desc' },
      take: 10000,
    });
    return toCsv(
      rows.map((r) => ({
        timestamp: r.createdAt,
        actor: r.actor
          ? `${r.actor.firstName} ${r.actor.lastName ?? ''}`.trim()
          : 'System',
        role: r.actor?.role,
        business: r.business?.name,
        action: r.action,
        module: r.module,
        details: r.details,
        ip: r.ip,
      })),
    );
  }
}

@ApiTags('Audit Logs')
@ApiBearerAuth()
@Roles(UserRole.BUSINESS_ADMIN)
@Controller('audit-logs')
export class AuditLogsController {
  constructor(private readonly audit: AuditLogsService) {}

  @Get()
  @RequirePermission(PermissionModule.AUDIT, 'view')
  @ApiOperation({
    summary:
      'Governance audit trail (business) / Platform Activity (super admin)',
  })
  @ApiPage(AuditLogModel)
  list(@CurrentUser() user: AuthUser, @Query() q: AuditQueryDto) {
    return this.audit.list(user, q);
  }

  @Get('export')
  @RequirePermission(PermissionModule.AUDIT, 'view')
  @RawResponse()
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="audit-log.csv"')
  @ApiOperation({ summary: 'Export the audit log as CSV' })
  @ApiCsv()
  export(@CurrentUser() user: AuthUser, @Query() q: AuditQueryDto) {
    return this.audit.csv(user, q);
  }
}

@Module({ controllers: [AuditLogsController], providers: [AuditLogsService] })
export class AuditLogsModule {}
