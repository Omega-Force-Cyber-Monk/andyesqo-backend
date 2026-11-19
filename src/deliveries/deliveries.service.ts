import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import {
  DeliveryStatus,
  NotificationType,
  PermissionModule,
  ShiftStatus,
  UserRole,
} from '../generated/prisma/enums.js';
import { AuditService } from '../common/audit/audit.service.js';
import { pageResult, paginate } from '../common/dto/pagination.dto.js';
import { NotifyService } from '../common/notify/notify.service.js';
import type { AuthUser } from '../common/types/auth-user.js';
import { nextCode } from '../common/utils/codes.js';
import {
  businessFilter,
  businessIdOf,
  dayOf,
  dayRange,
  localDate,
  todayRange,
} from '../common/utils/tenant.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AccessService } from '../common/access/access.service.js';
import {
  CompleteDeliveryDto,
  CreateDeliveryDto,
  DelayDto,
  DeliveryQueryDto,
  PickupDto,
  UpdateDeliveryDto,
} from './dto/delivery.dto.js';
import { ACTIVE, DELAY_GRACE_MIN, dueAt, isLate } from './delivery.rules.js';
export { DELAY_GRACE_MIN, dueAt, isLate };

/** A delivery is "late" this long after its ETA / drop time / window end. */

const include = {
  driver: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      employeeId: true,
      phone: true,
      depotId: true,
    },
  },
  vehicle: {
    select: {
      id: true,
      model: true,
      registration: true,
      code: true,
      bodyType: true,
      depotId: true,
    },
  },
  depot: { select: { id: true, name: true, address: true } },
  shift: {
    select: { id: true, startTime: true, endTime: true, depotId: true },
  },
  packages: true,
} satisfies Prisma.DeliveryInclude;

type DeliveryRow = Prisma.DeliveryGetPayload<{ include: typeof include }>;
type Visibility = {
  actor: AuthUser;
  depots: string[] | null;
  drivers: boolean;
  vehicles: boolean;
  roster: boolean;
};
const dt = (v?: string) => (v ? new Date(v) : undefined);

