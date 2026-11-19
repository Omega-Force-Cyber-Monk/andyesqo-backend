import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import {
  AvailabilityStatus,
  DeliveryStatus,
  InspectionType,
  NotificationType,
  ShiftStatus,
  UserRole,
  VehicleStatus,
} from '../generated/prisma/enums.js';
import { VISIBLE_TO_CREW } from './shift-visibility.js';
import { AccessService } from '../common/access/access.service.js';
import { AuditService } from '../common/audit/audit.service.js';
import { pageResult, paginate } from '../common/dto/pagination.dto.js';
import { NotifyService } from '../common/notify/notify.service.js';
import type { AuthUser } from '../common/types/auth-user.js';
import {
  businessFilter,
  businessIdOf,
  localDate,
  parseDateOnly,
  todayRange,
} from '../common/utils/tenant.js';
import { ComplianceService } from '../compliance/compliance.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  AvailabilityQueryDto,
  CreateRosterDto,
  PublishDto,
  RosterQueryDto,
  SetAvailabilityDto,
  UpdateShiftDto,
} from './dto/roster.dto.js';

const person = {
  select: {
    id: true,
    firstName: true,
    lastName: true,
    employeeId: true,
    phone: true,
  },
};
const shiftInclude = {
  depot: { select: { id: true, name: true } },
  driver: person,
  assistant: person,
  vehicle: {
    select: {
      id: true,
      model: true,
      registration: true,
      code: true,
      status: true,
    },
  },
} satisfies Prisma.ShiftInclude;

/** Shifts that have started or ended can no longer be edited or cancelled. */
const LOCKED: ShiftStatus[] = [
  ShiftStatus.IN_PROGRESS,
  ShiftStatus.COMPLETED,
  ShiftStatus.CANCELLED,
];
const isField = (actor: AuthUser) =>
  actor.role === UserRole.DRIVER || actor.role === UserRole.ASSISTANT;

const name = (u?: { firstName: string; lastName: string | null } | null) =>
  u ? `${u.firstName} ${u.lastName ?? ''}`.trim() : '';

