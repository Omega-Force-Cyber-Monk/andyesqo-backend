import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import {
  MaintenanceStatus,
  ShiftStatus,
  VehicleStatus,
} from '../generated/prisma/enums.js';
import { AccessService } from '../common/access/access.service.js';
import { changeVehicleStatus } from '../vehicles/vehicle-status.js';
import { AuditService } from '../common/audit/audit.service.js';
import { pageResult, paginate } from '../common/dto/pagination.dto.js';
import type { AuthUser } from '../common/types/auth-user.js';
import { businessFilter, dayOf, localDate } from '../common/utils/tenant.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  CreateMaintenanceDto,
  MaintenanceQueryDto,
  MaintenanceStatusDto,
  UpdateMaintenanceDto,
} from './dto/maintenance.dto.js';

const include = {
  vehicle: {
    select: {
      id: true,
      model: true,
      registration: true,
      code: true,
      bodyType: true,
    },
  },
  depot: { select: { id: true, name: true } },
  tasks: true,
} satisfies Prisma.MaintenanceInclude;

const withTotal = <
  T extends { estimatedParts: unknown; estimatedLabour: unknown },
>(
  m: T,
) => ({
  ...m,
  estimatedTotal:
    Number(m.estimatedParts ?? 0) + Number(m.estimatedLabour ?? 0),
});

/** Allowed maintenance workflow transitions. */
export const MAINTENANCE_TRANSITIONS: Record<
  MaintenanceStatus,
  MaintenanceStatus[]
> = {
  SCHEDULED: [MaintenanceStatus.IN_PROGRESS, MaintenanceStatus.CANCELLED],
  OVERDUE: [MaintenanceStatus.IN_PROGRESS, MaintenanceStatus.CANCELLED],
  IN_PROGRESS: [MaintenanceStatus.COMPLETED, MaintenanceStatus.CANCELLED],
  // Actual cost can be recorded after completion.
  COMPLETED: [MaintenanceStatus.COMPLETED],
  CANCELLED: [MaintenanceStatus.SCHEDULED],
};

