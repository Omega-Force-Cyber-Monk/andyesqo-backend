/** Live tracking: shift-gated ingest, delivery tracking and GPS retention. */
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types.js';
import { UserRole } from './../src/generated/prisma/enums.js';
import { localDate } from './../src/common/utils/tenant.js';
import { LocationRetentionService } from './../src/locations/location-retention.service.js';
import { auth, createTestApp, Tenant } from './support.js';

describe('Live tracking (e2e)', () => {
  let app: INestApplication<App>;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('records GPS only during a shift and lets scoped managers track a delivery', async () => {
    const t = await Tenant.create(app, 'Tracking');
    try {
      const [a, b] = [await t.depot('A'), await t.depot('B')];
      const driver = await t.user(UserRole.DRIVER, { depotId: a.id });
      const supervisor = await t.user(UserRole.SUPERVISOR);
      await t.grant(UserRole.SUPERVISOR, { LIVE_MAP: 'view' });
      const token = await t.token(driver);
      const point = (offsetMs = 0) => ({
        latitude: -33.86,
        longitude: 151.2,
        recordedAt: new Date(Date.now() + offsetMs).toISOString(),
      });
      await t
        .http()
        .post('/api/v1/locations/me')
        .set(auth(token))
        .send(point())
        .expect(403);

      const shift = await t.prisma.shift.create({
        data: {
          businessId: t.businessId,
          depotId: a.id,
          date: localDate(),
          startTime: '06:00',
          endTime: '14:00',
          driverId: driver.id,
          status: 'IN_PROGRESS',
        },
      });
      const clockIn = new Date(Date.now() - 30 * 60_000);
      await t.prisma.attendance.create({
        data: { shiftId: shift.id, userId: driver.id, clockInAt: clockIn },
      });
      // Before clock-in is rejected; buffered points after clock-in are accepted.
      await t
        .http()
        .post('/api/v1/locations/me')
        .set(auth(token))
        .send(point(-60 * 60_000))
        .expect(400);
      const batch = await t
        .http()
        .post('/api/v1/locations/me/batch')
        .set(auth(token))
        .send({ points: [point(-20 * 60_000), point(-10 * 60_000)] })
        .expect(201);
      expect(batch.body.data.accepted).toBe(2);
      await t
        .http()
        .post('/api/v1/locations/me/batch')
        .set(auth(token))
        .send({ points: Array.from({ length: 101 }, () => point()) })
        .expect(400);
      await t
        .http()
        .post('/api/v1/locations/me')
        .set(auth(token))
        .send(point())
        .expect(201);

      const delivery = await t.prisma.delivery.create({
        data: {
          businessId: t.businessId,
          depotId: a.id,
          code: 'DEL-1',
          customerName: 'C',
          deliveryAddress: '1 George St',
          driverId: driver.id,
          status: 'IN_PROGRESS',
          startedAt: new Date(Date.now() - 15 * 60_000),
        },
      });
      const otherDepot = await t.prisma.delivery.create({
        data: {
          businessId: t.businessId,
          depotId: b.id,
          code: 'DEL-2',
          customerName: 'C',
          deliveryAddress: 'X',
        },
      });
      await t.scope(supervisor.id, [a.id]);
      const sToken = await t.token(supervisor);
      const tracked = await t
        .http()
        .get(`/api/v1/locations/deliveries/${delivery.id}/track`)
        .set(auth(sToken))
        .expect(200);
      // Only the points since the delivery started are in the path.
      expect(tracked.body.data.path).toHaveLength(2);
      expect(tracked.body.data.latest.stale).toBe(false);
      await t
        .http()
        .get(`/api/v1/locations/deliveries/${otherDepot.id}/track`)
        .set(auth(sToken))
        .expect(404);
      const live = await t
        .http()
        .get('/api/v1/locations/latest?maxAgeMinutes=5')
        .set(auth(sToken))
        .expect(200);
      expect(live.body.data).toHaveLength(1);
      expect(live.body.data[0]).toMatchObject({
        driverId: driver.id,
        stale: false,
      });

      // After clock-out no more points are accepted.
      await t.prisma.attendance.updateMany({
        where: { userId: driver.id },
        data: { clockOutAt: new Date() },
      });
      await t
        .http()
        .post('/api/v1/locations/me')
        .set(auth(token))
        .send(point())
        .expect(403);
    } finally {
      await t.destroy();
    }
  });

  it('purges GPS points older than the retention period', async () => {
    const t = await Tenant.create(app, 'Retention');
    try {
      const driver = await t.user(UserRole.DRIVER);
      const retention = app.get(LocationRetentionService);
      const old = new Date(retention.cutoff().getTime() - 60_000);
      await t.prisma.driverLocation.createMany({
        data: [old, new Date()].map((recordedAt) => ({
          driverId: driver.id,
          latitude: 0,
          longitude: 0,
          recordedAt,
        })),
      });
      await retention.purge();
      const left = await t.prisma.driverLocation.findMany({
        where: { driverId: driver.id },
      });
      expect(left).toHaveLength(1);
      expect(left[0].recordedAt.getTime()).toBeGreaterThan(old.getTime());
    } finally {
      await t.destroy();
    }
  });
});
