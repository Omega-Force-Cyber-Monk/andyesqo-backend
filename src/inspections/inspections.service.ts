import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import {
  ChecklistResult,
  InspectionResult,
  InspectionStatus,
  InspectionType,
  NotificationType,
  PermissionModule,
  ShiftStatus,
  UserRole,
  VehicleStatus,
} from '../generated/prisma/enums.js';
import { pageResult, paginate } from '../common/dto/pagination.dto.js';
import { NotifyService } from '../common/notify/notify.service.js';
import type { AuthUser } from '../common/types/auth-user.js';
import {
  businessFilter,
  endOfDay,
  startOfDay,
} from '../common/utils/tenant.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { VehiclesService } from '../vehicles/vehicles.service.js';
import { VISIBLE_TO_CREW } from '../roster/shift-visibility.js';
import { AccessService } from '../common/access/access.service.js';
import {
  CreateInspectionDto,
  InspectionQueryDto,
} from './dto/inspection.dto.js';

/** Checklist items exactly as listed on the inspection screens. */
export const CHECKLISTS: Record<InspectionType, string[]> = {
  PRE_SHIFT: [
    'Tyres',
    'Lights',
    'Mirrors',
    'Brakes',
    'Horn',
    'Fuel Level',
    'Battery',
    'Oil',
    'Exterior Damage',
    'Interior Cleanliness',
    'Emergency Kit',
    'Fire Extinguisher',
  ],
  POST_SHIFT: [
    'Tyres',
    'Lights',
    'Mirrors',
    'Brakes',
    'Horn',
    'Fuel Level',
    'Battery',
    'Exterior Condition',
    'Interior Condition',
    'Dashboard Warning Lights',
  ],
};

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
  driver: {
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
  items: true,
} satisfies Prisma.InspectionInclude;
type InspectionRow = Prisma.InspectionGetPayload<{ include: typeof include }>;
type Visibility = {
  actor: AuthUser;
  depots: string[] | null;
  drivers: boolean;
  vehicles: boolean;
  roster: boolean;
  repairs: boolean;
};

