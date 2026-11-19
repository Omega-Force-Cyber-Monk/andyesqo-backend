import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import {
  DamageReportStatus,
  PermissionModule,
  RepairStatus,
  VehicleStatus,
} from '../generated/prisma/enums.js';
import { AccessService } from '../common/access/access.service.js';
import { AuditService } from '../common/audit/audit.service.js';
import { pageResult, paginate } from '../common/dto/pagination.dto.js';
import type { AuthUser } from '../common/types/auth-user.js';
import { nextCode } from '../common/utils/codes.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { changeVehicleStatus } from '../vehicles/vehicle-status.js';
import {
  CreateRepairDto,
  RepairQueryDto,
  RepairStatusDto,
  UpdateRepairDto,
} from './dto/repair.dto.js';
import { businessFilter } from '../common/utils/tenant.js';

const include = {
  vehicle: {
    select: {
      id: true,
      model: true,
      registration: true,
      code: true,
      depotId: true,
      status: true,
    },
  },
  reportedBy: {
    select: { id: true, firstName: true, lastName: true, role: true },
  },
  damageReport: { select: { id: true, code: true, status: true } },
} satisfies Prisma.RepairRequestInclude;
type RepairRow = Prisma.RepairRequestGetPayload<{ include: typeof include }>;

/** Allowed workflow transitions (Pending review → Approved → In progress → Completed). */
export const REPAIR_TRANSITIONS: Record<RepairStatus, RepairStatus[]> = {
  PENDING_REVIEW: [RepairStatus.APPROVED, RepairStatus.REJECTED],
  APPROVED: [RepairStatus.IN_PROGRESS, RepairStatus.REJECTED],
  IN_PROGRESS: [RepairStatus.COMPLETED],
  COMPLETED: [],
  REJECTED: [RepairStatus.PENDING_REVIEW],
};

