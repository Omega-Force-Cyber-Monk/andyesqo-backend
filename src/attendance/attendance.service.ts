import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import {
  DeliveryStatus,
  InspectionResult,
  InspectionType,
  ShiftStatus,
  TimesheetStatus,
  UserRole,
} from '../generated/prisma/enums.js';
import { AccessService } from '../common/access/access.service.js';
import { AuditService } from '../common/audit/audit.service.js';
import { pageResult, paginate } from '../common/dto/pagination.dto.js';
import type { AuthUser } from '../common/types/auth-user.js';
import {
  businessFilter,
  dayRange,
  localDate,
  parseDateOnly,
} from '../common/utils/tenant.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  ClockInDto,
  ClockOutDto,
  CreateFuelLogDto,
  TimesheetQueryDto,
} from './dto/attendance.dto.js';

const hoursBetween = (a?: Date | null, b?: Date | null) =>
  a
    ? Math.round(
        (((b ?? new Date()).getTime() - a.getTime()) / 3600000) * 100,
      ) / 100
    : 0;

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  /** The caller's own published shift (today unless an id is given). */
  private async resolveShift(
    actor: AuthUser,
    shiftId?: string,
    statuses: ShiftStatus[] = [
      ShiftStatus.PUBLISHED,
      ShiftStatus.IN_PROGRESS,
      ShiftStatus.COMPLETED,
    ],
  ) {
    const shift = await this.prisma.shift.findFirst({
      where: {
        ...(shiftId ? { id: shiftId } : { date: localDate() }),
        status: { in: statuses },
        OR: [{ driverId: actor.id }, { assistantId: actor.id }],
      },
      include: { depot: true, vehicle: true, inspections: true },
    });
    if (!shift) throw new NotFoundException('No shift found for you today');
    return shift;
  }

  /** Clock In. Drivers must pass the pre-shift inspection first (fleet policy in the design). */
  async clockIn(actor: AuthUser, dto: ClockInDto) {
    const shift = await this.resolveShift(actor, dto.shiftId, [
      ShiftStatus.PUBLISHED,
      ShiftStatus.IN_PROGRESS,
    ]);
    if (actor.role === UserRole.DRIVER && shift.vehicleId) {
      const pre = shift.inspections
        .filter((i) => i.type === InspectionType.PRE_SHIFT)
        .sort((a, b) => b.submittedAt.getTime() - a.submittedAt.getTime())[0];
      if (!pre)
        throw new BadRequestException(
          'Complete the pre-shift vehicle inspection before clocking in',
        );
      if (pre.result === InspectionResult.FAILED) {
        throw new BadRequestException(
          'Vehicle failed inspection. Resolve all failures before starting your shift',
        );
      }
    }
    const now = new Date();
    const location = dto.location ?? shift.depot?.address;
    const attendance = await this.prisma.$transaction(async (tx) => {
      // Lock the attendance key so concurrent clock-ins cannot both succeed.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`clock:${shift.id}:${actor.id}`}))`;
      const existing = await tx.attendance.findUnique({
        where: { shiftId_userId: { shiftId: shift.id, userId: actor.id } },
      });
      if (existing?.clockInAt)
        throw new BadRequestException(
          'You have already clocked in for this shift',
        );
      const saved = await tx.attendance.upsert({
        where: { shiftId_userId: { shiftId: shift.id, userId: actor.id } },
        create: {
          shiftId: shift.id,
          userId: actor.id,
          clockInAt: now,
          clockInLocation: location,
        },
        update: { clockInAt: now, clockInLocation: location },
      });
      await tx.shift.updateMany({
        where: { id: shift.id, status: ShiftStatus.PUBLISHED },
        data: { status: ShiftStatus.IN_PROGRESS },
      });
      return saved;
    });
    return {
      attendance,
      shift: {
        id: shift.id,
        startTime: shift.startTime,
        endTime: shift.endTime,
      },
    };
  }

  /** End Shift checklist: fuel receipt, post-shift inspection, summary, clock out. */
  async endShiftSummary(actor: AuthUser, shiftId?: string) {
    const shift = await this.resolveShift(actor, shiftId);
    const attendance = await this.prisma.attendance.findUnique({
      where: { shiftId_userId: { shiftId: shift.id, userId: actor.id } },
    });
    const driverId = shift.driverId ?? undefined;
    const today = dayRange(shift.date);
    const [total, completed, fuel, damage] = await this.prisma.$transaction([
      this.prisma.delivery.count({
        where: {
          driverId,
          OR: [{ shiftId: shift.id }, { scheduledDropTime: today }],
        },
      }),
      this.prisma.delivery.count({
        where: {
          driverId,
          status: DeliveryStatus.COMPLETED,
          OR: [{ shiftId: shift.id }, { scheduledDropTime: today }],
        },
      }),
      this.prisma.fuelLog.findMany({ where: { shiftId: shift.id } }),
      this.prisma.damageReport.count({
        where: { vehicleId: shift.vehicleId ?? undefined, createdAt: today },
      }),
    ]);
    const post = shift.inspections.find(
      (i) => i.type === InspectionType.POST_SHIFT,
    );
    const isDriver = shift.driverId === actor.id;
    const steps = {
      fuelReceipt: !isDriver || fuel.length > 0,
      postShiftInspection: !isDriver || !!post,
      clockOut: !!attendance?.clockOutAt,
    };
    return {
      shift,
      attendance,
      hoursOnDuty: hoursBetween(attendance?.clockInAt, attendance?.clockOutAt),
      deliveries: { total, completed, allComplete: total === completed },
      distanceKm: attendance?.distanceKm ?? null,
      fuel: {
        litres: fuel.reduce((s, f) => s + (f.quantityLitres ?? 0), 0),
        kwh: fuel.reduce((s, f) => s + (f.energyKwh ?? 0), 0),
        amount: fuel.reduce((s, f) => s + Number(f.amountPaid ?? 0), 0),
        entries: fuel,
      },
      postShiftInspection: post ? post.result : 'PENDING',
      damageReportsToday: damage,
      steps,
      readyToClockOut: steps.fuelReceipt && steps.postShiftInspection,
    };
  }

  /** "Confirm & End Shift" → clock out and submit timesheet. */
  async clockOut(actor: AuthUser, dto: ClockOutDto, shiftId?: string) {
    const summary = await this.endShiftSummary(actor, shiftId);
    if (!summary.attendance?.clockInAt)
      throw new BadRequestException('You have not clocked in');
    if (summary.attendance.clockOutAt)
      throw new BadRequestException('Already clocked out');
    if (!summary.readyToClockOut) {
      throw new BadRequestException(
        'Complete required steps before clocking out (fuel receipt and post-shift inspection)',
      );
    }
    const attendanceId = summary.attendance.id;
    const attendance = await this.prisma.$transaction(async (tx) => {
      const closed = await tx.attendance.updateMany({
        where: { id: attendanceId, clockOutAt: null },
        data: {
          clockOutAt: new Date(),
          clockOutLocation: dto.location,
          distanceKm: dto.distanceKm,
          summaryNote: dto.note,
          timesheetStatus: TimesheetStatus.SUBMITTED,
        },
      });
      if (!closed.count) throw new BadRequestException('Already clocked out');
      if (summary.shift.driverId === actor.id)
        await tx.shift.updateMany({
          where: { id: summary.shift.id, status: ShiftStatus.IN_PROGRESS },
          data: { status: ShiftStatus.COMPLETED },
        });
      return tx.attendance.findUniqueOrThrow({ where: { id: attendanceId } });
    });
    return {
      attendance,
      totalHours: hoursBetween(attendance.clockInAt, attendance.clockOutAt),
      deliveriesCompleted: summary.deliveries.completed,
      timesheet: 'SUBMITTED',
    };
  }

  myHistory(actor: AuthUser, q: TimesheetQueryDto) {
    return this.prisma.attendance.findMany({
      where: {
        userId: actor.id,
        shift: {
          date: {
            gte: q.from ? parseDateOnly(q.from) : undefined,
            lte: q.to ? parseDateOnly(q.to) : undefined,
          },
        },
      },
      include: {
        shift: {
          include: { vehicle: { select: { registration: true, model: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 60,
    });
  }

  /** Timesheets / check-in-check-out list for managers. */
  async timesheets(actor: AuthUser, q: TimesheetQueryDto) {
    const { skip, take, page, limit } = paginate(q);
    const where: Prisma.AttendanceWhereInput = {
      user: await this.access.depotWhere(actor),
      shift: {
        ...businessFilter(actor, q.businessId),
        date: {
          gte: q.from ? parseDateOnly(q.from) : undefined,
          lte: q.to ? parseDateOnly(q.to) : undefined,
        },
      },
      timesheetStatus: q.timesheetStatus,
      userId: q.userId,
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.attendance.findMany({
        where,
        skip,
        take,
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              employeeId: true,
              role: true,
            },
          },
          shift: {
            select: { id: true, date: true, startTime: true, endTime: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.attendance.count({ where }),
    ]);
    return pageResult(
      items.map((a) => ({
        ...a,
        hours: hoursBetween(a.clockInAt, a.clockOutAt),
      })),
      total,
      page,
      limit,
    );
  }

  async approveTimesheet(actor: AuthUser, id: string) {
    const a = await this.prisma.attendance.findFirst({
      where: {
        id,
        shift: businessFilter(actor),
        user: await this.access.depotWhere(actor),
      },
      include: { shift: { select: { businessId: true } } },
    });
    if (!a) throw new NotFoundException('Timesheet not found');
    if (a.userId === actor.id)
      throw new ForbiddenException('You cannot approve your own timesheet');
    const approved = await this.prisma.attendance.updateMany({
      where: { id, timesheetStatus: TimesheetStatus.SUBMITTED },
      data: { timesheetStatus: TimesheetStatus.APPROVED },
    });
    if (!approved.count)
      throw new BadRequestException('Timesheet is not submitted');
    await this.audit.log(actor, {
      businessId: a.shift.businessId,
      action: 'Timesheet Approved',
      module: 'Roster',
      targetType: 'Attendance',
      targetId: id,
    });
    return this.prisma.attendance.findUniqueOrThrow({ where: { id } });
  }

  // ── Fuel / EV charging ──
  async addFuel(actor: AuthUser, dto: CreateFuelLogDto) {
    const shift = await this.resolveShift(actor, dto.shiftId, [
      ShiftStatus.IN_PROGRESS,
    ]);
    if (shift.driverId !== actor.id)
      throw new ForbiddenException('Only the driver records fuel');
    if (dto.refuelled && !dto.type)
      throw new BadRequestException('Fuel type is required');
    return this.prisma.fuelLog.create({
      data: {
        ...dto,
        shiftId: shift.id,
        userId: actor.id,
        vehicleId: shift.vehicleId,
        receiptPhotos: dto.receiptPhotos ?? [],
      },
    });
  }

  async fuelLogs(actor: AuthUser, q: TimesheetQueryDto, mine = false) {
    const { skip, take, page, limit } = paginate(q);
    const where: Prisma.FuelLogWhereInput = mine
      ? { userId: actor.id }
      : {
          user: {
            ...businessFilter(actor, q.businessId),
            ...(await this.access.depotWhere(actor)),
          },
          userId: q.userId,
        };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.fuelLog.findMany({
        where,
        skip,
        take,
        include: {
          vehicle: { select: { registration: true, model: true } },
          user: { select: { firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.fuelLog.count({ where }),
    ]);
    return pageResult(items, total, page, limit);
  }
}