@Injectable()
export class InspectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly vehicles: VehiclesService,
    private readonly notify: NotifyService,
    private readonly access: AccessService,
  ) {}

  private async visibility(actor: AuthUser): Promise<Visibility> {
    const [depots, drivers, vehicles, roster, repairs] = await Promise.all([
      this.access.depotScope(actor),
      this.access.canView(actor, PermissionModule.DRIVERS),
      this.access.canView(actor, PermissionModule.VEHICLES),
      this.access.canView(actor, PermissionModule.ROSTER),
      this.access.canView(actor, PermissionModule.REPAIRS),
    ]);
    return { actor, depots, drivers, vehicles, roster, repairs };
  }

  private shape(row: InspectionRow, visibility: Visibility) {
    const inScope = (depotId: string | null) =>
      visibility.depots === null ||
      (!!depotId && visibility.depots.includes(depotId));
    const driverVisible =
      row.driver.id === visibility.actor.id ||
      (visibility.drivers && inScope(row.driver.depotId));
    const reviewerVisible =
      row.reviewedBy &&
      (row.reviewedBy.id === visibility.actor.id ||
        (visibility.drivers && inScope(row.reviewedBy.depotId)));
    const vehicleVisible = visibility.vehicles && inScope(row.vehicle.depotId);
    const field =
      visibility.actor.role === UserRole.DRIVER ||
      visibility.actor.role === UserRole.ASSISTANT;
    return {
      ...row,
      driverId: driverVisible ? row.driverId : null,
      driver: driverVisible
        ? {
            id: row.driver.id,
            firstName: row.driver.firstName,
            lastName: row.driver.lastName,
            employeeId: row.driver.employeeId,
          }
        : null,
      reviewedById: reviewerVisible ? row.reviewedById : null,
      reviewedBy: reviewerVisible
        ? {
            id: row.reviewedBy!.id,
            firstName: row.reviewedBy!.firstName,
            lastName: row.reviewedBy!.lastName,
          }
        : null,
      vehicleId: vehicleVisible ? row.vehicleId : null,
      vehicle: vehicleVisible
        ? {
            id: row.vehicle.id,
            model: row.vehicle.model,
            registration: row.vehicle.registration,
            code: row.vehicle.code,
            depot: row.vehicle.depot,
          }
        : null,
      shiftId:
        visibility.roster || (field && row.driverId === visibility.actor.id)
          ? row.shiftId
          : null,
    };
  }

  checklist(type: InspectionType) {
    return { type, items: CHECKLISTS[type] };
  }

  async create(actor: AuthUser, dto: CreateInspectionDto) {
    const vehicleWhere = await this.vehicles.accessWhere(actor, dto.vehicleId);
    const depotIds = await this.access.depotScope(actor);
    const failed = dto.items.filter((i) => i.result === ChecklistResult.ISSUE);
    const result = failed.length
      ? InspectionResult.FAILED
      : InspectionResult.PASSED;

    const { inspection, vehicle } = await this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Vehicle" WHERE id = ${dto.vehicleId} FOR UPDATE`;
        const vehicle = await tx.vehicle.findFirst({ where: vehicleWhere });
        if (!vehicle) throw new NotFoundException('Vehicle not found');
        if (
          dto.shiftId &&
          !(await tx.shift.findFirst({
            where: {
              id: dto.shiftId,
              vehicleId: vehicle.id,
              businessId: vehicle.businessId,
              status: {
                in: [
                  ShiftStatus.PUBLISHED,
                  ShiftStatus.IN_PROGRESS,
                  ShiftStatus.COMPLETED,
                ],
              },
              ...(depotIds !== null && { depotId: { in: depotIds } }),
              OR: [{ driverId: actor.id }, { assistantId: actor.id }],
            },
            select: { id: true },
          }))
        )
          throw new BadRequestException(
            'Shift is not assigned to this user and vehicle',
          );
        const inspection = await tx.inspection.create({
          data: {
            vehicleId: dto.vehicleId,
            driverId: actor.id,
            shiftId: dto.shiftId,
            type: dto.type,
            result,
            status: failed.length
              ? InspectionStatus.ISSUES_REPORTED
              : InspectionStatus.PENDING_REVIEW,
            photos: dto.photos ?? [],
            comments: dto.comments,
            durationSec: dto.durationSec,
            odometerKm: dto.odometerKm,
            items: { create: dto.items },
          },
          include,
        });
        const flag =
          failed.length > 0 &&
          (
            [
              VehicleStatus.AVAILABLE,
              VehicleStatus.ASSIGNED,
              VehicleStatus.IN_SERVICE,
            ] as VehicleStatus[]
          ).includes(vehicle.status);
        if (
          flag ||
          (dto.odometerKm !== undefined && dto.odometerKm > vehicle.odometerKm)
        ) {
          await tx.vehicle.update({
            where: { id: vehicle.id },
            data: {
              ...(flag && { status: VehicleStatus.INSPECTION_REQUIRED }),
              ...(dto.odometerKm !== undefined &&
                dto.odometerKm > vehicle.odometerKm && {
                  odometerKm: dto.odometerKm,
                }),
            },
          });
        }
        if (flag) {
          await tx.vehicleStatusLog.create({
            data: {
              vehicleId: vehicle.id,
              fromStatus: vehicle.status,
              toStatus: VehicleStatus.INSPECTION_REQUIRED,
              reason: 'Failed inspection',
              changedById: actor.id,
            },
          });
          await tx.auditLog.create({
            data: {
              actorId: actor.id,
              businessId: vehicle.businessId,
              action: 'Vehicle Status Changed',
              module: 'Fleet & Safety',
              targetType: 'Vehicle',
              targetId: vehicle.id,
              details: `${vehicle.registration}: ${vehicle.status} → ${VehicleStatus.INSPECTION_REQUIRED} (Failed inspection)`,
            },
          });
        }
        return { inspection, vehicle };
      },
    );
    if (failed.length) {
      await this.notifyFleet(
        vehicle.businessId,
        inspection.id,
        vehicle.registration,
        failed.map((f) => f.name),
      );
    }
    return {
      ...this.shape(inspection, await this.visibility(actor)),
      summary: {
        passed: dto.items.length - failed.length,
        failed: failed.length,
        durationSec: dto.durationSec ?? null,
      },
      cleared: !failed.length,
    };
  }

  private notifyFleet(
    businessId: string,
    inspectionId: string,
    rego: string,
    failed: string[],
  ) {
    return this.notify.toRoles(
      businessId,
      [UserRole.FLEET_MANAGER, UserRole.SUPERVISOR],
      NotificationType.INSPECTION,
      'Vehicle Issue Detected',
      `${rego} failed inspection: ${failed.join(', ')}`,
      { inspectionId },
    );
  }

  /** "Contact Fleet Manager" button. */
  async contactFleet(actor: AuthUser, id: string) {
    const insp = await this.getRaw(actor, id);
    const failed = insp.items
      .filter((i) => i.result === ChecklistResult.ISSUE)
      .map((i) => i.name);
    const v = await this.prisma.vehicle.findUniqueOrThrow({
      where: { id: insp.vehicleId },
    });
    await this.notifyFleet(v.businessId, id, v.registration, failed);
    return { notified: true };
  }

  async findAll(actor: AuthUser, q: InspectionQueryDto, onlyMine = false) {
    const { skip, take, page, limit } = paginate(q);
    const day = q.date ? new Date(q.date) : undefined;
    const visibility = await this.visibility(actor);
    if (q.driverId && !visibility.drivers && q.driverId !== actor.id)
      throw new ForbiddenException(
        'Driver permission required for this filter',
      );
    if (q.vehicleId && !visibility.vehicles)
      throw new ForbiddenException(
        'Vehicle permission required for this filter',
      );
    const field =
      actor.role === UserRole.DRIVER || actor.role === UserRole.ASSISTANT;
    const where: Prisma.InspectionWhereInput = {
      vehicle: {
        ...businessFilter(actor, q.businessId),
        ...(visibility.depots !== null && {
          depotId: { in: visibility.depots },
        }),
      },
      type: q.type,
      status: q.status,
      vehicleId: q.vehicleId,
      driverId: onlyMine || field ? actor.id : q.driverId,
      ...(day && { submittedAt: { gte: startOfDay(day), lte: endOfDay(day) } }),
      ...(q.search && {
        OR: [
          {
            vehicle: {
              registration: { contains: q.search, mode: 'insensitive' },
            },
          },
          { vehicle: { model: { contains: q.search, mode: 'insensitive' } } },
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
              ]
            : []),
        ],
      }),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.inspection.findMany({
        where,
        skip,
        take,
        include,
        orderBy: { submittedAt: 'desc' },
      }),
      this.prisma.inspection.count({ where }),
    ]);
    return pageResult(
      items.map((item) => this.shape(item, visibility)),
      total,
      page,
      limit,
    );
  }

  private async getRaw(actor: AuthUser, id: string) {
    const depotIds = await this.access.depotScope(actor);
    const field =
      actor.role === UserRole.DRIVER || actor.role === UserRole.ASSISTANT;
    const insp = await this.prisma.inspection.findFirst({
      where: {
        id,
        vehicle: {
          ...businessFilter(actor),
          ...(depotIds !== null && { depotId: { in: depotIds } }),
        },
        ...(field && { driverId: actor.id }),
      },
      include: { ...include, repairRequests: true },
    });
    if (!insp) throw new NotFoundException('Inspection not found');
    return insp;
  }

  async findOne(actor: AuthUser, id: string) {
    const [inspection, visibility] = await Promise.all([
      this.getRaw(actor, id),
      this.visibility(actor),
    ]);
    return {
      ...this.shape(inspection, visibility),
      repairRequests: visibility.repairs
        ? inspection.repairRequests
        : undefined,
    };
  }

  /** "Mark as reviewed". */
  async review(actor: AuthUser, id: string) {
    await this.getRaw(actor, id);
    const depotIds = await this.access.depotScope(actor);
    const updated = await this.prisma.inspection.updateMany({
      where: {
        id,
        vehicle: {
          ...businessFilter(actor),
          ...(depotIds !== null && { depotId: { in: depotIds } }),
        },
      },
      data: {
        status: InspectionStatus.REVIEWED,
        reviewedById: actor.id,
        reviewedAt: new Date(),
      },
    });
    if (!updated.count) throw new NotFoundException('Inspection not found');
    return this.findOne(actor, id);
  }

  /** "Ground Vehicle" from an inspection. */
  async ground(actor: AuthUser, id: string, reason?: string) {
    const insp = await this.getRaw(actor, id);
    return this.vehicles.setStatus(
      actor,
      insp.vehicleId,
      VehicleStatus.GROUNDED,
      reason ?? 'Grounded from inspection',
    );
  }

  /** Inspection Overview (supervisor): expected vs submitted vs failed today. */
  async todayOverview(actor: AuthUser, businessId?: string) {
    await this.access.assertPermission(
      actor,
      PermissionModule.INSPECTIONS,
      'view',
    );
    const scope = businessFilter(actor, businessId);
    const depotIds = await this.access.depotScope(actor);
    const scoped = {
      ...scope,
      ...(depotIds !== null && { depotId: { in: depotIds } }),
    };
    const today = { gte: startOfDay(), lte: endOfDay() };
    const [expected, submitted, failed, pending] =
      await this.prisma.$transaction([
        this.prisma.shift.count({
          where: {
            ...scoped,
            date: startOfDay(),
            status: { in: VISIBLE_TO_CREW },
            vehicleId: { not: null },
            vehicle: scoped,
          },
        }),
        this.prisma.inspection.count({
          where: { vehicle: scoped, type: 'PRE_SHIFT', submittedAt: today },
        }),
        this.prisma.inspection.count({
          where: { vehicle: scoped, result: 'FAILED', submittedAt: today },
        }),
        this.prisma.inspection.count({
          where: { vehicle: scoped, status: 'PENDING_REVIEW' },
        }),
      ]);
    return {
      expected,
      submitted,
      failed,
      pendingReview: pending,
      notSubmitted: Math.max(expected - submitted, 0),
      complianceRate: expected
        ? Math.round((submitted / expected) * 1000) / 10
        : null,
    };
  }

  /**
   * "Send driver reminders" (Pending Inspections alert): notifies today's
   * rostered drivers who have not submitted the pre-shift inspection. A driver
   * is reminded at most once per 30 minutes.
   */
  async remindPending(actor: AuthUser, businessId?: string) {
    await this.access.assertPermission(
      actor,
      PermissionModule.INSPECTIONS,
      'edit',
    );
    const shifts = await this.prisma.shift.findMany({
      where: {
        ...businessFilter(actor, businessId),
        ...(await this.access.depotWhere(actor)),
        date: startOfDay(),
        status: { in: [ShiftStatus.PUBLISHED, ShiftStatus.IN_PROGRESS] },
        driverId: { not: null },
        vehicleId: { not: null },
        inspections: { none: { type: InspectionType.PRE_SHIFT } },
      },
      select: {
        id: true,
        driverId: true,
        startTime: true,
        vehicle: { select: { registration: true } },
      },
    });
    const bucket = Math.floor(Date.now() / (30 * 60_000));
    let reminded = 0;
    for (const s of shifts) {
      const res = await this.prisma.notification.createMany({
        data: [
          {
            userId: s.driverId!,
            type: NotificationType.INSPECTION,
            title: 'Complete Pre-Shift Inspection',
            body: `Your supervisor asked you to complete the pre-shift inspection for ${s.vehicle?.registration ?? 'your vehicle'} (shift ${s.startTime}).`,
            data: { shiftId: s.id },
            dedupeKey: `inspection-nudge:${s.id}:${bucket}`,
          },
        ],
        skipDuplicates: true,
      });
      reminded += res.count;
    }
    return { pending: shifts.length, reminded };
  }
}
