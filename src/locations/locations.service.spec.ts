import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { UserRole } from '../generated/prisma/enums.js';
import { LocationsService, speedKmh } from './locations.service.js';

const manager = {
  id: 'manager',
  email: 'm@example.com',
  role: UserRole.SUPERVISOR,
  businessId: 'tenant-a',
};
const driver = { ...manager, id: 'driver', role: UserRole.DRIVER };

function setup() {
  const prisma = {
    user: { findFirst: vi.fn() },
    driverLocation: {
      create: vi.fn(),
      createMany: vi.fn().mockResolvedValue({ count: 2 }),
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn(),
    },
    shift: { findMany: vi.fn().mockResolvedValue([]) },
    delivery: {
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
    attendance: {
      findFirst: vi
        .fn()
        .mockResolvedValue({ clockInAt: new Date(Date.now() - 3600_000) }),
    },
  };
  const routing = { route: vi.fn() };
  const access = {
    depotScope: vi.fn().mockResolvedValue(null),
    depotWhere: vi.fn().mockResolvedValue({}),
  };
  return {
    prisma,
    routing,
    access,
    service: new LocationsService(
      prisma as never,
      routing as never,
      access as never,
    ),
  };
}

describe('driver location access', () => {
  it('routes only the assigned driver using the latest location', async () => {
    const { prisma, routing, service } = setup();
    prisma.delivery.findFirst.mockResolvedValue({
      deliveryAddress: '123 Main St',
    });
    prisma.driverLocation.findFirst.mockResolvedValue({
      latitude: 1,
      longitude: 2,
      recordedAt: new Date(),
    });
    await service.deliveryRoute(driver, 'delivery');
    expect(prisma.delivery.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'delivery', businessId: 'tenant-a', driverId: 'driver' },
      }),
    );
    expect(routing.route).toHaveBeenCalledWith({
      origin: { latitude: 1, longitude: 2 },
      destinationAddress: '123 Main St',
    });
  });

  it('does not route an unassigned delivery or use a stale location', async () => {
    const { prisma, routing, service } = setup();
    prisma.delivery.findFirst.mockResolvedValue(null);
    await expect(
      service.deliveryRoute(driver, 'delivery'),
    ).rejects.toBeInstanceOf(NotFoundException);
    prisma.delivery.findFirst.mockResolvedValue({
      deliveryAddress: '123 Main St',
    });
    prisma.driverLocation.findFirst.mockResolvedValue({
      latitude: 1,
      longitude: 2,
      recordedAt: new Date(Date.now() - 16 * 60_000),
    });
    await expect(
      service.deliveryRoute(driver, 'delivery'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(routing.route).not.toHaveBeenCalled();
  });
  it('uses the authenticated driver identity for updates', async () => {
    const { prisma, service } = setup();
    const dto = {
      latitude: -33.8,
      longitude: 151.2,
      recordedAt: new Date().toISOString(),
    };
    await service.record(driver, dto);
    expect(prisma.driverLocation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ driverId: driver.id }),
      }),
    );
  });

  it('rejects future location timestamps', async () => {
    const { service } = setup();
    await expect(
      service.record(driver, {
        latitude: 0,
        longitude: 0,
        recordedAt: new Date(Date.now() + 120000).toISOString(),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('records only while clocked in and not before clock-in', async () => {
    const { prisma, service } = setup();
    await expect(
      service.record(driver, {
        latitude: 0,
        longitude: 0,
        recordedAt: new Date(Date.now() - 2 * 3600_000).toISOString(),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    prisma.attendance.findFirst.mockResolvedValue(null);
    await expect(
      service.record(driver, {
        latitude: 0,
        longitude: 0,
        recordedAt: new Date().toISOString(),
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.driverLocation.create).not.toHaveBeenCalled();
  });

  it('accepts a buffered batch of points atomically', async () => {
    const { prisma, service } = setup();
    const point = {
      latitude: 1,
      longitude: 2,
      recordedAt: new Date().toISOString(),
    };
    await expect(service.recordBatch(driver, [point, point])).resolves.toEqual({
      accepted: 2,
    });
    await expect(
      service.recordBatch(driver, [
        point,
        { ...point, recordedAt: new Date(Date.now() + 600_000).toISOString() },
      ]),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.driverLocation.createMany).toHaveBeenCalledTimes(1);
  });

  it('flags stale points on the live map', async () => {
    const { prisma, service } = setup();
    prisma.driverLocation.findMany.mockResolvedValue([
      { driverId: 'a', recordedAt: new Date() },
      { driverId: 'b', recordedAt: new Date(Date.now() - 20 * 60_000) },
    ]);
    const rows = await service.latest(manager);
    expect(rows.map((r) => r.stale)).toEqual([false, true]);
  });

  it('restricts latest locations to the manager tenant even with an override', async () => {
    const { prisma, service } = setup();
    await service.latest(manager, { businessId: 'tenant-b' });
    expect(prisma.driverLocation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { driver: { businessId: 'tenant-a', role: UserRole.DRIVER } },
      }),
    );
  });

  it('limits live locations and driver history to assigned depots', async () => {
    const { prisma, access, service } = setup();
    access.depotScope.mockResolvedValue(['depot-a']);
    await service.latest(manager);
    expect(prisma.driverLocation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          driver: {
            businessId: 'tenant-a',
            role: UserRole.DRIVER,
            depotId: { in: ['depot-a'] },
          },
        },
      }),
    );
    prisma.user.findFirst.mockResolvedValue(null);
    await expect(
      service.history(manager, 'driver', {
        from: '2026-01-01T00:00:00Z',
        to: '2026-01-02T00:00:00Z',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ depotId: { in: ['depot-a'] } }),
      }),
    );
  });

  it('does not expose a driver outside the tenant', async () => {
    const { prisma, service } = setup();
    prisma.user.findFirst.mockResolvedValue(null);
    await expect(
      service.history(manager, 'other-driver', {
        from: '2026-01-01T00:00:00Z',
        to: '2026-01-02T00:00:00Z',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.driverLocation.findMany).not.toHaveBeenCalled();
  });

  it('derives speed from the two latest points', () => {
    const t = Date.now();
    // About 1 km north in 60 seconds = ~60 km/h.
    const kmh = speedKmh([
      { latitude: -33.8, longitude: 151.2, recordedAt: new Date(t) },
      { latitude: -33.809, longitude: 151.2, recordedAt: new Date(t - 60_000) },
    ]);
    expect(kmh).toBeGreaterThan(55);
    expect(kmh).toBeLessThan(65);
    expect(speedKmh([])).toBeNull();
    expect(
      speedKmh([
        { latitude: 0, longitude: 0, recordedAt: new Date(t) },
        { latitude: 0, longitude: 0, recordedAt: new Date(t - 600_000) },
      ]),
    ).toBeNull();
  });
});
