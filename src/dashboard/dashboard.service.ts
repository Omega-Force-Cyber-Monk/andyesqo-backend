import { Injectable, NotFoundException } from '@nestjs/common';
import {
  BusinessStatus,
  PermissionModule,
  DamageReportStatus,
  DeliveryStatus,
  InspectionResult,
  InspectionStatus,
  RepairStatus,
  ShiftStatus,
  TimesheetStatus,
  UserRole,
  UserStatus,
  VehicleStatus,
} from '../generated/prisma/enums.js';
import { publicUser } from '../auth/auth.service.js';
import { AccessService } from '../common/access/access.service.js';
import type { AuthUser } from '../common/types/auth-user.js';
import {
  businessFilter,
  dayOf,
  dayRange,
  localDate,
  todayRange,
} from '../common/utils/tenant.js';
import { ComplianceService } from '../compliance/compliance.service.js';
import { DeliveriesService, isLate } from '../deliveries/deliveries.service.js';
import { InspectionsService } from '../inspections/inspections.service.js';
import { MaintenanceService } from '../maintenance/maintenance.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RosterService } from '../roster/roster.service.js';
import { VehiclesService } from '../vehicles/vehicles.service.js';

const pct = (a: number, b: number) =>
  b ? Math.round((a / b) * 1000) / 10 : null;

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly compliance: ComplianceService,
    private readonly deliveries: DeliveriesService,
    private readonly inspections: InspectionsService,
    private readonly maintenance: MaintenanceService,
    private readonly rosterService: RosterService,
    private readonly vehicles: VehiclesService,
    private readonly access: AccessService,
  ) {}

  /** Tenant + depot filter usable on Shift, Vehicle, Delivery and User. */
  private async scope(actor: AuthUser, businessId?: string) {
    return {
      ...businessFilter(actor, businessId),
      ...(await this.access.depotWhere(actor)),
    };
  }

  /** Runs a dashboard section only when the caller may view its module (null otherwise). */
  private async section<T>(
    actor: AuthUser,
    module: PermissionModule,
    load: () => Promise<T>,
  ): Promise<T | null> {
    return (await this.access.canView(actor, module)) ? load() : null;
  }

  /** Roster Dashboard home. */
  async roster(actor: AuthUser, businessId?: string) {
    const [todayRoster, alerts, upcoming] = await Promise.all([
      this.section(actor, PermissionModule.ROSTER, () =>
        this.rosterService.findAll(actor, { businessId, limit: 50, page: 1 }),
      ),
      this.section(actor, PermissionModule.COMPLIANCE, () =>
        this.compliance.alerts(actor, businessId),
      ),
      this.section(actor, PermissionModule.ROSTER, () =>
        this.rosterService.upcoming(actor, businessId),
      ),
    ]);
    return {
      todayRoster: todayRoster?.items ?? null,
      complianceAlerts: alerts?.slice(0, 10) ?? null,
      upcomingShifts: upcoming,
    };
  }

  /** Fleet Dashboard home. */
  async fleet(actor: AuthUser, businessId?: string) {
    const scope = await this.scope(actor, businessId);
    const [
      status,
      attention,
      recentDamage,
      newDamage,
      pendingRepairs,
      heldVehicles,
      upcoming,
    ] = await Promise.all([
      this.section(actor, PermissionModule.VEHICLES, () =>
        this.vehicles.stats(actor, businessId),
      ),
      this.section(actor, PermissionModule.VEHICLES, () =>
        this.vehicles.attention(actor, businessId),
      ),
      this.section(actor, PermissionModule.INSPECTIONS, () =>
        this.prisma.damageReport.findMany({
          where: { vehicle: scope },
          orderBy: { createdAt: 'desc' },
          take: 5,
          include: {
            vehicle: { select: { registration: true, model: true } },
            reportedBy: { select: { firstName: true, lastName: true } },
            damageType: { select: { name: true } },
          },
        }),
      ),
      this.section(actor, PermissionModule.INSPECTIONS, () =>
        this.prisma.damageReport.count({
          where: {
            vehicle: scope,
            status: {
              in: [
                DamageReportStatus.SUBMITTED,
                DamageReportStatus.UNDER_REVIEW,
              ],
            },
          },
        }),
      ),
      this.section(actor, PermissionModule.REPAIRS, () =>
        this.prisma.repairRequest.count({
          where: { vehicle: scope, status: RepairStatus.PENDING_REVIEW },
        }),
      ),
      this.section(actor, PermissionModule.VEHICLES, () =>
        this.prisma.vehicle.count({
          where: { ...scope, status: VehicleStatus.INSPECTION_REQUIRED },
        }),
      ),
      this.section(actor, PermissionModule.MAINTENANCE, () =>
        this.maintenance.upcoming(actor, businessId),
      ),
    ]);
    return {
      fleetStatus: status,
      requiresAttention: attention,
      recentDamageReports: recentDamage && {
        newCount: newDamage,
        items: recentDamage,
      },
      repairRequestsPendingReview: pendingRepairs,
      vehiclesBlockedByInspection: heldVehicles,
      upcomingMaintenance: upcoming,
    };
  }

  /** Supervisor Overview. */
  async supervisor(actor: AuthUser, businessId?: string) {
    const scope = await this.scope(actor, businessId);
    const today = todayRange();
    const [
      deliveryStats,
      onRoute,
      loading,
      staged,
      inspection,
      damageToday,
      yesterdayActive,
    ] = await Promise.all([
      this.section(actor, PermissionModule.DELIVERIES, () =>
        this.deliveries.stats(actor, undefined, businessId),
      ),
      this.prisma.attendance.count({
        where: {
          shift: scope,
          clockInAt: today,
          clockOutAt: null,
          user: {
            role: UserRole.DRIVER,
            deliveries: {
              some: { status: { in: ['IN_PROGRESS', 'PICKED_UP', 'DELAYED'] } },
            },
          },
        },
      }),
      this.prisma.attendance.count({
        where: {
          shift: scope,
          clockInAt: today,
          clockOutAt: null,
          user: {
            role: UserRole.DRIVER,
            deliveries: {
              none: { status: { in: ['IN_PROGRESS', 'PICKED_UP', 'DELAYED'] } },
            },
          },
        },
      }),
      this.prisma.shift.count({
        where: {
          ...scope,
          date: localDate(),
          status: ShiftStatus.PUBLISHED,
          attendances: { none: {} },
        },
      }),
      this.section(actor, PermissionModule.INSPECTIONS, () =>
        this.inspections.todayOverview(actor, businessId),
      ),
      this.section(actor, PermissionModule.INSPECTIONS, () =>
        this.prisma.damageReport.count({
          where: { vehicle: scope, createdAt: today },
        }),
      ),
      this.prisma.attendance.count({
        where: {
          shift: scope,
          user: { role: UserRole.DRIVER },
          clockInAt: {
            gte: dayRange(new Date(localDate().getTime() - 86400000)).gte,
            lt: todayRange().gte,
          },
        },
      }),
    ]);
    const activeDrivers = onRoute + loading;
    return {
      fleetStaffing: {
        activeDrivers,
        inTransit: onRoute,
        loadingBay: loading,
        staged,
        vsYesterday: activeDrivers - yesterdayActive,
      },
      deliveries: deliveryStats,
      inspectionOverview: inspection,
      liveAlerts: {
        delayedDeliveries: deliveryStats?.delayed ?? null,
        failedInspections: inspection?.failed ?? null,
        pendingInspections: inspection?.notSubmitted ?? null,
        damageReports: damageToday,
      },
    };
  }

  /** Business admin "Admin Operations Dashboard". */
  async businessAdmin(actor: AuthUser, businessId?: string) {
    const scope = await this.scope(actor, businessId);
    const today = todayRange();
    const [
      users,
      drivers,
      onShift,
      vehicles,
      deliveryStats,
      inTransit,
      redTag,
      failedInspections,
      pendingTimesheets,
    ] = await Promise.all([
      this.prisma.user.count({
        where: {
          ...scope,
          status: UserStatus.ACTIVE,
          role: { not: UserRole.SUPER_ADMIN },
        },
      }),
      this.prisma.user.count({
        where: { ...scope, role: UserRole.DRIVER, status: UserStatus.ACTIVE },
      }),
      this.prisma.attendance.count({
        where: {
          shift: scope,
          clockInAt: today,
          clockOutAt: null,
          user: { role: UserRole.DRIVER },
        },
      }),
      this.prisma.vehicle.count({ where: scope }),
      this.deliveries.stats(actor, undefined, businessId),
      this.prisma.vehicle.count({
        where: {
          ...scope,
          deliveries: {
            some: { status: { in: ['IN_PROGRESS', 'PICKED_UP', 'DELAYED'] } },
          },
        },
      }),
      this.prisma.vehicle.findMany({
        where: { ...scope, status: VehicleStatus.GROUNDED },
        select: { id: true, registration: true, model: true },
      }),
      this.prisma.inspection.count({
        where: {
          vehicle: scope,
          result: InspectionResult.FAILED,
          status: { not: InspectionStatus.REVIEWED },
        },
      }),
      this.prisma.attendance.count({
        where: {
          shift: { ...scope, date: { lt: localDate() } },
          clockOutAt: null,
          clockInAt: { not: null },
          timesheetStatus: TimesheetStatus.OPEN,
        },
      }),
    ]);
    return {
      cards: {
        totalUsers: users,
        activeDrivers: drivers,
        driversOnShift: onShift,
        vehicles,
        todayDeliveries: deliveryStats,
      },
      liveOperations: {
        activeDrivers: onShift,
        activeDeliveries: deliveryStats.inProgress,
        delayedDeliveries: deliveryStats.delayed,
        vehiclesInTransit: inTransit,
      },
      alerts: {
        redTagVehicles: redTag,
        failedInspections,
        delayedDeliveries: deliveryStats.delayed,
        pendingReports: pendingTimesheets,
      },
    };
  }

  /** Super Admin Dashboard. */
  async platform() {
    const [businesses, admins, activeAdmins, regions, setupList, activity] =
      await Promise.all([
        this.prisma.business.groupBy({
          by: ['status'],
          _count: { _all: true },
        }),
        this.prisma.user.count({ where: { role: UserRole.BUSINESS_ADMIN } }),
        this.prisma.user.count({
          where: { role: UserRole.BUSINESS_ADMIN, status: UserStatus.ACTIVE },
        }),
        this.prisma.region.count({ where: { businesses: { some: {} } } }),
        this.prisma.business.findMany({
          orderBy: { createdAt: 'desc' },
          take: 5,
          include: {
            users: {
              where: { role: UserRole.BUSINESS_ADMIN },
              select: { firstName: true, lastName: true },
              take: 1,
            },
            regions: { include: { region: { select: { code: true } } } },
          },
        }),
        this.prisma.auditLog.findMany({
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: {
            actor: { select: { firstName: true, lastName: true, role: true } },
            business: { select: { name: true } },
          },
        }),
      ]);
    const n = (...s: BusinessStatus[]) =>
      businesses
        .filter((g) => s.includes(g.status))
        .reduce((a, g) => a + g._count._all, 0);
    return {
      cards: {
        totalBusinesses: businesses.reduce((a, g) => a + g._count._all, 0),
        activeBusinesses: n('ACTIVE', 'READY'),
        administrators: admins,
        activeAdministrators: activeAdmins,
        regionsCovered: regions,
        pendingSetup: n('PENDING_SETUP', 'INCOMPLETE'),
      },
      businessSetupStatus: setupList.map((b) => ({
        id: b.id,
        name: b.name,
        businessType: b.businessType,
        admin: b.users[0]
          ? `${b.users[0].firstName} ${b.users[0].lastName ?? ''}`.trim()
          : null,
        regions: b.regions.map((r) => r.region.code),
        status: b.status,
      })),
      recentActivity: activity,
    };
  }

  /** Supervisor "Reports". */
  async reports(
    actor: AuthUser,
    from?: string,
    to?: string,
    businessId?: string,
  ) {
    const scope = await this.scope(actor, businessId);
    const range = {
      gte: from
        ? dayRange(dayOf(from)).gte
        : new Date(Date.now() - 30 * 86400000),
      lte: to ? dayRange(dayOf(to)).lte : todayRange().lte,
    };
    const [deliveries, inspections, expectedInspections, grounded, damage] =
      await Promise.all([
        this.prisma.delivery.findMany({
          where: {
            ...scope,
            scheduledDropTime: range,
            status: { not: DeliveryStatus.CANCELLED },
          },
          select: {
            status: true,
            eta: true,
            windowEnd: true,
            scheduledDropTime: true,
            deliveredAt: true,
            pickedUpAt: true,
            startedAt: true,
          },
        }),
        this.prisma.inspection.groupBy({
          by: ['result', 'status'],
          where: { vehicle: scope, submittedAt: range },
          _count: { _all: true },
        }),
        this.prisma.shift.count({
          where: { ...scope, date: range, vehicleId: { not: null } },
        }),
        this.prisma.vehicle.count({
          where: { ...scope, status: VehicleStatus.GROUNDED },
        }),
        this.prisma.damageReport.count({
          where: { vehicle: scope, createdAt: range },
        }),
      ]);
    const completed = deliveries.filter((d) => d.status === 'COMPLETED');
    const onTime = deliveries.filter((d) => !isLate(d));
    const dropTimes = completed
      .filter((d) => d.deliveredAt && (d.pickedUpAt ?? d.startedAt))
      .map(
        (d) =>
          (d.deliveredAt!.getTime() -
            (d.pickedUpAt ?? d.startedAt)!.getTime()) /
          60000,
      );
    const inspTotal = inspections.reduce((a, g) => a + g._count._all, 0);
    const count = (pred: (g: (typeof inspections)[number]) => boolean) =>
      inspections.filter(pred).reduce((a, g) => a + g._count._all, 0);
    return {
      range,
      fleetOnTimeRate: {
        percent: pct(onTime.length, deliveries.length),
        onTime: onTime.length,
        total: deliveries.length,
      },
      inspectionSubmissionRate: {
        percent: pct(inspTotal, expectedInspections),
        submitted: inspTotal,
        expected: expectedInspections,
      },
      redTagGroundings: grounded,
      averageDropTimeMin: dropTimes.length
        ? Math.round(
            (dropTimes.reduce((a, b) => a + b, 0) / dropTimes.length) * 10,
          ) / 10
        : null,
      deliveryBreakdown: {
        total: deliveries.length,
        onTime: onTime.length,
        delayed: deliveries.length - onTime.length,
        completed: completed.length,
        pending: deliveries.filter((d) => d.status === 'PENDING').length,
      },
      inspectionLogs: {
        expected: expectedInspections,
        approved: count((g) => g.status === 'REVIEWED'),
        pendingSignOff: count((g) => g.status === 'PENDING_REVIEW'),
        failed: count((g) => g.result === 'FAILED'),
      },
      damageIncidentTickets: damage,
    };
  }

  /** "Active Driver Roster" modal: drivers on shift now with progress. */
  async liveDrivers(actor: AuthUser, search?: string, businessId?: string) {
    const scope = await this.scope(actor, businessId);
    const today = todayRange();
    const att = await this.prisma.attendance.findMany({
      where: {
        shift: scope,
        clockInAt: today,
        clockOutAt: null,
        user: {
          role: UserRole.DRIVER,
          ...(await this.access.depotWhere(actor)),
          ...(search && {
            OR: [
              { firstName: { contains: search, mode: 'insensitive' } },
              { lastName: { contains: search, mode: 'insensitive' } },
            ],
          }),
        },
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            employeeId: true,
          },
        },
        shift: {
          include: {
            vehicle: { select: { registration: true, model: true } },
            depot: { select: { name: true } },
          },
        },
      },
    });
    const rows = await Promise.all(
      att.map(async (a) => {
        const ds = await this.prisma.delivery.findMany({
          where: { driverId: a.userId, scheduledDropTime: today },
          select: {
            status: true,
            eta: true,
            windowEnd: true,
            scheduledDropTime: true,
            deliveredAt: true,
            updatedAt: true,
          },
        });
        const done = ds.filter((d) => d.status === 'COMPLETED');
        const active = ds.some((d) =>
          ['IN_PROGRESS', 'PICKED_UP', 'DELAYED'].includes(d.status),
        );
        return {
          driver: a.user,
          vehicle: a.shift.vehicle,
          depot: a.shift.depot?.name ?? null,
          status: active ? 'ON_ROUTE' : 'AT_DEPOT',
          deliveries: { completed: done.length, total: ds.length },
          onTimeRate: pct(done.filter((d) => !isLate(d)).length, done.length),
          lastUpdate:
            ds
              .map((d) => d.updatedAt)
              .sort((x, y) => y.getTime() - x.getTime())[0] ?? a.clockInAt,
        };
      }),
    );
    return { activeDrivers: rows.length, rows };
  }

  /** Supervisor "Driver Details": profile, check-in/out, allocation, compliance, performance, history. */
  async driverOverview(actor: AuthUser, driverId: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        id: driverId,
        ...(await this.scope(actor)),
        role: { in: [UserRole.DRIVER, UserRole.ASSISTANT] },
      },
      include: { depot: true, assignedVehicles: true },
    });
    if (!user) throw new NotFoundException('Driver not found');
    const today = todayRange();
    const [shift, compliance, all, history] = await Promise.all([
      this.prisma.shift.findFirst({
        where: {
          date: localDate(),
          OR: [{ driverId }, { assistantId: driverId }],
          status: { not: ShiftStatus.CANCELLED },
        },
        include: {
          vehicle: true,
          depot: true,
          attendances: { where: { userId: driverId } },
        },
      }),
      this.compliance.evaluateMany([driverId]),
      this.prisma.delivery.findMany({
        where: { driverId },
        select: {
          status: true,
          eta: true,
          windowEnd: true,
          scheduledDropTime: true,
          deliveredAt: true,
          pickedUpAt: true,
          startedAt: true,
        },
      }),
      this.section(actor, PermissionModule.DELIVERIES, () =>
        this.deliveries.historyFor(actor, driverId),
      ),
    ]);
    const completed = all.filter((d) => d.status === 'COMPLETED');
    const onTime = completed.filter((d) => !isLate(d)).length;
    const times = completed
      .filter((d) => d.deliveredAt && (d.pickedUpAt ?? d.startedAt))
      .map(
        (d) =>
          (d.deliveredAt!.getTime() -
            (d.pickedUpAt ?? d.startedAt)!.getTime()) /
          60000,
      );
    const todays = await this.prisma.delivery.findMany({
      where: { driverId, scheduledDropTime: today },
      select: { status: true },
    });
    return {
      profile: publicUser(user),
      checkInOut: shift
        ? {
            scheduled: `${shift.startTime}-${shift.endTime}`,
            checkIn: shift.attendances[0]?.clockInAt ?? null,
            checkOut: shift.attendances[0]?.clockOutAt ?? null,
            status: shift.attendances[0]?.clockOutAt
              ? 'CLOCKED_OUT'
              : shift.attendances[0]?.clockInAt
                ? 'ACTIVE'
                : 'NOT_STARTED',
          }
        : null,
      allocation: {
        depot: shift?.depot ?? user.depot,
        vehicle: shift?.vehicle ?? user.assignedVehicles[0] ?? null,
      },
      todayDeliveries: {
        assigned: todays.length,
        completed: todays.filter((d) => d.status === 'COMPLETED').length,
        remaining: todays.filter(
          (d) => !['COMPLETED', 'CANCELLED'].includes(d.status),
        ).length,
      },
      compliance: compliance.get(driverId),
      performance: {
        totalDeliveries: all.length,
        completed: completed.length,
        onTime,
        delayed: completed.length - onTime,
        averageDeliveryTimeMin: times.length
          ? Math.round(times.reduce((a, b) => a + b, 0) / times.length)
          : null,
        onTimeRate: pct(onTime, completed.length),
      },
      deliveryHistory: history?.map((h) => ({ ...h, late: isLate(h) })) ?? null,
    };
  }
}