@Injectable()
export class RepairRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly access: AccessService,
  ) {}

  private async shape(actor: AuthUser, r: RepairRow) {
    const [vehicles, inspections] = await Promise.all([
      this.access.canView(actor, PermissionModule.VEHICLES),
      this.access.canView(actor, PermissionModule.INSPECTIONS),
    ]);
    return {
      ...r,
      vehicle: vehicles
        ? {
            id: r.vehicle.id,
            model: r.vehicle.model,
            registration: r.vehicle.registration,
            code: r.vehicle.code,
          }
        : {
            id: r.vehicle.id,
            registration: r.vehicle.registration,
          },
      damageReport: inspections ? r.damageReport : null,
      estimatedTotal:
        Number(r.estimatedParts ?? 0) + Number(r.estimatedLabour ?? 0),
    };
  }

  private async vehicleScope(actor: AuthUser, businessId?: string) {
    return {
      ...businessFilter(actor, businessId),
      ...(await this.access.depotWhere(actor)),
    } satisfies Prisma.VehicleWhereInput;
  }

  async create(actor: AuthUser, dto: CreateRepairDto) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: dto.vehicleId, ...(await this.vehicleScope(actor)) },
    });
    if (!vehicle) throw new NotFoundException('Vehicle not found');
    if (
      dto.damageReportId &&
      !(await this.prisma.damageReport.findFirst({
        where: { id: dto.damageReportId, vehicleId: vehicle.id },
        select: { id: true },
      }))
    )
      throw new BadRequestException(
        'Damage report is not associated with this vehicle',
      );
    if (
      dto.inspectionId &&
      !(await this.prisma.inspection.findFirst({
        where: { id: dto.inspectionId, vehicleId: vehicle.id },
        select: { id: true },
      }))
    )
      throw new BadRequestException(
        'Inspection is not associated with this vehicle',
      );
    const code = await nextCode(this.prisma, vehicle.businessId, 'REP');
    const repair = await this.prisma.$transaction(async (tx) => {
      const created = await tx.repairRequest.create({
        data: { ...dto, code, reportedById: actor.id },
        include,
      });
      if (dto.damageReportId)
        await tx.damageReport.update({
          where: { id: dto.damageReportId },
          data: { status: DamageReportStatus.REPAIR_REQUESTED },
        });
      return created;
    });
    await this.audit.log(actor, {
      businessId: vehicle.businessId,
      action: 'Repair Request Created',
      module: 'Repairs',
      targetType: 'RepairRequest',
      targetId: repair.id,
      details: `${repair.code} for ${vehicle.registration}: ${dto.issue}`,
    });
    return this.shape(actor, repair);
  }

  async findAll(actor: AuthUser, q: RepairQueryDto) {
    const { skip, take, page, limit } = paginate(q);
    const where: Prisma.RepairRequestWhereInput = {
      vehicle: await this.vehicleScope(actor, q.businessId),
      status: q.status,
      priority: q.priority,
      vehicleId: q.vehicleId,
      ...(q.search && {
        OR: [
          { code: { contains: q.search, mode: 'insensitive' } },
          { issue: { contains: q.search, mode: 'insensitive' } },
          {
            vehicle: {
              registration: { contains: q.search, mode: 'insensitive' },
            },
          },
        ],
      }),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.repairRequest.findMany({
        where,
        skip,
        take,
        include,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.repairRequest.count({ where }),
    ]);
    return pageResult(
      await Promise.all(items.map((r) => this.shape(actor, r))),
      total,
      page,
      limit,
    );
  }

  async stats(actor: AuthUser, businessId?: string) {
    const groups = await this.prisma.repairRequest.groupBy({
      by: ['status'],
      where: { vehicle: await this.vehicleScope(actor, businessId) },
      _count: { _all: true },
    });
    const n = (s: RepairStatus) =>
      groups.find((g) => g.status === s)?._count._all ?? 0;
    return {
      pendingReview: n('PENDING_REVIEW'),
      approved: n('APPROVED'),
      inProgress: n('IN_PROGRESS'),
      completed: n('COMPLETED'),
      rejected: n('REJECTED'),
    };
  }

  private async getRaw(actor: AuthUser, id: string) {
    const r = await this.prisma.repairRequest.findFirst({
      where: { id, vehicle: await this.vehicleScope(actor) },
      include,
    });
    if (!r) throw new NotFoundException('Repair request not found');
    return r;
  }

  async findOne(actor: AuthUser, id: string) {
    return this.shape(actor, await this.getRaw(actor, id));
  }

  async update(actor: AuthUser, id: string, dto: UpdateRepairDto) {
    const r = await this.getRaw(actor, id);
    if (
      r.status === RepairStatus.COMPLETED ||
      r.status === RepairStatus.REJECTED
    )
      throw new BadRequestException('Closed repair requests cannot be edited');
    return this.shape(
      actor,
      await this.prisma.repairRequest.update({
        where: { id },
        data: dto,
        include,
      }),
    );
  }

  /** Approve / start / complete / reject; keeps vehicle + damage report status in sync. */
  async setStatus(actor: AuthUser, id: string, dto: RepairStatusDto) {
    const r = await this.getRaw(actor, id);
    if (!REPAIR_TRANSITIONS[r.status].includes(dto.status))
      throw new BadRequestException(
        `Cannot change repair status from ${r.status} to ${dto.status}`,
      );
    const now = new Date();
    const vehicleStatus =
      dto.status === RepairStatus.IN_PROGRESS
        ? VehicleStatus.MAINTENANCE
        : dto.status === RepairStatus.COMPLETED
          ? VehicleStatus.AVAILABLE
          : null;
    const updated = await this.prisma.$transaction(async (tx) => {
      // Conditional update prevents two concurrent transitions from both applying.
      const claimed = await tx.repairRequest.updateMany({
        where: { id, status: r.status },
        data: {
          status: dto.status,
          actualCost: dto.actualCost,
          approvedAt: dto.status === RepairStatus.APPROVED ? now : undefined,
          completedAt: dto.status === RepairStatus.COMPLETED ? now : undefined,
        },
      });
      if (!claimed.count)
        throw new ConflictException('Repair request was changed concurrently');
      if (vehicleStatus)
        await changeVehicleStatus(tx, {
          vehicleId: r.vehicleId,
          status: vehicleStatus,
          reason: `Repair ${r.code} ${dto.status === RepairStatus.COMPLETED ? 'completed' : 'in progress'}`,
          actorId: actor.id,
        });
      if (dto.status === RepairStatus.COMPLETED && r.damageReportId)
        await tx.damageReport.update({
          where: { id: r.damageReportId },
          data: { status: DamageReportStatus.RESOLVED },
        });
      return tx.repairRequest.findUniqueOrThrow({ where: { id }, include });
    });
    const v = await this.prisma.vehicle.findUniqueOrThrow({
      where: { id: r.vehicleId },
      select: { businessId: true },
    });
    await this.audit.log(actor, {
      businessId: v.businessId,
      action:
        dto.status === RepairStatus.APPROVED
          ? 'Approved Repair Request'
          : `Repair ${dto.status}`,
      module: 'Repairs',
      targetType: 'RepairRequest',
      targetId: id,
      details: r.code,
    });
    return this.shape(actor, updated);
  }
}
