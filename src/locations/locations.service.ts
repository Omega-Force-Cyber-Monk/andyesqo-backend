import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthUser } from '../common/types/auth-user.js';
import { businessIdOf, localDate } from '../common/utils/tenant.js';
import {
  DeliveryStatus,
  ShiftStatus,
  UserRole,
} from '../generated/prisma/enums.js';
import { isLate } from '../deliveries/delivery.rules.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  LatestLocationsQueryDto,
  LocationHistoryQueryDto,
  LocationUpdateDto,
} from './locations.dto.js';

/** Great-circle distance in metres. */
export function haversineMetres(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) *
      Math.cos(rad(b.latitude)) *
      Math.sin(dLon / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

/** Speed between the two latest points (null when unknown or too far apart in time). */
export function speedKmh(
  points: { latitude: number; longitude: number; recordedAt: Date }[],
) {
  if (points.length < 2) return null;
  const [latest, previous] = points;
  const seconds =
    (latest.recordedAt.getTime() - previous.recordedAt.getTime()) / 1000;
  if (seconds <= 0 || seconds > 300) return null;
  return (
    Math.round((haversineMetres(previous, latest) / seconds) * 3.6 * 10) / 10
  );
}

/** A point older than this is shown as stale on the live map. */
export const STALE_AFTER_MS = 15 * 60_000;
const MAX_POINT_AGE_MS = 24 * 60 * 60_000;
const CLOCK_SKEW_MS = 60_000;
import { RoutingProvider } from './routing-provider.js';
import { AccessService } from '../common/access/access.service.js';

@Injectable()
export class LocationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly routing: RoutingProvider,
    private readonly access: AccessService,
  ) {}

  async deliveryRoute(user: AuthUser, deliveryId: string) {
    if (user.role !== UserRole.DRIVER)
      throw new ForbiddenException(
        'Only the assigned driver can request a route',
      );
    const businessId = businessIdOf(user);
    const depotIds = await this.access.depotScope(user);
    const delivery = await this.prisma.delivery.findFirst({
      where: {
        id: deliveryId,
        businessId,
        driverId: user.id,
        ...(depotIds !== null && { depotId: { in: depotIds } }),
      },
      select: { deliveryAddress: true },
    });
    if (!delivery) throw new NotFoundException('Delivery not found');
    const location = await this.prisma.driverLocation.findFirst({
      where: { driverId: user.id },
      orderBy: [{ recordedAt: 'desc' }, { id: 'desc' }],
      select: { latitude: true, longitude: true, recordedAt: true },
    });
    if (!location || location.recordedAt.getTime() < Date.now() - 15 * 60_000) {
      throw new BadRequestException(
        'A location from the last 15 minutes is required',
      );
    }
    return this.routing.route({
      origin: { latitude: location.latitude, longitude: location.longitude },
      destinationAddress: delivery.deliveryAddress,
    });
  }

  /**
   * Drivers are tracked only while clocked in to a shift. Points must fall
   * between clock-in and now (small clock skew allowed).
   */
  private async activeAttendance(user: AuthUser) {
    if (user.role !== UserRole.DRIVER)
      throw new ForbiddenException('Only drivers can submit locations');
    businessIdOf(user);
    const attendance = await this.prisma.attendance.findFirst({
      where: {
        userId: user.id,
        clockInAt: { not: null, gte: new Date(Date.now() - MAX_POINT_AGE_MS) },
        clockOutAt: null,
      },
      orderBy: { clockInAt: 'desc' },
      select: { clockInAt: true },
    });
    if (!attendance?.clockInAt)
      throw new ForbiddenException(
        'Location is only recorded while you are clocked in',
      );
    return attendance.clockInAt;
  }

  private toPoint(user: AuthUser, clockInAt: Date, dto: LocationUpdateDto) {
    const recordedAt = new Date(dto.recordedAt);
    const t = recordedAt.getTime();
    if (
      !Number.isFinite(t) ||
      t > Date.now() + CLOCK_SKEW_MS ||
      t < clockInAt.getTime() - CLOCK_SKEW_MS
    )
      throw new BadRequestException(
        'Location timestamp must be between clock-in and now',
      );
    return {
      driverId: user.id,
      latitude: dto.latitude,
      longitude: dto.longitude,
      accuracy: dto.accuracy,
      recordedAt,
    };
  }

  async record(user: AuthUser, dto: LocationUpdateDto) {
    const clockInAt = await this.activeAttendance(user);
    return this.prisma.driverLocation.create({
      data: this.toPoint(user, clockInAt, dto),
    });
  }

  async recordBatch(user: AuthUser, points: LocationUpdateDto[]) {
    const clockInAt = await this.activeAttendance(user);
    const data = points.map((p) => this.toPoint(user, clockInAt, p));
    const { count } = await this.prisma.driverLocation.createMany({ data });
    return { accepted: count };
  }

  async latest(user: AuthUser, query: LatestLocationsQueryDto = {}) {
    const tenant = businessIdOf(user, query.businessId);
    const depotIds = await this.access.depotScope(user);
    const rows = await this.prisma.driverLocation.findMany({
      where: {
        ...(query.maxAgeMinutes && {
          recordedAt: {
            gte: new Date(Date.now() - query.maxAgeMinutes * 60_000),
          },
        }),
        driver: {
          businessId: tenant,
          role: UserRole.DRIVER,
          ...(depotIds !== null && { depotId: { in: depotIds } }),
        },
      },
      orderBy: [{ recordedAt: 'desc' }, { id: 'desc' }],
      distinct: ['driverId'],
      select: {
        driverId: true,
        latitude: true,
        longitude: true,
        accuracy: true,
        recordedAt: true,
        driver: {
          select: { firstName: true, lastName: true, employeeId: true },
        },
      },
    });
    const now = Date.now();
    const driverIds = rows.map((r) => r.driverId);
    // Live map card: today's vehicle and the delivery currently being driven.
    const [shifts, active] = driverIds.length
      ? await Promise.all([
          this.prisma.shift.findMany({
            where: {
              driverId: { in: driverIds },
              date: localDate(),
              status: { in: [ShiftStatus.PUBLISHED, ShiftStatus.IN_PROGRESS] },
            },
            select: {
              driverId: true,
              vehicle: {
                select: { id: true, registration: true, model: true },
              },
            },
          }),
          this.prisma.delivery.findMany({
            where: {
              driverId: { in: driverIds },
              status: {
                in: [
                  DeliveryStatus.IN_PROGRESS,
                  DeliveryStatus.PICKED_UP,
                  DeliveryStatus.DELAYED,
                ],
              },
            },
            orderBy: [{ startedAt: 'desc' }, { updatedAt: 'desc' }],
            select: {
              id: true,
              code: true,
              driverId: true,
              status: true,
              eta: true,
              windowEnd: true,
              scheduledDropTime: true,
              deliveredAt: true,
              deliveryAddress: true,
            },
          }),
        ])
      : [[], []];
    return rows.map((row) => {
      const vehicle =
        shifts.find((s) => s.driverId === row.driverId)?.vehicle ?? null;
      const d = active.find((x) => x.driverId === row.driverId);
      return {
        ...row,
        ageSeconds: Math.max(
          0,
          Math.round((now - row.recordedAt.getTime()) / 1000),
        ),
        stale: now - row.recordedAt.getTime() > STALE_AFTER_MS,
        vehicle,
        activeDelivery: d
          ? {
              id: d.id,
              code: d.code,
              status: d.status,
              eta: d.eta,
              deliveryAddress: d.deliveryAddress,
              onTime: !isLate(d),
            }
          : null,
      };
    });
  }

  /**
   * Supervisor "track delivery": status and destination, the driver's latest
   * point and the path driven since the delivery started (up to 24 hours).
   */
  async trackDelivery(user: AuthUser, deliveryId: string, businessId?: string) {
    const tenant = businessIdOf(user, businessId);
    const delivery = await this.prisma.delivery.findFirst({
      where: {
        id: deliveryId,
        businessId: tenant,
        ...(await this.access.depotWhere(user)),
      },
      select: {
        id: true,
        code: true,
        status: true,
        deliveryAddress: true,
        eta: true,
        driverId: true,
        departedAt: true,
        startedAt: true,
        pickedUpAt: true,
        deliveredAt: true,
        driver: {
          select: { firstName: true, lastName: true, employeeId: true },
        },
        vehicle: { select: { registration: true, model: true } },
      },
    });
    if (!delivery) throw new NotFoundException('Delivery not found');
    const started =
      delivery.startedAt ?? delivery.departedAt ?? delivery.pickedUpAt;
    const until = delivery.deliveredAt ?? new Date();
    const from =
      started && until.getTime() - started.getTime() <= MAX_POINT_AGE_MS
        ? started
        : new Date(until.getTime() - MAX_POINT_AGE_MS);
    const [latest, path] = delivery.driverId
      ? await Promise.all([
          this.prisma.driverLocation.findMany({
            where: { driverId: delivery.driverId },
            take: 2,
            orderBy: [{ recordedAt: 'desc' }, { id: 'desc' }],
            select: {
              latitude: true,
              longitude: true,
              accuracy: true,
              recordedAt: true,
            },
          }),
          started
            ? this.prisma.driverLocation.findMany({
                where: {
                  driverId: delivery.driverId,
                  recordedAt: { gte: from, lte: until },
                },
                orderBy: [{ recordedAt: 'asc' }, { id: 'asc' }],
                select: { latitude: true, longitude: true, recordedAt: true },
                take: 5000,
              })
            : Promise.resolve([]),
        ])
      : [null, []];
    const last = latest?.[0] ?? null;
    return {
      delivery,
      latest: last && {
        ...last,
        stale: Date.now() - last.recordedAt.getTime() > STALE_AFTER_MS,
        // Derived from the two latest GPS points; no vehicle telematics feed.
        speedKmh: speedKmh(latest!),
      },
      path,
    };
  }

  async history(
    user: AuthUser,
    driverId: string,
    query: LocationHistoryQueryDto,
  ) {
    const tenant = businessIdOf(user, query.businessId);
    const depotIds = await this.access.depotScope(user);
    const from = new Date(query.from),
      to = new Date(query.to);
    if (
      !Number.isFinite(from.getTime()) ||
      !Number.isFinite(to.getTime()) ||
      from >= to ||
      to.getTime() - from.getTime() > 24 * 60 * 60 * 1000
    ) {
      throw new BadRequestException(
        'Select a valid time range of at most 24 hours',
      );
    }
    const driver = await this.prisma.user.findFirst({
      where: {
        id: driverId,
        businessId: tenant,
        role: UserRole.DRIVER,
        ...(depotIds !== null && { depotId: { in: depotIds } }),
      },
      select: { id: true },
    });
    if (!driver) throw new NotFoundException('Driver not found');
    if (query.cursor) {
      const cursor = await this.prisma.driverLocation.findFirst({
        where: {
          id: query.cursor,
          driverId,
          recordedAt: { gte: from, lt: to },
        },
        select: { id: true },
      });
      if (!cursor) throw new BadRequestException('Invalid history cursor');
    }
    const rows = await this.prisma.driverLocation.findMany({
      where: { driverId, recordedAt: { gte: from, lt: to } },
      orderBy: [{ recordedAt: 'asc' }, { id: 'asc' }],
      take: 5001,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > 5000;
    const data = rows.slice(0, 5000);
    return {
      points: data,
      nextCursor: hasMore ? data[data.length - 1].id : null,
    };
  }
}
