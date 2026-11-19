import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import {
  InspectionType,
  PermissionModule,
  MaintenanceStatus,
  ShiftStatus,
  UserRole,
  VehicleStatus,
} from '../generated/prisma/enums.js';
import { AuditService } from '../common/audit/audit.service.js';
import { pageResult, paginate } from '../common/dto/pagination.dto.js';
import type { AuthUser } from '../common/types/auth-user.js';
import { nextCode } from '../common/utils/codes.js';
import {
  businessFilter,
  businessIdOf,
  localDate,
} from '../common/utils/tenant.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AccessService } from '../common/access/access.service.js';
import {
  CreateVehicleDto,
  UpdateVehicleDto,
  VehicleQueryDto,
} from './dto/vehicle.dto.js';

const toDate = (v?: string) => (v ? new Date(v) : undefined);
const DAY = 24 * 3600 * 1000;

@Injectable()
export class VehiclesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly access: AccessService,
  ) {}

  private async scope(actor: AuthUser): Promise<Prisma.VehicleWhereInput> {
    const depotIds = await this.access.depotScope(actor);
    const field =
      actor.role === UserRole.DRIVER || actor.role === UserRole.ASSISTANT;
    return {
      ...(depotIds !== null && { depotId: { in: depotIds } }),
      ...(field && {
        OR: [
          ...(actor.role === UserRole.DRIVER
            ? [{ assignedDriverId: actor.id }]
            : []),
          {
            shifts: {
              some: {
                date: localDate(),
                status: {
                  in: [
                    ShiftStatus.PUBLISHED,
                    ShiftStatus.IN_PROGRESS,
                    ShiftStatus.COMPLETED,
                  ],
                },
                OR: [{ driverId: actor.id }, { assistantId: actor.id }],
              },
            },
          },
        ],
      }),
    };
  }

  async accessWhere(
    actor: AuthUser,
    id: string,
  ): Promise<Prisma.VehicleWhereInput> {
    return { id, ...businessFilter(actor), AND: [await this.scope(actor)] };
  }

  async assertAccessible(actor: AuthUser, id: string) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: await this.accessWhere(actor, id),
    });
    if (!vehicle) throw new NotFoundException('Vehicle not found');
    return vehicle;
  }

  private async validateDepot(
    actor: AuthUser,
    businessId: string,
    depotId: string | null | undefined,
    isUpdate = false,
  ) {
    const scope = await this.access.depotScope(actor);
    if (isUpdate && depotId === undefined) return;
    if (scope !== null && (!depotId || !scope.includes(depotId)))
      throw new BadRequestException('Depot is outside your access scope');
    if (
      depotId &&
      !(await this.prisma.depot.findFirst({
        where: { id: depotId, businessId },
        select: { id: true },
      }))
    )
      throw new BadRequestException('Depot is outside the vehicle business');
  }

  async create(actor: AuthUser, dto: CreateVehicleDto) {
    const businessId = businessIdOf(actor, dto.businessId);
    await this.validateDepot(actor, businessId, dto.depotId);
    const {
      businessId: _b,
      lastServiceDate,
      nextServiceDate,
      registrationExpiry,
      insuranceExpiry,
      ...rest
    } = dto;
    const vehicle = await this.prisma.vehicle.create({
      data: {
        ...rest,
        registration: rest.registration.toUpperCase(),
        code: rest.code || (await nextCode(this.prisma, businessId, 'VH')),
        businessId,
        lastServiceDate: toDate(lastServiceDate),
        nextServiceDate: toDate(nextServiceDate),
        registrationExpiry: toDate(registrationExpiry),
        insuranceExpiry: toDate(insuranceExpiry),
      },
    });
    await this.audit.log(actor, {
      businessId,
      action: 'Vehicle Registered',
      module: 'Fleet & Safety',
      targetType: 'Vehicle',
      targetId: vehicle.id,
      details: `${vehicle.model} (${vehicle.registration})`,
    });
    return vehicle;
  }

  private async where(
    actor: AuthUser,
    q: VehicleQueryDto,
  ): Promise<Prisma.VehicleWhereInput> {
    const [scope, canViewDrivers, depotIds] = await Promise.all([
      this.scope(actor),
      this.access.canView(actor, PermissionModule.DRIVERS),
      this.access.depotScope(actor),
    ]);
    return {
      ...businessFilter(actor, q.businessId),
      status: q.status,
      bodyType: q.bodyType,
      depotId: q.depotId,
      AND: [scope],
      ...(q.search && {
        OR: [
          { registration: { contains: q.search, mode: 'insensitive' } },
          { model: { contains: q.search, mode: 'insensitive' } },
          { code: { contains: q.search, mode: 'insensitive' } },
          ...(canViewDrivers
            ? [
                {
                  assignedDriver: {
                    firstName: {
                      contains: q.search,
                      mode: 'insensitive' as const,
                    },
                    ...(depotIds !== null && { depotId: { in: depotIds } }),
                  },
                },
              ]
            : []),
        ],
      }),
    };
  }

  async findAll(actor: AuthUser, q: VehicleQueryDto) {
    const { skip, take, page, limit } = paginate(q);
    const [where, canViewDrivers, depotIds] = await Promise.all([
      this.where(actor, q),
      this.access.canView(actor, PermissionModule.DRIVERS),
      this.access.depotScope(actor),
    ]);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.vehicle.findMany({
        where,
        skip,
        take,
        orderBy: { code: 'asc' },
        include: {
          depot: { select: { id: true, name: true } },
          assignedDriver: canViewDrivers
            ? {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  employeeId: true,
                  depotId: true,
                },
              }
            : false,
        },
      }),
      this.prisma.vehicle.count({ where }),
    ]);
    const now = new Date();
    return pageResult(
      items.map((v) => {
        const driver = v.assignedDriver;
        const visible =
          canViewDrivers &&
          driver &&
          (depotIds === null ||
            (!!driver.depotId && depotIds.includes(driver.depotId)));
        return {
          ...v,
          assignedDriverId: visible ? v.assignedDriverId : null,
          assignedDriver: visible
            ? {
                id: driver.id,
                firstName: driver.firstName,
                lastName: driver.lastName,
                employeeId: driver.employeeId,
              }
            : null,
          serviceOverdue: !!v.nextServiceDate && v.nextServiceDate < now,
        };
      }),
      total,
      page,
      limit,
    );
  }

  /** Fleet Status cards (Available / Assigned / Maintenance / Unavailable). */
  async stats(actor: AuthUser, businessId?: string) {
    await this.access.assertPermission(
      actor,
      PermissionModule.VEHICLES,
      'view',
    );
    const groups = await this.prisma.vehicle.groupBy({
      by: ['status'],
      where: {
        ...businessFilter(actor, businessId),
        AND: [await this.scope(actor)],
      },
      _count: { _all: true },
    });
    const byStatus = Object.fromEntries(
      groups.map((g) => [g.status, g._count._all]),
    ) as Partial<Record<VehicleStatus, number>>;
    const n = (...s: VehicleStatus[]) =>
      s.reduce((sum, k) => sum + (byStatus[k] ?? 0), 0);
    return {
      total: groups.reduce((sum, g) => sum + g._count._all, 0),
      available: n('AVAILABLE'),
      assigned: n('ASSIGNED', 'IN_SERVICE'),
      maintenance: n('MAINTENANCE', 'REPAIR_REQUIRED'),
      unavailable: n('UNAVAILABLE', 'GROUNDED', 'INSPECTION_REQUIRED'),
      byStatus,
    };
  }

  /** Vehicle details incl. readiness check (inspection, maintenance, registration, insurance). */
  async findOne(actor: AuthUser, id: string) {
    const [
      scope,
      canViewDrivers,
      canViewInspections,
      canViewRepairs,
      canViewMaintenance,
      canViewRoster,
      depotIds,
    ] = await Promise.all([
      this.scope(actor),
      this.access.canView(actor, PermissionModule.DRIVERS),
      this.access.canView(actor, PermissionModule.INSPECTIONS),
      this.access.canView(actor, PermissionModule.REPAIRS),
      this.access.canView(actor, PermissionModule.MAINTENANCE),
      this.access.canView(actor, PermissionModule.ROSTER),
      this.access.depotScope(actor),
    ]);
    const v = await this.prisma.vehicle.findFirst({
      where: { id, ...businessFilter(actor), AND: [scope] },
      include: {
        depot: true,
        assignedDriver: canViewDrivers
          ? {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                employeeId: true,
                phone: true,
                depotId: true,
              },
            }
          : false,
        inspections: canViewInspections
          ? { orderBy: { submittedAt: 'desc' }, take: 1 }
          : false,
        repairRequests: canViewRepairs
          ? { orderBy: { createdAt: 'desc' }, take: 10 }
          : false,
        maintenance: canViewMaintenance
          ? { orderBy: { scheduledDate: 'desc' }, take: 10 }
          : false,
      },
    });
    if (!v) throw new NotFoundException('Vehicle not found');
    const now = new Date();
    const soon = new Date(now.getTime() + 30 * DAY);
    const expiry = (d: Date | null) =>
      !d ? 'UNKNOWN' : d < now ? 'EXPIRED' : d < soon ? 'DUE_SOON' : 'VALID';
    const nextShift = canViewRoster
      ? await this.prisma.shift.findFirst({
          where: {
            vehicleId: id,
            date: { gte: localDate() },
            status: { not: ShiftStatus.CANCELLED },
            ...(depotIds !== null && { depotId: { in: depotIds } }),
          },
          orderBy: { date: 'asc' },
        })
      : null;
    const lastInspection = v.inspections?.[0];
    const driver = v.assignedDriver;
    const visible =
      canViewDrivers &&
      driver &&
      (depotIds === null ||
        (!!driver.depotId && depotIds.includes(driver.depotId)));
    return {
      ...v,
      assignedDriverId: visible ? v.assignedDriverId : null,
      assignedDriver: visible
        ? {
            id: driver.id,
            firstName: driver.firstName,
            lastName: driver.lastName,
            employeeId: driver.employeeId,
            phone: driver.phone,
          }
        : null,
      nextShift,
      readiness: {
        inspection: canViewInspections
          ? (lastInspection?.result ?? 'NONE')
          : 'UNKNOWN',
        maintenance: expiry(v.nextServiceDate),
        registration: expiry(v.registrationExpiry),
        insurance: expiry(v.insuranceExpiry),
        ready: canViewInspections
          ? v.status === VehicleStatus.AVAILABLE &&
            lastInspection?.result !== 'FAILED' &&
            expiry(v.registrationExpiry) !== 'EXPIRED' &&
            expiry(v.insuranceExpiry) !== 'EXPIRED'
          : null,
      },
    };
  }

  async update(actor: AuthUser, id: string, dto: UpdateVehicleDto) {
    const existing = await this.assertAccessible(actor, id);
    await this.validateDepot(actor, existing.businessId, dto.depotId, true);
    const {
      businessId: _b,
      lastServiceDate,
      nextServiceDate,
      registrationExpiry,
      insuranceExpiry,
      ...rest
    } = dto;
    return this.prisma.vehicle.update({
      where: { id },
      data: {
        ...rest,
        registration: rest.registration?.toUpperCase(),
        lastServiceDate: toDate(lastServiceDate),
        nextServiceDate: toDate(nextServiceDate),
        registrationExpiry: toDate(registrationExpiry),
        insuranceExpiry: toDate(insuranceExpiry),
      },
    });
  }

  async remove(actor: AuthUser, id: string) {
    await this.assertAccessible(actor, id);
    return this.prisma.vehicle.delete({ where: { id } });
  }

  /** Changes status and keeps a log. Used by inspections, damage reports, maintenance ("Ground Vehicle"). */
  async setStatus(
    actor: AuthUser,
    id: string,
    status: VehicleStatus,
    reason?: string,
  ) {
    const v = await this.assertAccessible(actor, id);
    if (v.status === status) return v;
    const [updated] = await this.prisma.$transaction([
      this.prisma.vehicle.update({ where: { id }, data: { status } }),
      this.prisma.vehicleStatusLog.create({
        data: {
          vehicleId: id,
          fromStatus: v.status,
          toStatus: status,
          reason,
          changedById: actor.id,
        },
      }),
    ]);
    await this.audit.log(actor, {
      businessId: v.businessId,
      action:
        status === VehicleStatus.GROUNDED
          ? 'Grounded Vehicle (Red-Tag)'
          : 'Vehicle Status Changed',
      module: 'Fleet & Safety',
      targetType: 'Vehicle',
      targetId: id,
      details: `${v.registration}: ${v.status} → ${status}${reason ? ` (${reason})` : ''}`,
    });
    return updated;
  }

  async statusHistory(actor: AuthUser, id: string) {
    await this.assertAccessible(actor, id);
    return this.prisma.vehicleStatusLog.findMany({
      where: { vehicleId: id, vehicle: businessFilter(actor) },
      orderBy: { createdAt: 'desc' },
      include: {
        changedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  async assignDriver(actor: AuthUser, id: string, driverId?: string | null) {
    const v = await this.assertAccessible(actor, id);
    const depotIds = await this.access.depotScope(actor);
    if (driverId) {
      const driver = await this.prisma.user.findFirst({
        where: {
          id: driverId,
          businessId: v.businessId,
          role: UserRole.DRIVER,
          ...(depotIds !== null && { depotId: { in: depotIds } }),
        },
      });
      if (!driver)
        throw new BadRequestException('Driver not found in this business');
      if (
        v.status !== VehicleStatus.AVAILABLE &&
        v.status !== VehicleStatus.ASSIGNED
      ) {
        throw new BadRequestException(
          `Vehicle is ${v.status} and cannot be assigned`,
        );
      }
    }
    const updated = await this.prisma.vehicle.update({
      where: { id },
      data: {
        assignedDriverId: driverId ?? null,
        status: driverId ? VehicleStatus.ASSIGNED : VehicleStatus.AVAILABLE,
      },
      include: {
        assignedDriver: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });
    await this.audit.log(actor, {
      businessId: v.businessId,
      action: driverId
        ? 'Driver Assigned to Vehicle'
        : 'Driver Unassigned from Vehicle',
      module: 'Fleet & Safety',
      targetType: 'Vehicle',
      targetId: id,
    });
    return updated;
  }

  /** "Requires Attention" panel on the fleet dashboard. */
  async attention(actor: AuthUser, businessId?: string) {
    await this.access.assertPermission(
      actor,
      PermissionModule.VEHICLES,
      'view',
    );
    const scope = businessFilter(actor, businessId);
    const vehicleScope = await this.scope(actor);
    const today = localDate();
    const [overdueMaintenance, inspectionDue] = await this.prisma.$transaction([
      this.prisma.vehicle.findMany({
        where: {
          ...scope,
          AND: [vehicleScope],
          OR: [
            { nextServiceDate: { lt: today } },
            { maintenance: { some: { status: MaintenanceStatus.OVERDUE } } },
          ],
        },
        select: {
          id: true,
          model: true,
          registration: true,
          nextServiceDate: true,
        },
      }),
      this.prisma.vehicle.findMany({
        where: {
          ...scope,
          AND: [vehicleScope],
          status: { in: [VehicleStatus.ASSIGNED, VehicleStatus.AVAILABLE] },
          inspections: {
            none: {
              type: InspectionType.PRE_SHIFT,
              submittedAt: { gte: today },
            },
          },
          shifts: { some: { date: today } },
        },
        select: { id: true, model: true, registration: true },
      }),
    ]);
    return { overdueMaintenance, inspectionDue };
  }
}
