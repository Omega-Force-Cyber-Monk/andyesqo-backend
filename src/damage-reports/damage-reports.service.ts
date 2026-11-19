import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import {
  DamageReportStatus,
  NotificationType,
  PermissionModule,
  Severity,
  UserRole,
  VehicleStatus,
} from '../generated/prisma/enums.js';
import { AuditService } from '../common/audit/audit.service.js';
import { pageResult, paginate } from '../common/dto/pagination.dto.js';
import { NotifyService } from '../common/notify/notify.service.js';
import type { AuthUser } from '../common/types/auth-user.js';
import { nextCode } from '../common/utils/codes.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AccessService } from '../common/access/access.service.js';
import { RepairFieldsDto } from '../repair-requests/dto/repair.dto.js';
import { RepairRequestsService } from '../repair-requests/repair-requests.service.js';
import { VehiclesService } from '../vehicles/vehicles.service.js';
import {
  AssessDamageDto,
  CreateDamageReportDto,
  DamageQueryDto,
} from './dto/damage-report.dto.js';
import { businessFilter } from '../common/utils/tenant.js';

const include = {
  vehicle: {
    select: {
      id: true,
      model: true,
      registration: true,
      code: true,
      depotId: true,
      depot: { select: { name: true } },
    },
  },
  reportedBy: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      employeeId: true,
      depotId: true,
    },
  },
  reviewedBy: {
    select: { id: true, firstName: true, lastName: true, depotId: true },
  },
  damageType: true,
  repairRequests: { select: { id: true, code: true, status: true } },
} satisfies Prisma.DamageReportInclude;
type DamageRow = Prisma.DamageReportGetPayload<{ include: typeof include }>;
type Visibility = {
  actor: AuthUser;
  depots: string[] | null;
  drivers: boolean;
  vehicles: boolean;
  repairs: boolean;
};