@Injectable()
export class DeliveriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notify: NotifyService,
    private readonly audit: AuditService,
    private readonly access: AccessService,
  ) {}

  /** Depot scope plus own-assignment filter for drivers and assistants. */
  async scope(actor: AuthUser): Promise<Prisma.DeliveryWhereInput> {
    const depotIds = await this.access.depotScope(actor);
    const field =
      actor.role === UserRole.DRIVER || actor.role === UserRole.ASSISTANT;
    return {
      ...(depotIds !== null && { depotId: { in: depotIds } }),
      ...(field && {
        OR:
          actor.role === UserRole.DRIVER
            ? [{ driverId: actor.id }]
            : [
                {
                  shift: {
                    assistantId: actor.id,
                    status: {
                      in: [
                        ShiftStatus.PUBLISHED,
                        ShiftStatus.IN_PROGRESS,
                        ShiftStatus.COMPLETED,
                      ],
                    },
                  },
                },
              ],
      }),
    };
  }

  private async validateReferences(
    actor: AuthUser,
    businessId: string,
    values: {
      depotId?: string | null;
      driverId?: string | null;
      vehicleId?: string | null;
    },
    isUpdate = false,
  ) {
    const allowed = await this.access.depotScope(actor);
    if (
      (!isUpdate || values.depotId !== undefined) &&
      allowed !== null &&
      (!values.depotId || !allowed.includes(values.depotId))
    )
      throw new BadRequestException('Depot is outside your access scope');
    if (
      values.depotId &&
      !(await this.prisma.depot.findFirst({
        where: { id: values.depotId, businessId },
        select: { id: true },
      }))
    )
      throw new BadRequestException('Depot is outside the delivery business');
    if (
      values.driverId &&
      !(await this.prisma.user.findFirst({
        where: {
          id: values.driverId,
          businessId,
          role: UserRole.DRIVER,
          ...(allowed !== null && { depotId: { in: allowed } }),
        },
        select: { id: true },
      }))
    )
      throw new BadRequestException('Driver is outside your access scope');
    if (
      values.vehicleId &&
      !(await this.prisma.vehicle.findFirst({
        where: {
          id: values.vehicleId,
          businessId,
          ...(allowed !== null && { depotId: { in: allowed } }),
        },
        select: { id: true },
      }))
    )
      throw new BadRequestException('Vehicle is outside your access scope');
  }

  private async visibility(actor: AuthUser): Promise<Visibility> {
    const [depots, drivers, vehicles, roster] = await Promise.all([
      this.access.depotScope(actor),
      this.access.canView(actor, PermissionModule.DRIVERS),
      this.access.canView(actor, PermissionModule.VEHICLES),
      this.access.canView(actor, PermissionModule.ROSTER),
    ]);
    return { actor, depots, drivers, vehicles, roster };
  }

  private shape(d: DeliveryRow, access: Visibility) {
    const inScope = (depotId: string | null) =>
      access.depots === null || (!!depotId && access.depots.includes(depotId));
    const driverVisible =
      !!d.driver &&
      (d.driver.id === access.actor.id ||
        (access.drivers && inScope(d.driver.depotId)));
    const vehicleVisible =
      !!d.vehicle && access.vehicles && inScope(d.vehicle.depotId);
    const field =
      access.actor.role === UserRole.DRIVER ||
      access.actor.role === UserRole.ASSISTANT;
    const shiftVisible =
      !!d.shift && inScope(d.shift.depotId) && (field || access.roster);
    return {
      ...d,
      driverId: driverVisible ? d.driverId : null,
      vehicleId: vehicleVisible ? d.vehicleId : null,
      shiftId: shiftVisible ? d.shiftId : null,
      driver: driverVisible
        ? {
            id: d.driver!.id,
            firstName: d.driver!.firstName,
            lastName: d.driver!.lastName,
            employeeId: d.driver!.employeeId,
            phone: d.driver!.phone,
          }
        : null,
      vehicle: vehicleVisible
        ? {
            id: d.vehicle!.id,
            model: d.vehicle!.model,
            registration: d.vehicle!.registration,
            code: d.vehicle!.code,
            bodyType: d.vehicle!.bodyType,
          }
        : null,
      shift: shiftVisible
        ? {
            id: d.shift!.id,
            startTime: d.shift!.startTime,
            endTime: d.shift!.endTime,
          }
        : null,
      late: isLate(d),
    };
  }

  async create(actor: AuthUser, dto: CreateDeliveryDto) {
    const businessId = businessIdOf(actor, dto.businessId);
    await this.validateReferences(actor, businessId, dto);
    const {
      packages,
      businessId: _b,
      windowStart,
      windowEnd,
      scheduledDropTime,
      ...rest
    } = dto;
    let shiftId: string | undefined;
    let vehicleId = dto.vehicleId;
    if (dto.driverId) {
      const driver = await this.prisma.user.findFirst({
        where: { id: dto.driverId, businessId, role: UserRole.DRIVER },
      });
      if (!driver) throw new BadRequestException('Driver not found');
      const day = scheduledDropTime ? new Date(scheduledDropTime) : new Date();
      const allowed = await this.access.depotScope(actor);
      const shift = await this.prisma.shift.findFirst({
        where: {
          driverId: dto.driverId,
          businessId,
          date: localDate(day),
          status: {
            in: [
              ShiftStatus.PUBLISHED,
              ShiftStatus.IN_PROGRESS,
              ShiftStatus.COMPLETED,
            ],
          },
          ...(dto.depotId
            ? { depotId: dto.depotId }
            : allowed !== null
              ? { depotId: { in: allowed } }
              : {}),
        },
      });
      shiftId = shift?.id;
      vehicleId = vehicleId ?? shift?.vehicleId ?? undefined;
      await this.validateReferences(actor, businessId, { vehicleId }, true);
    }
    const delivery = await this.prisma.delivery.create({
      data: {
        ...rest,
        vehicleId,
        shiftId,
        businessId,
        code: await nextCode(this.prisma, businessId, 'DEL'),
        createdById: actor.id,
        windowStart: dt(windowStart),
        windowEnd: dt(windowEnd),
        scheduledDropTime: dt(scheduledDropTime),
        packageCount: rest.packageCount ?? packages?.length,
        totalWeightKg:
          rest.totalWeightKg ??
          packages?.reduce((s, p) => s + (p.weightKg ?? 0), 0),
        packages: packages?.length
          ? {
              create: packages.map((p, i) => ({
                ...p,
                code: p.code ?? `PKG-${String(i + 1).padStart(2, '0')}`,
              })),
            }
          : undefined,
      },
      include,
    });
    if (delivery.driverId) {
      await this.notify.toUser(
        delivery.driverId,
        NotificationType.DELIVERY,
        'New Delivery Assigned',
        `A new delivery has been assigned to you - ${delivery.code}.`,
        { deliveryId: delivery.id },
      );
    }
    await this.audit.log(actor, {
      businessId,
      action: 'Created Delivery',
      module: 'Deliveries',
      targetType: 'Delivery',
      targetId: delivery.id,
      details: `Created ${delivery.code} for ${delivery.customerName}`,
    });
    return this.shape(delivery, await this.visibility(actor));
  }

  private async where(
    actor: AuthUser,
    q: DeliveryQueryDto,
    mine = false,
  ): Promise<Prisma.DeliveryWhereInput> {
    const day = q.date ? dayOf(q.date) : undefined;
    const visibility = await this.visibility(actor);
    return {
      ...businessFilter(actor, q.businessId),
      status: q.status,
      driverId: mine ? undefined : q.driverId,
      vehicleId: q.vehicleId,
      priority: q.priority,
      AND: [await this.scope(actor)],
      ...(day && {
        scheduledDropTime: dayRange(day),
      }),
      ...(q.search && {
        OR: [
          { code: { contains: q.search, mode: 'insensitive' } },
          { customerName: { contains: q.search, mode: 'insensitive' } },
          { deliveryAddress: { contains: q.search, mode: 'insensitive' } },
          ...(visibility.drivers
            ? [
                {
                  driver: {
                    firstName: {
                      contains: q.search,
                      mode: 'insensitive' as const,
                    },
                    ...(visibility.depots !== null && {
                      depotId: { in: visibility.depots },
                    }),
                  },
                },
                {
                  driver: {
                    lastName: {
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
  }

  async findAll(actor: AuthUser, q: DeliveryQueryDto, mine = false) {
    const where = await this.where(actor, q, mine);
    const visibility = await this.visibility(actor);
    const orderBy: Prisma.DeliveryOrderByWithRelationInput[] = mine
      ? [{ sortOrder: 'asc' }, { scheduledDropTime: 'asc' }]
      : [{ scheduledDropTime: 'desc' }, { createdAt: 'desc' }];
    if (q.delayedOnly) {
      const all = (
        await this.prisma.delivery.findMany({ where, include, orderBy })
      ).filter((d) => isLate(d));
      const { skip, take, page, limit } = paginate(q);
      return pageResult(
        all.slice(skip, skip + take).map((d) => this.shape(d, visibility)),
        all.length,
        page,
        limit,
      );
    }
    const { skip, take, page, limit } = paginate(q);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.delivery.findMany({ where, skip, take, include, orderBy }),
      this.prisma.delivery.count({ where }),
    ]);
    return pageResult(
      items.map((d) => this.shape(d, visibility)),
      total,
      page,
      limit,
    );
  }

  /** Driver "Today's Deliveries": list + counters (Tasks / Remaining). */
  async myToday(actor: AuthUser, status?: DeliveryStatus) {
    const visibility = await this.visibility(actor);
    const today = todayRange();
    const all = await this.prisma.delivery.findMany({
      where: {
        ...businessFilter(actor),
        AND: [await this.scope(actor)],
        scheduledDropTime: today,
      },
      include,
      orderBy: [{ sortOrder: 'asc' }, { scheduledDropTime: 'asc' }],
    });
    const remaining = all.filter(
      (d) =>
        d.status !== DeliveryStatus.COMPLETED &&
        d.status !== DeliveryStatus.CANCELLED,
    ).length;
    return {
      total: all.length,
      remaining,
      deliveries: all
        .filter((d) => (status ? d.status === status : true))
        .map((d) => this.shape(d, visibility)),
    };
  }

  /** Stat tiles: Total / Completed / In Progress / Pending / Delayed / On time. */
  async stats(actor: AuthUser, date?: string, businessId?: string) {
    await this.access.assertPermission(
      actor,
      PermissionModule.DELIVERIES,
      'view',
    );
    const day = dayOf(date);
    const rows = await this.prisma.delivery.findMany({
      where: {
        ...businessFilter(actor, businessId),
        AND: [await this.scope(actor)],
        scheduledDropTime: dayRange(day),
      },
      select: {
        status: true,
        eta: true,
        windowEnd: true,
        scheduledDropTime: true,
        deliveredAt: true,
      },
    });
    const by = (s: DeliveryStatus) => rows.filter((r) => r.status === s).length;
    const late = rows.filter((r) => isLate(r)).length;
    const completed = by('COMPLETED');
    const completedOnTime = rows.filter(
      (r) => r.status === 'COMPLETED' && !isLate(r),
    ).length;
    return {
      total: rows.length,
      completed,
      inProgress: by('IN_PROGRESS') + by('PICKED_UP'),
      pending: by('PENDING'),
      delayed: late,
      onTime: rows.filter((r) => r.status !== 'CANCELLED' && !isLate(r)).length,
      percentComplete: rows.length
        ? Math.round((completed / rows.length) * 1000) / 10
        : 0,
      onTimeRate: completed
        ? Math.round((completedOnTime / completed) * 1000) / 10
        : null,
    };
  }

  private async getRaw(actor: AuthUser, id: string) {
    const d = await this.prisma.delivery.findFirst({
      where: { id, ...businessFilter(actor), AND: [await this.scope(actor)] },
      include: {
        ...include,
        incidents: true,
        createdBy: {
          select: { id: true, firstName: true, lastName: true, depotId: true },
        },
      },
    });
    if (!d) throw new NotFoundException('Delivery not found');
    if (
      (actor.role === UserRole.DRIVER || actor.role === UserRole.ASSISTANT) &&
      !(await this.isMyDelivery(actor, d))
    ) {
      throw new ForbiddenException();
    }
    return d;
  }

  async findOne(actor: AuthUser, id: string) {
    const d = await this.getRaw(actor, id);
    const visibility = await this.visibility(actor);
    const creator = d.createdBy;
    const creatorVisible =
      creator &&
      (creator.id === actor.id ||
        (visibility.drivers &&
          (visibility.depots === null ||
            (!!creator.depotId &&
              visibility.depots.includes(creator.depotId)))));
    return {
      ...this.shape(d, visibility),
      createdById: creatorVisible ? d.createdById : null,
      createdBy: creatorVisible
        ? {
            id: creator.id,
            firstName: creator.firstName,
            lastName: creator.lastName,
          }
        : null,
      incidents: d.incidents,
      timeline: {
        departedAt: d.departedAt,
        startedAt: d.startedAt,
        pickedUpAt: d.pickedUpAt,
        eta: d.eta,
        deliveredAt: d.deliveredAt,
      },
    };
  }

  private async isMyDelivery(
    actor: AuthUser,
    d: { driverId: string | null; shiftId: string | null },
  ) {
    if (actor.role === UserRole.DRIVER && d.driverId === actor.id) return true;
    if (actor.role === UserRole.ASSISTANT && d.shiftId) {
      return !!(await this.prisma.shift.findFirst({
        where: {
          id: d.shiftId,
          assistantId: actor.id,
          status: {
            in: [
              ShiftStatus.PUBLISHED,
              ShiftStatus.IN_PROGRESS,
              ShiftStatus.COMPLETED,
            ],
          },
        },
      }));
    }
    return false;
  }

  async update(actor: AuthUser, id: string, dto: UpdateDeliveryDto) {
    const before = await this.getRaw(actor, id);
    await this.validateReferences(actor, before.businessId, dto, true);
    let shiftId: string | null | undefined;
    if (
      dto.driverId !== undefined ||
      dto.scheduledDropTime !== undefined ||
      dto.depotId !== undefined
    ) {
      const driverId =
        dto.driverId === undefined ? before.driverId : dto.driverId;
      const depotId = dto.depotId === undefined ? before.depotId : dto.depotId;
      const day = dto.scheduledDropTime
        ? new Date(dto.scheduledDropTime)
        : (before.scheduledDropTime ?? new Date());
      const allowed = await this.access.depotScope(actor);
      const shift = driverId
        ? await this.prisma.shift.findFirst({
            where: {
              businessId: before.businessId,
              driverId,
              date: localDate(day),
              status: {
                in: [
                  ShiftStatus.PUBLISHED,
                  ShiftStatus.IN_PROGRESS,
                  ShiftStatus.COMPLETED,
                ],
              },
              ...(depotId
                ? { depotId }
                : allowed !== null
                  ? { depotId: { in: allowed } }
                  : {}),
            },
            select: { id: true },
          })
        : null;
      shiftId = shift?.id ?? null;
    }
    const { windowStart, windowEnd, scheduledDropTime, ...rest } = dto;
    const changed = await this.prisma.delivery.updateMany({
      where: {
        id,
        ...businessFilter(actor),
        AND: [await this.scope(actor)],
        updatedAt: before.updatedAt,
      },
      data: {
        ...rest,
        shiftId,
        windowStart: dt(windowStart),
        windowEnd: dt(windowEnd),
        scheduledDropTime: dt(scheduledDropTime),
      },
    });
    if (changed.count !== 1) {
      await this.getRaw(actor, id);
      throw new ConflictException('Delivery changed; reload and retry');
    }
    const d = await this.prisma.delivery.findFirst({
      where: { id, ...businessFilter(actor), AND: [await this.scope(actor)] },
      include,
    });
    if (!d) throw new NotFoundException('Delivery not found');
    if (dto.driverId && dto.driverId !== before.driverId) {
      await this.notify.toUser(
        dto.driverId,
        NotificationType.DELIVERY,
        'New Delivery Assigned',
        `A new delivery has been assigned to you - ${d.code}.`,
        { deliveryId: id },
      );
    }
    return this.shape(d, await this.visibility(actor));
  }

  async cancel(actor: AuthUser, id: string) {
    const updated = await this.transition(
      actor,
      id,
      Object.values(DeliveryStatus).filter(
        (status) => status !== DeliveryStatus.CANCELLED,
      ),
      { status: DeliveryStatus.CANCELLED },
    );
    return this.shape(updated, await this.visibility(actor));
  }

  // ── Driver flow ──
  private async transition(
    actor: AuthUser,
    id: string,
    allowed: DeliveryStatus[],
    data: Prisma.DeliveryUpdateManyMutationInput,
  ) {
    const changed = await this.prisma.delivery.updateMany({
      where: {
        id,
        ...businessFilter(actor),
        AND: [await this.scope(actor)],
        status: { in: allowed },
      },
      data,
    });
    if (changed.count !== 1) {
      const current = await this.getRaw(actor, id);
      throw new BadRequestException(`Delivery is ${current.status}`);
    }
    const result = await this.prisma.delivery.findFirst({
      where: { id, ...businessFilter(actor), AND: [await this.scope(actor)] },
      include,
    });
    if (!result) throw new NotFoundException('Delivery not found');
    return result;
  }

  /** "Start Delivery". */
  async start(actor: AuthUser, id: string) {
    const now = new Date();
    return this.shape(
      await this.transition(
        actor,
        id,
        [DeliveryStatus.PENDING, DeliveryStatus.DELAYED],
        {
          status: DeliveryStatus.IN_PROGRESS,
          startedAt: now,
          departedAt: now,
        },
      ),
      await this.visibility(actor),
    );
  }

  /** "Confirm Pickup" (photos + barcode scan). */
  async pickup(actor: AuthUser, id: string, dto: PickupDto) {
    return this.shape(
      await this.transition(
        actor,
        id,
        [
          DeliveryStatus.PENDING,
          DeliveryStatus.IN_PROGRESS,
          DeliveryStatus.DELAYED,
        ],
        {
          status: DeliveryStatus.PICKED_UP,
          pickedUpAt: new Date(),
          pickupPhotos: dto.photos ?? [],
          barcode: dto.barcode,
        },
      ),
      await this.visibility(actor),
    );
  }

  /** "Delivery Confirmation" → Complete. */
  async complete(actor: AuthUser, id: string, dto: CompleteDeliveryDto) {
    return this.shape(
      await this.transition(
        actor,
        id,
        [
          DeliveryStatus.IN_PROGRESS,
          DeliveryStatus.PICKED_UP,
          DeliveryStatus.DELAYED,
        ],
        {
          status: DeliveryStatus.COMPLETED,
          deliveredAt: new Date(),
          proofPhotos: dto.photos ?? [],
          deliveryNotes: dto.notes,
        },
      ),
      await this.visibility(actor),
    );
  }

  /** "Report Delay". */
  async delay(actor: AuthUser, id: string, dto: DelayDto) {
    const updated = await this.transition(actor, id, ACTIVE, {
      status: DeliveryStatus.DELAYED,
      delayReason: dto.reason,
      eta: dt(dto.eta),
    });
    await this.notify.toRoles(
      updated.businessId,
      [UserRole.SUPERVISOR, UserRole.BUSINESS_ADMIN],
      NotificationType.DELIVERY,
      `${updated.code} delayed`,
      dto.reason,
      { deliveryId: id },
    );
    return this.shape(updated, await this.visibility(actor));
  }

  async updateEta(actor: AuthUser, id: string, eta: string) {
    return this.shape(
      await this.transition(actor, id, ACTIVE, { eta: new Date(eta) }),
      await this.visibility(actor),
    );
  }

  /** Driver "Delivery History" (supervisor driver details). */
  async historyFor(actor: AuthUser, driverId: string, take = 20) {
    await this.access.assertPermission(
      actor,
      PermissionModule.DELIVERIES,
      'view',
    );
    return this.prisma.delivery.findMany({
      where: {
        ...businessFilter(actor),
        driverId,
        AND: [await this.scope(actor)],
      },
      orderBy: { scheduledDropTime: 'desc' },
      take,
      select: {
        id: true,
        code: true,
        customerName: true,
        scheduledDropTime: true,
        deliveredAt: true,
        status: true,
        eta: true,
        windowEnd: true,
      },
    });
  }
}
