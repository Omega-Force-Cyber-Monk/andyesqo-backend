/** Flows added from the screen-by-screen design audit. */
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types.js';
import { AlertsService } from './../src/alerts/alerts.service.js';
import { localDate } from './../src/common/utils/tenant.js';
import { UserRole } from './../src/generated/prisma/enums.js';
import { auth, createTestApp, Tenant } from './support.js';

describe('Design audit flows (e2e)', () => {
  let app: INestApplication<App>;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('lists and revokes active sessions', async () => {
    const t = await Tenant.create(app, 'Sessions');
    try {
      const admin = await t.user(UserRole.BUSINESS_ADMIN);
      const first = await t
        .http()
        .post('/api/v1/auth/login')
        .set('User-Agent', 'Chrome 128 / macOS')
        .send({ identifier: admin.email, password: 'Password123' })
        .expect(200);
      const second = await t.token(admin);
      const list = await t
        .http()
        .get('/api/v1/auth/sessions')
        .set(auth(second))
        .expect(200);
      expect(list.body.data).toHaveLength(2);
      const mine = list.body.data.find((s: { current: boolean }) => s.current);
      const other = list.body.data.find(
        (s: { current: boolean }) => !s.current,
      );
      expect(other.userAgent).toBe('Chrome 128 / macOS');
      await t
        .http()
        .delete(`/api/v1/auth/sessions/${other.id}`)
        .set(auth(second))
        .expect(200);
      await t
        .http()
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: first.body.data.refreshToken })
        .expect(401);
      expect(mine).toBeDefined();
      await t
        .http()
        .delete('/api/v1/auth/sessions')
        .set(auth(second))
        .expect(200);
      await t.http().get('/api/v1/auth/me').set(auth(second)).expect(401);
    } finally {
      await t.destroy();
    }
  });

  it('sends compliance and stand-down alerts once per week', async () => {
    const t = await Tenant.create(app, 'Alerts');
    try {
      const roster = await t.user(UserRole.ROSTER_MANAGER);
      const ok = await t.user(UserRole.DRIVER, { firstName: 'Ok' });
      const expiring = await t.user(UserRole.DRIVER, { firstName: 'Soon' });
      const blocked = await t.user(UserRole.DRIVER, { firstName: 'Blocked' });
      await t.compliant(ok.id);
      await t.compliant(expiring.id);
      await t.prisma.user.update({
        where: { id: expiring.id },
        data: { licenceExpiry: new Date(Date.now() + 7 * 86_400_000) },
      });
      const alerts = app.get(AlertsService);
      const first = await alerts.complianceScan();
      await alerts.complianceScan();
      expect(first.notices).toBeGreaterThanOrEqual(1);
      const notes = await t.prisma.notification.findMany({
        where: { userId: roster.id },
      });
      const about = (id: string) =>
        notes.filter((n) => (n.data as { userId?: string })?.userId === id);
      expect(about(ok.id)).toHaveLength(0);
      expect(about(expiring.id).map((n) => n.title)).toEqual([
        'Driver Compliance Expiry Notice',
      ]);
      expect(about(blocked.id).map((n) => n.title)).toEqual([
        'Driver Stand-down',
      ]);
      expect(
        await t.prisma.auditLog.count({
          where: { targetId: blocked.id, action: 'Flagged Driver Stand-down' },
        }),
      ).toBe(1);
    } finally {
      await t.destroy();
    }
  });

  it('reminds drivers to inspect, notifies managers on publish and enriches the live map', async () => {
    const t = await Tenant.create(app, 'Ops');
    try {
      const supervisor = await t.user(UserRole.SUPERVISOR);
      const roster = await t.user(UserRole.ROSTER_MANAGER);
      const driver = await t.user(UserRole.DRIVER);
      await t.compliant(driver.id);
      const vehicle = await t.vehicle(null);
      await t.grant(UserRole.SUPERVISOR, {
        INSPECTIONS: 'edit',
        ROSTER: 'edit',
        LIVE_MAP: 'view',
      });
      const token = await t.token(supervisor);
      const created = await t
        .http()
        .post('/api/v1/roster')
        .set(auth(token))
        .send({
          date: localDate().toISOString().slice(0, 10),
          startTime: '06:00',
          endTime: '14:00',
          publish: true,
          crews: [{ driverId: driver.id, vehicleId: vehicle.id }],
        })
        .expect(201);
      const published = await t.prisma.notification.findMany({
        where: { userId: roster.id, title: 'Roster Published' },
      });
      expect(published).toHaveLength(1);
      expect(published[0].body).toContain('1 crew member(s) notified');

      const first = await t
        .http()
        .post('/api/v1/inspections/reminders')
        .set(auth(token))
        .expect(200);
      expect(first.body.data).toEqual({ pending: 1, reminded: 1 });
      const again = await t
        .http()
        .post('/api/v1/inspections/reminders')
        .set(auth(token))
        .expect(200);
      expect(again.body.data.reminded).toBe(0);

      const delivery = await t.prisma.delivery.create({
        data: {
          businessId: t.businessId,
          code: 'DEL-9',
          customerName: 'C',
          deliveryAddress: '25 George St',
          driverId: driver.id,
          status: 'IN_PROGRESS',
          startedAt: new Date(),
          eta: new Date(Date.now() + 10 * 60_000),
          shiftId: created.body.data[0].id,
        },
      });
      await t.prisma.driverLocation.create({
        data: {
          driverId: driver.id,
          latitude: -33.8,
          longitude: 151.2,
          recordedAt: new Date(),
        },
      });
      const live = await t
        .http()
        .get('/api/v1/locations/latest')
        .set(auth(token))
        .expect(200);
      expect(live.body.data[0]).toMatchObject({
        vehicle: { registration: vehicle.registration },
        activeDelivery: { code: delivery.code, onTime: true },
      });
    } finally {
      await t.destroy();
    }
  });

  it('reports the driver attendance rate from rostered shifts', async () => {
    const t = await Tenant.create(app, 'Attendance');
    try {
      const driver = await t.user(UserRole.DRIVER);
      const day = (n: number) =>
        new Date(localDate().getTime() - n * 86_400_000);
      const shifts = await Promise.all(
        [1, 2, 3, 4].map((n) =>
          t.prisma.shift.create({
            data: {
              businessId: t.businessId,
              date: day(n),
              startTime: '08:00',
              endTime: '16:00',
              driverId: driver.id,
              status: 'COMPLETED',
            },
          }),
        ),
      );
      // A draft shift is not counted.
      await t.prisma.shift.create({
        data: {
          businessId: t.businessId,
          date: day(5),
          startTime: '08:00',
          endTime: '16:00',
          driverId: driver.id,
          status: 'DRAFT',
        },
      });
      for (const s of shifts.slice(0, 3))
        await t.prisma.attendance.create({
          data: { shiftId: s.id, userId: driver.id, clockInAt: s.date },
        });
      const profile = await t
        .http()
        .get('/api/v1/users/me/profile')
        .set(auth(await t.token(driver)))
        .expect(200);
      expect(profile.body.data.performance.attendanceRate).toBe(75);
    } finally {
      await t.destroy();
    }
  });
});