@Injectable()
export class DamageReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vehicles: VehiclesService,
    private readonly repairs: RepairRequestsService,
    private readonly notify: NotifyService,
    private readonly audit: AuditService,
    private readonly access: AccessService,
  ) {}

  private async visibility(actor: AuthUser): Promise<Visibility> {
    const [depots, drivers, vehicles, repairs] = await Promise.all([
      this.access.depotScope(actor),
      this.access.canView(actor, PermissionModule.DRIVERS),
      this.access.canView(actor, PermissionModule.VEHICLES),
      this.access.canView(actor, PermissionModule.REPAIRS),
    ]);
    return { actor, depots, drivers, vehicles, repairs };
  }

  private shape(row: DamageRow, visibility: Visibility) {
    const inScope = (depotId: string | null) =>
      visibility.depots === null ||
      (!!depotId && visibility.depots.includes(depotId));
    const reporter =
      row.reportedBy.id === visibility.actor.id ||
      (visibility.drivers && inScope(row.reportedBy.depotId));
    const reviewer =
      row.reviewedBy &&
      (row.reviewedBy.id === visibility.actor.id ||
        (visibility.drivers && inScope(row.reviewedBy.depotId)));
    const vehicle = visibility.vehicles && inScope(row.vehicle.depotId);
    return {
      ...row,
      reportedById: reporter ? row.reportedById : null,
      reportedBy: reporter
        ? {
            id: row.reportedBy.id,
            firstName: row.reportedBy.firstName,
            lastName: row.reportedBy.lastName,
            employeeId: row.reportedBy.employeeId,
          }
        : null,
      reviewedById: reviewer ? row.reviewedById : null,
      reviewedBy: reviewer
        ? {
            id: row.reviewedBy!.id,
            firstName: row.reviewedBy!.firstName,
            lastName: row.reviewedBy!.lastName,
          }
        : null,
      vehicleId: vehicle ? row.vehicleId : null,
      vehicle: vehicle
        ? {
            id: row.vehicle.id,
            model: row.vehicle.model,
            registration: row.vehicle.registration,
            code: row.vehicle.code,
            depot: row.vehicle.depot,
          }
        : null,
      repairRequests: visibility.repairs ? row.repairRequests : undefined,
    };
  }

  async create(actor: AuthUser, dto: CreateDamageReportDto) {
    const existing = await this.vehicles.assertAccessible(actor, dto.vehicleId);
    const vehicleWhere = await this.vehicles.accessWhere(actor, dto.vehicleId);
    const code = await nextCode(this.prisma, existing.businessId, 'DR', 2000);
    const { report, vehicle } = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Vehicle" WHERE id = ${dto.vehicleId} FOR UPDATE`;
      const vehicle = await tx.vehicle.findFirst({ where: vehicleWhere });
      if (!vehicle) throw new NotFoundException('Vehicle not found');
      if (
        dto.inspectionId &&
        !(await tx.inspection.findFirst({
          where: {
            id: dto.inspectionId,
            vehicleId: vehicle.id,
            driverId: actor.id,
          },
          select: { id: true },
        }))
      )
        throw new BadRequestException(
          'Inspection is not associated with this user and vehicle',
        );
      const damageType = dto.damageTypeId
        ? await tx.damageType.findFirst({
            where: { id: dto.damageTypeId, businessId: vehicle.businessId },
          })
        : null;
      if (dto.damageTypeId && !damageType)
        throw new BadRequestException(
          'Damage type is outside the vehicle business',
        );
      const report = await tx.damageReport.create({
        data: {
          ...dto,
          noticedAt: dto.noticedAt ? new Date(dto.noticedAt) : new Date(),
          photos: dto.photos ?? [],
          odometerKm: dto.odometerKm ?? vehicle.odometerKm,
          code,
          reportedById: actor.id,
          status: DamageReportStatus.UNDER_REVIEW,
        },
        include,
      });
      if (
        (dto.severity === Severity.UNSAFE || damageType?.autoGroundVehicle) &&
        vehicle.status !== VehicleStatus.GROUNDED
      ) {
        const reason = `Damage report ${report.code}`;
        await tx.vehicle.update({
          where: { id: vehicle.id },
          data: { status: VehicleStatus.GROUNDED },
        });
        await tx.vehicleStatusLog.create({
          data: {
            vehicleId: vehicle.id,
            fromStatus: vehicle.status,
            toStatus: VehicleStatus.GROUNDED,
            reason,
            changedById: actor.id,
          },
        });
        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            businessId: vehicle.businessId,
            action: 'Grounded Vehicle (Red-Tag)',
            module: 'Fleet & Safety',
            targetType: 'Vehicle',
            targetId: vehicle.id,
            details: `${vehicle.registration}: ${vehicle.status} → ${VehicleStatus.GROUNDED} (${reason})`,
          },
        });
      }
      return { report, vehicle };
    });
    await this.notify.toRoles(
      vehicle.businessId,
      [UserRole.FLEET_MANAGER, UserRole.SUPERVISOR],
      NotificationType.DAMAGE,
      'New Damage Report',
      `${vehicle.model} (${vehicle.registration}): ${dto.description}`,
      { damageReportId: report.id },
    );
    return this.shape(report, await this.visibility(actor));
  }

  async findAll(actor: AuthUser, q: DamageQueryDto, onlyMine = false) {
    const { skip, take, page, limit } = paginate(q);
    const visibility = await this.visibility(actor);
    const field =
      actor.role === UserRole.DRIVER || actor.role === UserRole.ASSISTANT;
    if (q.vehicleId && !visibility.vehicles)
      throw new BadRequestException(
        'Vehicle permission required for this filter',
      );
    const where: Prisma.DamageReportWhereInput = {
      vehicle: {
        ...businessFilter(actor, q.businessId),
        ...(visibility.depots !== null && {
          depotId: { in: visibility.depots },
        }),
      },
      status: q.status,
      vehicleId: q.vehicleId,
      reportedById: onlyMine || field ? actor.id : undefined,
      ...(q.search && {
        OR: [
          { code: { contains: q.search, mode: 'insensitive' } },
          {
            vehicle: {
              registration: { contains: q.search, mode: 'insensitive' },
            },
          },
          ...(visibility.drivers
            ? [
                {
                  reportedBy: {
                    firstName: {
                      contains: q.search,
                      mode: 'insensitive' as const,
                    },
                    ...(visibility.depots !== null && {
                      depotId: { in: visibility.depots },
                    }),
                  },
                },
              ]
            : []),
        ],
      }),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.damageReport.findMany({
        where,
        skip,
        take,
        include,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.damageReport.count({ where }),
    ]);
    return pageResult(
      items.map((item) => this.shape(item, visibility)),
      total,
      page,
      limit,
    );
  }

  /** Total / Needs Review / Grounded / Repaired & Cleared. */
  async stats(actor: AuthUser, businessId?: string) {
    await this.access.assertPermission(
      actor,
      PermissionModule.INSPECTIONS,
      'view',
    );
    const depotIds = await this.access.depotScope(actor);
    const groups = await this.prisma.damageReport.groupBy({
      by: ['status'],
      where: {
        vehicle: {
          ...businessFilter(actor, businessId),
          ...(depotIds !== null && { depotId: { in: depotIds } }),
        },
      },
      _count: { _all: true },
    });
    const n = (...s: DamageReportStatus[]) =>
      groups
        .filter((g) => s.includes(g.status))
        .reduce((sum, g) => sum + g._count._all, 0);
    return {
      total: groups.reduce((sum, g) => sum + g._count._all, 0),
      needsReview: n('SUBMITTED', 'UNDER_REVIEW'),
      grounded: n('GROUNDED'),
      repairRequested: n('REPAIR_REQUESTED'),
      resolved: n('RESOLVED'),
    };
  }

  private async getRaw(actor: AuthUser, id: string) {
    const depotIds = await this.access.depotScope(actor);
    const field =
      actor.role === UserRole.DRIVER || actor.role === UserRole.ASSISTANT;
    const r = await this.prisma.damageReport.findFirst({
      where: {
        id,
        vehicle: {
          ...businessFilter(actor),
          ...(depotIds !== null && { depotId: { in: depotIds } }),
        },
        ...(field && { reportedById: actor.id }),
      },
      include,
    });
    if (!r) throw new NotFoundException('Damage report not found');
    return r;
  }

  async findOne(actor: AuthUser, id: string) {
    const [report, visibility] = await Promise.all([
      this.getRaw(actor, id),
      this.visibility(actor),
    ]);
    return this.shape(report, visibility);
  }

  async assess(actor: AuthUser, id: string, dto: AssessDamageDto) {
    await this.getRaw(actor, id);
    const depots = await this.access.depotScope(actor);
    const updated = await this.prisma.damageReport.updateMany({
      where: {
        id,
        vehicle: {
          ...businessFilter(actor),
          ...(depots !== null && { depotId: { in: depots } }),
        },
      },
      data: { ...dto, reviewedById: actor.id, reviewedAt: new Date() },
    });
    if (!updated.count) throw new NotFoundException('Damage report not found');
    return this.findOne(actor, id);
  }

  async approve(actor: AuthUser, id: string) {
    await this.getRaw(actor, id);
    const depots = await this.access.depotScope(actor);
    const updated = await this.prisma.damageReport.updateMany({
      where: {
        id,
        vehicle: {
          ...businessFilter(actor),
          ...(depots !== null && { depotId: { in: depots } }),
        },
      },
      data: {
        status: DamageReportStatus.APPROVED,
        reviewedById: actor.id,
        reviewedAt: new Date(),
      },
    });
    if (!updated.count) throw new NotFoundException('Damage report not found');
    return this.findOne(actor, id);
  }

  async ground(actor: AuthUser, id: string, reason?: string) {
    const r = await this.getRaw(actor, id);
    await this.vehicles.setStatus(
      actor,
      r.vehicleId,
      VehicleStatus.GROUNDED,
      reason ?? `Damage report ${r.code}`,
    );
    const depots = await this.access.depotScope(actor);
    const updated = await this.prisma.damageReport.updateMany({
      where: {
        id,
        vehicle: {
          ...businessFilter(actor),
          ...(depots !== null && { depotId: { in: depots } }),
        },
      },
      data: {
        status: DamageReportStatus.GROUNDED,
        reviewedById: actor.id,
        reviewedAt: new Date(),
      },
    });
    if (!updated.count) throw new NotFoundException('Damage report not found');
    return this.findOne(actor, id);
  }

  /** "Create Repair Request" from a damage report. */
  async createRepair(
    actor: AuthUser,
    id: string,
    dto: Partial<RepairFieldsDto>,
  ) {
    await this.access.assertPermission(actor, PermissionModule.REPAIRS, 'edit');
    const r = await this.getRaw(actor, id);
    return this.repairs.create(actor, {
      vehicleId: r.vehicleId,
      damageReportId: r.id,
      issue:
        dto.issue ??
        `${r.damageType?.name ?? 'Damage'}: ${r.locations.join(', ')}`,
      description: dto.description ?? r.description,
      priority: dto.priority,
      provider: dto.provider,
      estimatedParts:
        dto.estimatedParts ??
        (r.estimatedParts ? Number(r.estimatedParts) : undefined),
      estimatedLabour:
        dto.estimatedLabour ??
        (r.estimatedLabour ? Number(r.estimatedLabour) : undefined),
    });
  }
}