@Injectable()
export class RosterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly compliance: ComplianceService,
    private readonly notify: NotifyService,
    private readonly audit: AuditService,
    private readonly access: AccessService,
  ) {}

  /** Serializes roster writes for one business and date (prevents double booking). */
  private lockDay(
    tx: Prisma.TransactionClient,
    businessId: string,
    date: Date,
  ) {
    const key = `roster:${businessId}:${date.toISOString().slice(0, 10)}`;
    return tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
  }

  /** Depot must belong to the business and lie inside the actor's scope. */
  private async validateDepot(
    actor: AuthUser,
    businessId: string,
    depotId: string | null | undefined,
  ) {
    await this.access.assertDepot(actor, depotId);
    if (
      depotId &&
      !(await this.prisma.depot.findFirst({
        where: { id: depotId, businessId },
        select: { id: true },
      }))
    )
      throw new BadRequestException('Depot is outside this business');
  }

  private async shiftScope(
    actor: AuthUser,
    businessId?: string,
  ): Promise<Prisma.ShiftWhereInput> {
    return {
      ...businessFilter(actor, businessId),
      ...(await this.access.depotWhere(actor)),
    };
  }

  /** Throws with a list of problems if a crew cannot be rostered on that date. */
  private async validateCrews(
    db: Prisma.TransactionClient,
    depots: string[] | null,
    businessId: string,
    date: Date,
    crews: {
      driverId: string;
      assistantId?: string | null;
      vehicleId?: string | null;
    }[],
    ignoreShiftId?: string,
  ) {
    const problems: string[] = [];
    const userIds = crews
      .flatMap((c) => [c.driverId, c.assistantId])
      .filter((x): x is string => !!x);
    const vehicleIds = crews
      .map((c) => c.vehicleId)
      .filter((x): x is string => !!x);
    const [users, vehicles, availability, busy, compliance] = await Promise.all(
      [
        db.user.findMany({
          where: {
            id: { in: userIds },
            businessId,
            ...(depots !== null && { depotId: { in: depots } }),
          },
        }),
        db.vehicle.findMany({
          where: {
            id: { in: vehicleIds },
            businessId,
            ...(depots !== null && { depotId: { in: depots } }),
          },
        }),
        db.availability.findMany({
          where: { userId: { in: userIds }, date },
        }),
        db.shift.findMany({
          where: {
            businessId,
            date,
            status: { not: ShiftStatus.CANCELLED },
            id: ignoreShiftId ? { not: ignoreShiftId } : undefined,
            OR: [
              { driverId: { in: userIds } },
              { assistantId: { in: userIds } },
              { vehicleId: { in: vehicleIds } },
            ],
          },
        }),
        this.compliance.evaluateMany(userIds),
      ],
    );
    const userMap = new Map(users.map((u) => [u.id, u]));
    const seen = new Set<string>();
    for (const id of [...userIds, ...vehicleIds]) {
      if (seen.has(id))
        problems.push(`${id} is listed more than once in this roster`);
      seen.add(id);
    }
    for (const c of crews) {
      const d = userMap.get(c.driverId);
      if (!d || d.role !== UserRole.DRIVER)
        problems.push(`Driver ${c.driverId} not found`);
      if (c.assistantId) {
        const a = userMap.get(c.assistantId);
        if (!a || a.role !== UserRole.ASSISTANT || a.status !== 'ACTIVE')
          problems.push(`Assistant ${c.assistantId} not found`);
      }
      for (const id of [c.driverId, c.assistantId].filter(
        (x): x is string => !!x,
      )) {
        const u = userMap.get(id);
        const av = availability.find((a) => a.userId === id);
        if (av && av.status !== AvailabilityStatus.AVAILABLE)
          problems.push(`${name(u)} is ${av.status} on this date`);
        if (busy.some((s) => s.driverId === id || s.assistantId === id))
          problems.push(`${name(u)} already has a shift on this date`);
        const comp = compliance.get(id);
        if (comp && !comp.eligible)
          problems.push(
            `${name(u)} is not eligible: ${comp.issues.join(', ')}`,
          );
      }
      if (c.vehicleId) {
        const v = vehicles.find((x) => x.id === c.vehicleId);
        if (!v) problems.push(`Vehicle ${c.vehicleId} not found`);
        else if (
          ![VehicleStatus.AVAILABLE, VehicleStatus.ASSIGNED].includes(
            v.status as any,
          )
        ) {
          problems.push(`Vehicle ${v.registration} is ${v.status}`);
        }
        if (busy.some((s) => s.vehicleId === c.vehicleId))
          problems.push(
            `Vehicle ${v?.registration ?? c.vehicleId} is already rostered`,
          );
      }
    }
    if (problems.length) throw new BadRequestException(problems);
  }

  async create(actor: AuthUser, dto: CreateRosterDto) {
    const businessId = businessIdOf(actor, dto.businessId);
    const date = parseDateOnly(dto.date);
    await this.validateDepot(actor, businessId, dto.depotId);
    const depots = await this.access.depotScope(actor);
    const status = dto.publish ? ShiftStatus.PUBLISHED : ShiftStatus.DRAFT;
    const shifts = await this.prisma.$transaction(async (tx) => {
      await this.lockDay(tx, businessId, date);
      await this.validateCrews(tx, depots, businessId, date, dto.crews);
      const created = [];
      for (const c of dto.crews)
        created.push(
          await tx.shift.create({
            data: {
              businessId,
              date,
              depotId: dto.depotId,
              type: dto.type,
              startTime: dto.startTime,
              endTime: dto.endTime,
              breakStart: dto.breakStart,
              breakEnd: dto.breakEnd,
              driverId: c.driverId,
              assistantId: c.assistantId,
              vehicleId: c.vehicleId,
              status: c.vehicleId ? status : ShiftStatus.UNASSIGNED,
              publishedAt: dto.publish && c.vehicleId ? new Date() : undefined,
            },
            include: shiftInclude,
          }),
        );
      return created;
    });
    const published = shifts.filter((s) => s.status === ShiftStatus.PUBLISHED);
    await this.notifyCrew(published);
    await this.notifyPublished(businessId, published);
    await this.audit.log(actor, {
      businessId,
      action: dto.publish ? 'Roster Published' : 'Roster Created',
      module: 'Roster',
      details: `${shifts.length} shift(s) on ${dto.date}`,
    });
    return shifts;
  }

  /** Manager-side "Roster Published … N drivers notified" notification. */
  private async notifyPublished(
    businessId: string,
    shifts: {
      date: Date;
      driverId: string | null;
      assistantId: string | null;
    }[],
  ) {
    if (!shifts.length) return;
    const crew = new Set(
      shifts.flatMap((s) => [s.driverId, s.assistantId]).filter(Boolean),
    ).size;
    const dates = [
      ...new Set(shifts.map((s) => s.date.toISOString().slice(0, 10))),
    ].join(', ');
    await this.notify.toRoles(
      businessId,
      [UserRole.ROSTER_MANAGER, UserRole.BUSINESS_ADMIN, UserRole.SUPERVISOR],
      NotificationType.ROSTER,
      'Roster Published',
      `${shifts.length} shift(s) on ${dates} published. ${crew} crew member(s) notified.`,
    );
  }

  private async notifyCrew(
    shifts: {
      id: string;
      date: Date;
      startTime: string;
      endTime: string;
      driverId: string | null;
      assistantId: string | null;
    }[],
  ) {
    for (const s of shifts) {
      for (const uid of [s.driverId, s.assistantId]) {
        if (!uid) continue;
        await this.notify.toUser(
          uid,
          NotificationType.ROSTER,
          'New Shift Published',
          `You are rostered on ${s.date.toISOString().slice(0, 10)} ${s.startTime}–${s.endTime}.`,
          { shiftId: s.id },
        );
      }
    }
  }

  async findAll(actor: AuthUser, q: RosterQueryDto) {
    const { skip, take, page, limit } = paginate(q);
    const date: Prisma.DateTimeFilter =
      q.from || q.to
        ? {
            gte: q.from ? parseDateOnly(q.from) : undefined,
            lte: q.to ? parseDateOnly(q.to) : undefined,
          }
        : { equals: parseDateOnly(q.date) };
    const where: Prisma.ShiftWhereInput = {
      ...(await this.shiftScope(actor, q.businessId)),
      AND: q.depotId ? [{ depotId: q.depotId }] : [],
      date,
      status: q.status ?? { not: ShiftStatus.CANCELLED },
      type: q.type,
      ...(q.search && {
        OR: [
          {
            driver: { firstName: { contains: q.search, mode: 'insensitive' } },
          },
          {
            driver: { employeeId: { contains: q.search, mode: 'insensitive' } },
          },
          {
            assistant: {
              firstName: { contains: q.search, mode: 'insensitive' },
            },
          },
          {
            vehicle: {
              registration: { contains: q.search, mode: 'insensitive' },
            },
          },
        ],
      }),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.shift.findMany({
        where,
        skip,
        take,
        include: shiftInclude,
        orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      }),
      this.prisma.shift.count({ where }),
    ]);
    return pageResult(items, total, page, limit);
  }

  /** "Upcoming Shifts": next days grouped by date + time + depot with driver counts. */
  async upcoming(actor: AuthUser, businessId?: string, days = 7) {
    const from = new Date(localDate().getTime() + 86400000);
    const shifts = await this.prisma.shift.findMany({
      where: {
        ...(await this.shiftScope(actor, businessId)),
        date: { gte: from, lte: new Date(from.getTime() + days * 86400000) },
        status: { not: ShiftStatus.CANCELLED },
      },
      include: { depot: { select: { name: true } } },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    });
    const groups = new Map<
      string,
      {
        date: Date;
        startTime: string;
        endTime: string;
        depot: string | null;
        drivers: number;
      }
    >();
    for (const s of shifts) {
      const key = `${s.date.toISOString()}|${s.startTime}|${s.endTime}|${s.depotId}`;
      const g = groups.get(key) ?? {
        date: s.date,
        startTime: s.startTime,
        endTime: s.endTime,
        depot: s.depot?.name ?? null,
        drivers: 0,
      };
      if (s.driverId) g.drivers++;
      groups.set(key, g);
    }
    return [...groups.values()];
  }

  async findOne(actor: AuthUser, id: string) {
    const s = await this.prisma.shift.findFirst({
      where: {
        id,
        ...(await this.shiftScope(actor)),
        ...(isField(actor) && {
          status: { in: VISIBLE_TO_CREW },
          OR: [{ driverId: actor.id }, { assistantId: actor.id }],
        }),
      },
      include: {
        ...shiftInclude,
        attendances: isField(actor) ? { where: { userId: actor.id } } : true,
      },
    });
    if (!s) throw new NotFoundException('Shift not found');
    return s;
  }

  async update(actor: AuthUser, id: string, dto: UpdateShiftDto) {
    if (
      dto.status !== undefined &&
      dto.status !== ShiftStatus.DRAFT &&
      dto.status !== ShiftStatus.PUBLISHED
    )
      throw new BadRequestException(
        'Only DRAFT or PUBLISHED can be set here; cancel with DELETE',
      );
    const current = await this.findOne(actor, id);
    if (LOCKED.includes(current.status))
      throw new BadRequestException(
        `A ${current.status} shift can no longer be edited`,
      );
    if (dto.depotId !== undefined)
      await this.validateDepot(actor, current.businessId, dto.depotId);
    const depots = await this.access.depotScope(actor);
    const date = dto.date ? parseDateOnly(dto.date) : current.date;
    const { updated, notify } = await this.prisma.$transaction(async (tx) => {
      await this.lockDay(tx, current.businessId, date);
      if (date.getTime() !== current.date.getTime())
        await this.lockDay(tx, current.businessId, current.date);
      const s = await tx.shift.findUniqueOrThrow({ where: { id } });
      if (LOCKED.includes(s.status))
        throw new ConflictException('Shift was changed concurrently');
      const crew = {
        driverId: dto.driverId ?? s.driverId,
        assistantId:
          dto.assistantId === undefined ? s.assistantId : dto.assistantId,
        vehicleId: dto.vehicleId === undefined ? s.vehicleId : dto.vehicleId,
      };
      const changedCrew =
        dto.driverId !== undefined ||
        dto.assistantId !== undefined ||
        dto.vehicleId !== undefined ||
        dto.date !== undefined;
      if (changedCrew && crew.driverId)
        await this.validateCrews(
          tx,
          depots,
          s.businessId,
          date,
          [{ ...crew, driverId: crew.driverId }],
          id,
        );
      let status = dto.status ?? s.status;
      if (!crew.vehicleId) status = ShiftStatus.UNASSIGNED;
      else if (status === ShiftStatus.UNASSIGNED) status = ShiftStatus.DRAFT;
      const updated = await tx.shift.update({
        where: { id },
        data: {
          ...dto,
          date,
          status,
          // A rescheduled shift gets fresh reminders.
          ...((dto.date !== undefined || dto.startTime !== undefined) && {
            startReminderAt: null,
            inspectionReminderAt: null,
          }),
          publishedAt:
            status === ShiftStatus.PUBLISHED && s.status !== status
              ? new Date()
              : undefined,
        },
        include: shiftInclude,
      });
      return {
        updated,
        notify:
          status === ShiftStatus.PUBLISHED &&
          (s.status !== ShiftStatus.PUBLISHED || changedCrew),
      };
    });
    if (notify) await this.notifyCrew([updated]);
    await this.audit.log(actor, {
      businessId: updated.businessId,
      action: 'Shift Updated',
      module: 'Roster',
      targetType: 'Shift',
      targetId: id,
    });
    return updated;
  }

  async publish(actor: AuthUser, dto: PublishDto) {
    const businessId = businessIdOf(actor, dto.businessId);
    if (!dto.shiftIds?.length && !dto.date)
      throw new BadRequestException('Provide shiftIds or date');
    if (dto.depotId) await this.validateDepot(actor, businessId, dto.depotId);
    const where: Prisma.ShiftWhereInput = {
      businessId,
      ...(await this.access.depotWhere(actor)),
      status: ShiftStatus.DRAFT,
      vehicleId: { not: null },
      ...(dto.shiftIds?.length
        ? { id: { in: dto.shiftIds } }
        : {
            date: parseDateOnly(dto.date),
            ...(dto.depotId && { AND: [{ depotId: dto.depotId }] }),
          }),
    };
    const shifts = await this.prisma.$transaction(async (tx) => {
      const found = await tx.shift.findMany({ where });
      // Conditional update so a concurrent publish cannot notify twice.
      const published = [];
      for (const s of found) {
        const changed = await tx.shift.updateMany({
          where: { id: s.id, status: ShiftStatus.DRAFT },
          data: { status: ShiftStatus.PUBLISHED, publishedAt: new Date() },
        });
        if (changed.count) published.push(s);
      }
      return published;
    });
    await this.notifyCrew(shifts);
    await this.notifyPublished(businessId, shifts);
    await this.audit.log(actor, {
      businessId,
      action: 'Roster Published',
      module: 'Roster',
      details: `${shifts.length} shift(s) published`,
    });
    return { published: shifts.length };
  }

  async cancel(actor: AuthUser, id: string) {
    const s = await this.findOne(actor, id);
    if (LOCKED.includes(s.status))
      throw new BadRequestException(`A ${s.status} shift cannot be cancelled`);
    const changed = await this.prisma.shift.updateMany({
      where: { id, status: s.status },
      data: { status: ShiftStatus.CANCELLED },
    });
    if (!changed.count)
      throw new ConflictException('Shift was changed concurrently');
    if (s.status === ShiftStatus.PUBLISHED)
      for (const uid of [s.driverId, s.assistantId])
        if (uid)
          await this.notify.toUser(
            uid,
            NotificationType.ROSTER,
            'Shift Cancelled',
            `Your shift on ${s.date.toISOString().slice(0, 10)} ${s.startTime}–${s.endTime} was cancelled.`,
            { shiftId: s.id },
          );
    await this.audit.log(actor, {
      businessId: s.businessId,
      action: 'Shift Cancelled',
      module: 'Roster',
      targetType: 'Shift',
      targetId: id,
    });
    return this.prisma.shift.findUniqueOrThrow({
      where: { id },
      include: shiftInclude,
    });
  }

  /** Driver / assistant home: today's shift, vehicle, partner, clock and inspection state. */
  async myToday(actor: AuthUser) {
    const shift = await this.prisma.shift.findFirst({
      where: {
        date: localDate(),
        status: { in: VISIBLE_TO_CREW },
        OR: [{ driverId: actor.id }, { assistantId: actor.id }],
      },
      include: {
        ...shiftInclude,
        vehicle: true,
        attendances: { where: { userId: actor.id } },
        inspections: { orderBy: { submittedAt: 'desc' } },
      },
    });
    if (!shift) return { shift: null };
    const today = todayRange();
    const driverId = shift.driverId ?? undefined;
    const [total, completed, upcoming] = await this.prisma.$transaction([
      this.prisma.delivery.count({
        where: { driverId, scheduledDropTime: today },
      }),
      this.prisma.delivery.count({
        where: {
          driverId,
          scheduledDropTime: today,
          status: DeliveryStatus.COMPLETED,
        },
      }),
      this.prisma.delivery.findMany({
        where: {
          driverId,
          scheduledDropTime: today,
          status: {
            in: [
              DeliveryStatus.PENDING,
              DeliveryStatus.IN_PROGRESS,
              DeliveryStatus.PICKED_UP,
            ],
          },
        },
        orderBy: [{ sortOrder: 'asc' }, { scheduledDropTime: 'asc' }],
        take: 5,
      }),
    ]);
    const pre = shift.inspections.find(
      (i) => i.type === InspectionType.PRE_SHIFT,
    );
    const attendance = shift.attendances[0] ?? null;
    return {
      shift,
      role: shift.driverId === actor.id ? 'DRIVER' : 'ASSISTANT',
      vehicleCheck: pre ? pre.result : 'PENDING',
      clock: attendance?.clockOutAt
        ? 'CLOCKED_OUT'
        : attendance?.clockInAt
          ? 'CLOCKED_IN'
          : 'NOT_STARTED',
      attendance,
      tasks: { total, completed, remaining: total - completed },
      upcomingDeliveries: upcoming,
    };
  }

  myShifts(actor: AuthUser, q: RosterQueryDto) {
    return this.prisma.shift.findMany({
      where: {
        OR: [{ driverId: actor.id }, { assistantId: actor.id }],
        status: { in: VISIBLE_TO_CREW },
        date: {
          gte: q.from ? parseDateOnly(q.from) : localDate(),
          lte: q.to ? parseDateOnly(q.to) : undefined,
        },
      },
      include: shiftInclude,
      orderBy: { date: 'asc' },
      take: 50,
    });
  }

  // ── Availability ──

  /** Driver / Assistant Availability tables with overview counts. */
  async availability(actor: AuthUser, q: AvailabilityQueryDto) {
    const date = parseDateOnly(q.date);
    const role = q.role ?? UserRole.DRIVER;
    if (role !== UserRole.DRIVER && role !== UserRole.ASSISTANT)
      throw new BadRequestException('role must be DRIVER or ASSISTANT');
    const users = await this.prisma.user.findMany({
      where: {
        ...businessFilter(actor, q.businessId),
        ...(await this.access.depotWhere(actor)),
        ...(q.depotId && { AND: [{ depotId: q.depotId }] }),
        role,
        status: 'ACTIVE',
        ...(q.search && {
          OR: [
            { firstName: { contains: q.search, mode: 'insensitive' } },
            { lastName: { contains: q.search, mode: 'insensitive' } },
            { employeeId: { contains: q.search, mode: 'insensitive' } },
          ],
        }),
      },
      include: {
        depot: { select: { id: true, name: true } },
        availability: { where: { date } },
        driverShifts: {
          where: { date, status: { not: ShiftStatus.CANCELLED } },
          include: { vehicle: true, assistant: person },
        },
        assistantShifts: {
          where: { date, status: { not: ShiftStatus.CANCELLED } },
          include: { vehicle: true, driver: person },
        },
      },
      orderBy: { employeeId: 'asc' },
    });
    const compliance = await this.compliance.evaluateMany(
      users.map((u) => u.id),
    );
    const rows = users.map((u) => {
      const shift = u.driverShifts[0] ?? u.assistantShifts[0] ?? null;
      const availability =
        u.availability[0]?.status ?? AvailabilityStatus.AVAILABLE;
      const c = compliance.get(u.id)!;
      return {
        user: {
          id: u.id,
          firstName: u.firstName,
          lastName: u.lastName,
          employeeId: u.employeeId,
          depot: u.depot,
          preferredShift: u.preferredShift,
        },
        availability,
        note: u.availability[0]?.note ?? null,
        shift: shift && {
          id: shift.id,
          startTime: shift.startTime,
          endTime: shift.endTime,
          vehicle: shift.vehicle?.registration ?? null,
        },
        pairedWith:
          u.driverShifts[0]?.assistant ?? u.assistantShifts[0]?.driver ?? null,
        compliance: c.overall,
        eligible: c.eligible,
        status: shift ? 'ROSTERED' : 'NO_SHIFT',
      };
    });
    const filtered = q.availability
      ? rows.filter((r) => r.availability === q.availability)
      : rows;
    const total = rows.length || 1;
    const count = (pred: (r: (typeof rows)[number]) => boolean) => {
      const n = rows.filter(pred).length;
      return { count: n, percent: Math.round((n / total) * 100) };
    };
    return {
      date,
      overview: {
        available: count(
          (r) => r.availability === 'AVAILABLE' && r.status === 'NO_SHIFT',
        ),
        rostered: count((r) => r.status === 'ROSTERED'),
        unavailable: count((r) => r.availability === 'UNAVAILABLE'),
        onLeave: count((r) => r.availability === 'ON_LEAVE'),
      },
      rows: filtered,
    };
  }

  async setAvailability(actor: AuthUser, dto: SetAvailabilityDto) {
    const user = await this.prisma.user.findFirst({
      where: {
        id: dto.userId,
        ...businessFilter(actor),
        ...(await this.access.depotWhere(actor)),
        role: { in: [UserRole.DRIVER, UserRole.ASSISTANT] },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    const date = parseDateOnly(dto.date);
    const saved = await this.prisma.availability.upsert({
      where: { userId_date: { userId: dto.userId, date } },
      create: { userId: dto.userId, date, status: dto.status, note: dto.note },
      update: { status: dto.status, note: dto.note },
    });
    await this.audit.log(actor, {
      businessId: user.businessId,
      action: 'Availability Updated',
      module: 'Roster',
      targetType: 'User',
      targetId: user.id,
      details: `${dto.date}: ${dto.status}`,
    });
    return saved;
  }
}