@Injectable()
export class MaintenanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly access: AccessService,
  ) {}

  /** Tenant + depot scope applied through the maintained vehicle. */
  private async vehicleScope(actor: AuthUser, businessId?: string) {
    return {
      ...businessFilter(actor, businessId),
      ...(await this.access.depotWhere(actor)),
    } satisfies Prisma.VehicleWhereInput;
  }

  private async scopedVehicle(actor: AuthUser, vehicleId: string) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, ...(await this.vehicleScope(actor)) },
    });
    if (!vehicle) throw new NotFoundException('Vehicle not found');
    return vehicle;
  }

  private async validateDepot(
    actor: AuthUser,
    businessId: string,
    depotId: string | null | undefined,
  ) {
    if (!depotId) return;
    await this.access.assertDepot(actor, depotId);
    if (
      !(await this.prisma.depot.findFirst({
        where: { id: depotId, businessId },
        select: { id: true },
      }))
    )
      throw new BadRequestException('Depot is outside the vehicle business');
  }

  /** Step "Vehicle Availability Check": shift overlaps on that date + next scheduled shift. */
  async availabilityCheck(actor: AuthUser, vehicleId: string, date: string) {
    const vehicle = await this.scopedVehicle(actor, vehicleId);
    const day = dayOf(date);
    const active = { not: ShiftStatus.CANCELLED };
    const [overlaps, nextShift] = await this.prisma.$transaction([
      this.prisma.shift.findMany({
        where: { vehicleId, date: day, status: active },
      }),
      this.prisma.shift.findFirst({
        where: { vehicleId, date: { gt: day }, status: active },
        orderBy: { date: 'asc' },
      }),
    ]);
    return {
      vehicle: {
        id: vehicle.id,
        registration: vehicle.registration,
        status: vehicle.status,
      },
      available: overlaps.length === 0,
      overlaps,
      nextShift,
    };
  }

  async create(actor: AuthUser, dto: CreateMaintenanceDto) {
    const vehicle = await this.scopedVehicle(actor, dto.vehicleId);
    await this.validateDepot(actor, vehicle.businessId, dto.depotId);
    const { tasks, scheduledDate, ...rest } = dto;
    const m = await this.prisma.$transaction(async (tx) => {
      const created = await tx.maintenance.create({
        data: {
          ...rest,
          depotId: rest.depotId ?? vehicle.depotId,
          scheduledDate: new Date(scheduledDate),
          tasks: tasks?.length
            ? { create: tasks.map((title) => ({ title })) }
            : undefined,
        },
        include,
      });
      // Keep the vehicle's next service date at the earliest open booking.
      await tx.vehicle.updateMany({
        where: {
          id: vehicle.id,
          OR: [
            { nextServiceDate: null },
            { nextServiceDate: { gt: created.scheduledDate } },
          ],
        },
        data: { nextServiceDate: created.scheduledDate },
      });
      return created;
    });
    await this.audit.log(actor, {
      businessId: vehicle.businessId,
      action: 'Maintenance Scheduled',
      module: 'Fleet & Safety',
      targetType: 'Maintenance',
      targetId: m.id,
      details: `${vehicle.registration}: ${m.type} on ${scheduledDate}`,
    });
    return withTotal(m);
  }

  /** Flag SCHEDULED items whose date has passed as OVERDUE (within the caller's tenant). */
  private markOverdue(actor: AuthUser, businessId?: string) {
    return this.prisma.maintenance.updateMany({
      where: {
        vehicle: businessFilter(actor, businessId),
        status: MaintenanceStatus.SCHEDULED,
        scheduledDate: { lt: localDate() },
      },
      data: { status: MaintenanceStatus.OVERDUE },
    });
  }

  async findAll(actor: AuthUser, q: MaintenanceQueryDto) {
    await this.markOverdue(actor, q.businessId);
    const { skip, take, page, limit } = paginate(q);
    let range: Prisma.DateTimeFilter | undefined;
    if (q.month) {
      const [y, mo] = q.month.split('-').map(Number);
      range = {
        gte: new Date(Date.UTC(y, mo - 1, 1)),
        lt: new Date(Date.UTC(y, mo, 1)),
      };
    }
    const where: Prisma.MaintenanceWhereInput = {
      vehicle: await this.vehicleScope(actor, q.businessId),
      status: q.status,
      type: q.type,
      priority: q.priority,
      vehicleId: q.vehicleId,
      scheduledDate: range,
      ...(q.search && {
        OR: [
          {
            vehicle: {
              registration: { contains: q.search, mode: 'insensitive' },
            },
          },
          { vehicle: { model: { contains: q.search, mode: 'insensitive' } } },
          { providerName: { contains: q.search, mode: 'insensitive' } },
        ],
      }),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.maintenance.findMany({
        where,
        skip,
        take,
        include,
        orderBy: { scheduledDate: 'asc' },
      }),
      this.prisma.maintenance.count({ where }),
    ]);
    return pageResult(items.map(withTotal), total, page, limit);
  }

  /** Scheduled / Overdue / In Progress / Completed (this month). */
  async stats(actor: AuthUser, businessId?: string) {
    await this.markOverdue(actor, businessId);
    const scope = { vehicle: await this.vehicleScope(actor, businessId) };
    const now = new Date();
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const [scheduled, overdue, inProgress, completed] =
      await this.prisma.$transaction([
        this.prisma.maintenance.count({
          where: { ...scope, status: 'SCHEDULED' },
        }),
        this.prisma.maintenance.count({
          where: { ...scope, status: 'OVERDUE' },
        }),
        this.prisma.maintenance.count({
          where: { ...scope, status: 'IN_PROGRESS' },
        }),
        this.prisma.maintenance.count({
          where: {
            ...scope,
            status: 'COMPLETED',
            completedAt: { gte: monthStart },
          },
        }),
      ]);
    return { scheduled, overdue, inProgress, completedThisMonth: completed };
  }

  async upcoming(actor: AuthUser, businessId?: string, days = 14) {
    await this.markOverdue(actor, businessId);
    const items = await this.prisma.maintenance.findMany({
      where: {
        vehicle: await this.vehicleScope(actor, businessId),
        status: { in: ['SCHEDULED', 'OVERDUE'] },
        scheduledDate: {
          lte: new Date(localDate().getTime() + days * 86400000),
        },
      },
      include,
      orderBy: { scheduledDate: 'asc' },
      take: 10,
    });
    return items.map(withTotal);
  }

  async findOne(actor: AuthUser, id: string) {
    const m = await this.prisma.maintenance.findFirst({
      where: { id, vehicle: await this.vehicleScope(actor) },
      include,
    });
    if (!m) throw new NotFoundException('Maintenance not found');
    return withTotal(m);
  }

  async update(actor: AuthUser, id: string, dto: UpdateMaintenanceDto) {
    const m = await this.findOne(actor, id);
    this.assertOpen(m.status);
    const v = await this.prisma.vehicle.findUniqueOrThrow({
      where: { id: m.vehicleId },
      select: { businessId: true },
    });
    await this.validateDepot(actor, v.businessId, dto.depotId);
    const { scheduledDate, ...rest } = dto;
    return withTotal(
      await this.prisma.maintenance.update({
        where: { id },
        data: {
          ...rest,
          scheduledDate: scheduledDate ? new Date(scheduledDate) : undefined,
        },
        include,
      }),
    );
  }

  private assertOpen(status: MaintenanceStatus) {
    if (
      status === MaintenanceStatus.COMPLETED ||
      status === MaintenanceStatus.CANCELLED
    )
      throw new BadRequestException('Closed maintenance cannot be edited');
  }

  async addTask(actor: AuthUser, id: string, title: string) {
    this.assertOpen((await this.findOne(actor, id)).status);
    if (!title?.trim()) throw new BadRequestException('Task title is required');
    return this.prisma.maintenanceTask.create({
      data: { maintenanceId: id, title: title.trim() },
    });
  }

  async toggleTask(actor: AuthUser, id: string, taskId: string, done: boolean) {
    await this.findOne(actor, id);
    const changed = await this.prisma.maintenanceTask.updateMany({
      where: { id: taskId, maintenanceId: id },
      data: { done },
    });
    if (!changed.count) throw new NotFoundException('Task not found');
    return this.prisma.maintenanceTask.findUniqueOrThrow({
      where: { id: taskId },
    });
  }

  async removeTask(actor: AuthUser, id: string, taskId: string) {
    this.assertOpen((await this.findOne(actor, id)).status);
    const removed = await this.prisma.maintenanceTask.deleteMany({
      where: { id: taskId, maintenanceId: id },
    });
    if (!removed.count) throw new NotFoundException('Task not found');
    return { id: taskId, deleted: true };
  }

  /** Start / complete ("Complete Maintenance") / cancel. Syncs vehicle status atomically. */
  async setStatus(actor: AuthUser, id: string, dto: MaintenanceStatusDto) {
    const m = await this.findOne(actor, id);
    const allowed = MAINTENANCE_TRANSITIONS[m.status];
    if (!allowed.includes(dto.status))
      throw new BadRequestException(
        `Cannot change maintenance status from ${m.status} to ${dto.status}`,
      );
    // COMPLETED → COMPLETED only records the actual cost.
    const done =
      dto.status === MaintenanceStatus.COMPLETED &&
      m.status !== MaintenanceStatus.COMPLETED;
    const updated = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.maintenance.updateMany({
        where: { id, status: m.status },
        data: {
          status: dto.status,
          actualCost: dto.actualCost,
          completedAt: done ? new Date() : undefined,
        },
      });
      if (!claimed.count)
        throw new ConflictException('Maintenance was changed concurrently');
      if (dto.status === MaintenanceStatus.IN_PROGRESS)
        await changeVehicleStatus(tx, {
          vehicleId: m.vehicleId,
          status: VehicleStatus.MAINTENANCE,
          reason: `Maintenance ${m.type}`,
          actorId: actor.id,
        });
      if (done) {
        await tx.vehicle.update({
          where: { id: m.vehicleId },
          data: { lastServiceDate: new Date() },
        });
        await changeVehicleStatus(tx, {
          vehicleId: m.vehicleId,
          status: VehicleStatus.AVAILABLE,
          reason: `Maintenance ${m.type} completed`,
          actorId: actor.id,
        });
      }
      if (
        dto.status === MaintenanceStatus.CANCELLED &&
        m.status === MaintenanceStatus.IN_PROGRESS
      )
        await changeVehicleStatus(tx, {
          vehicleId: m.vehicleId,
          status: VehicleStatus.AVAILABLE,
          reason: `Maintenance ${m.type} cancelled`,
          actorId: actor.id,
        });
      return tx.maintenance.findUniqueOrThrow({ where: { id }, include });
    });
    return withTotal(updated);
  }

  async remove(actor: AuthUser, id: string) {
    const m = await this.findOne(actor, id);
    if (m.status === MaintenanceStatus.IN_PROGRESS)
      throw new BadRequestException(
        'Complete or cancel maintenance in progress before deleting it',
      );
    return this.prisma.maintenance.delete({ where: { id } });
  }
}
