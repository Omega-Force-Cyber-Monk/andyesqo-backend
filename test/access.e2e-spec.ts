/**
 * Database-backed checks for the View/Edit matrix, depot scope and workflow
 * guards on repairs, maintenance, roster, attendance, compliance, incidents,
 * communication, settings, audit and dashboards.
 */
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types.js';
import {
  PermissionModule as M,
  Severity,
  ShiftStatus,
  UserRole,
  VehicleStatus,
} from './../src/generated/prisma/enums.js';
import { localDate } from './../src/common/utils/tenant.js';
import { auth, createTestApp, Tenant } from './support.js';

describe('Access control (e2e)', () => {
  let app: INestApplication<App>;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('enforces REPAIRS permissions, depot scope and the repair workflow', async () => {
    const t = await Tenant.create(app, 'Repairs');
    try {
      const [a, b] = [await t.depot('A'), await t.depot('B')];
      const fleet = await t.user(UserRole.FLEET_MANAGER);
      await t.scope(fleet.id, [a.id]);
      await t.grant(UserRole.FLEET_MANAGER, {
        REPAIRS: 'view',
        VEHICLES: 'view',
      });
      const va = await t.vehicle(a.id);
      const vb = await t.vehicle(b.id);
      const driver = await t.user(UserRole.DRIVER, { depotId: a.id });
      const damage = await t.prisma.damageReport.create({
        data: {
          code: 'DR-1',
          vehicleId: va.id,
          reportedById: driver.id,
          severity: Severity.MODERATE,
          description: 'Dent',
        },
      });
      const repairB = await t.prisma.repairRequest.create({
        data: { code: 'REP-B', vehicleId: vb.id, issue: 'Other depot' },
      });
      const token = await t.token(fleet);

      await t
        .http()
        .post('/api/v1/repair-requests')
        .set(auth(token))
        .send({ vehicleId: va.id, issue: 'Bumper' })
        .expect(403);

      await t.grant(UserRole.FLEET_MANAGER, {
        REPAIRS: 'edit',
        VEHICLES: 'view',
      });
      await t
        .http()
        .post('/api/v1/repair-requests')
        .set(auth(token))
        .send({ vehicleId: vb.id, issue: 'Out of scope' })
        .expect(404);
      await t
        .http()
        .post('/api/v1/repair-requests')
        .set(auth(token))
        .send({
          vehicleId: va.id,
          issue: 'Bad link',
          damageReportId: repairB.id,
        })
        .expect(400);
      const created = await t
        .http()
        .post('/api/v1/repair-requests')
        .set(auth(token))
        .send({ vehicleId: va.id, issue: 'Bumper', damageReportId: damage.id })
        .expect(201);
      const id = created.body.data.id;

      const list = await t
        .http()
        .get('/api/v1/repair-requests')
        .set(auth(token))
        .expect(200);
      expect(list.body.data.map((r: { id: string }) => r.id)).toEqual([id]);
      await t
        .http()
        .get(`/api/v1/repair-requests/${repairB.id}`)
        .set(auth(token))
        .expect(404);

      // Skipping approval is rejected.
      await t
        .http()
        .patch(`/api/v1/repair-requests/${id}/status`)
        .set(auth(token))
        .send({ status: 'COMPLETED' })
        .expect(400);
      // Two concurrent approvals: exactly one wins.
      const results = await Promise.all(
        [1, 2].map(() =>
          t
            .http()
            .patch(`/api/v1/repair-requests/${id}/status`)
            .set(auth(token))
            .send({ status: 'APPROVED' }),
        ),
      );
      const statuses = results.map((r) => r.status).sort();
      expect(statuses[0]).toBe(200);
      expect([400, 409]).toContain(statuses[1]);
      for (const status of ['IN_PROGRESS', 'COMPLETED'])
        await t
          .http()
          .patch(`/api/v1/repair-requests/${id}/status`)
          .set(auth(token))
          .send({ status, actualCost: 120 })
          .expect(200);
      const vehicle = await t.prisma.vehicle.findUniqueOrThrow({
        where: { id: va.id },
      });
      expect(vehicle.status).toBe(VehicleStatus.AVAILABLE);
      const logs = await t.prisma.vehicleStatusLog.findMany({
        where: { vehicleId: va.id },
      });
      expect(logs.map((l) => l.toStatus).sort()).toEqual([
        VehicleStatus.AVAILABLE,
        VehicleStatus.MAINTENANCE,
      ]);
      const resolved = await t.prisma.damageReport.findUniqueOrThrow({
        where: { id: damage.id },
      });
      expect(resolved.status).toBe('RESOLVED');
    } finally {
      await t.destroy();
    }
  });

  it('enforces MAINTENANCE permissions, depot scope and transitions', async () => {
    const t = await Tenant.create(app, 'Maintenance');
    try {
      const [a, b] = [await t.depot('A'), await t.depot('B')];
      const fleet = await t.user(UserRole.FLEET_MANAGER);
      await t.scope(fleet.id, [a.id]);
      await t.grant(UserRole.FLEET_MANAGER, { MAINTENANCE: 'edit' });
      const va = await t.vehicle(a.id);
      const vb = await t.vehicle(b.id);
      const token = await t.token(fleet);
      const tomorrow = new Date(Date.now() + 86400000)
        .toISOString()
        .slice(0, 10);
      await t
        .http()
        .post('/api/v1/maintenance')
        .set(auth(token))
        .send({
          vehicleId: vb.id,
          type: 'ROUTINE_SERVICE',
          scheduledDate: tomorrow,
        })
        .expect(404);
      await t
        .http()
        .post('/api/v1/maintenance')
        .set(auth(token))
        .send({
          vehicleId: va.id,
          type: 'ROUTINE_SERVICE',
          scheduledDate: tomorrow,
          depotId: b.id,
        })
        .expect(403);
      const created = await t
        .http()
        .post('/api/v1/maintenance')
        .set(auth(token))
        .send({
          vehicleId: va.id,
          type: 'ROUTINE_SERVICE',
          scheduledDate: tomorrow,
          tasks: ['Oil'],
        })
        .expect(201);
      const id = created.body.data.id;
      await t
        .http()
        .patch(`/api/v1/maintenance/${id}/status`)
        .set(auth(token))
        .send({ status: 'COMPLETED' })
        .expect(400);
      await t
        .http()
        .patch(`/api/v1/maintenance/${id}/status`)
        .set(auth(token))
        .send({ status: 'IN_PROGRESS' })
        .expect(200);
      expect(
        (await t.prisma.vehicle.findUniqueOrThrow({ where: { id: va.id } }))
          .status,
      ).toBe(VehicleStatus.MAINTENANCE);
      await t
        .http()
        .delete(`/api/v1/maintenance/${id}`)
        .set(auth(token))
        .expect(400);
      await t
        .http()
        .patch(`/api/v1/maintenance/${id}/status`)
        .set(auth(token))
        .send({ status: 'COMPLETED', actualCost: 90 })
        .expect(200);
      const v = await t.prisma.vehicle.findUniqueOrThrow({
        where: { id: va.id },
      });
      expect(v.status).toBe(VehicleStatus.AVAILABLE);
      expect(v.lastServiceDate).not.toBeNull();
      await t
        .http()
        .post(`/api/v1/maintenance/${id}/tasks`)
        .set(auth(token))
        .send({ title: 'Late task' })
        .expect(400);
      await t.grant(UserRole.FLEET_MANAGER, { MAINTENANCE: 'view' });
      await t
        .http()
        .patch(`/api/v1/maintenance/${id}`)
        .set(auth(token))
        .send({ description: 'x' })
        .expect(403);
      await t.http().get('/api/v1/maintenance').set(auth(token)).expect(200);
    } finally {
      await t.destroy();
    }
  });

  it('lets the matrix grant roster access, hides drafts from crew and prevents double booking', async () => {
    const t = await Tenant.create(app, 'Roster');
    try {
      const depot = await t.depot('A');
      const supervisor = await t.user(UserRole.SUPERVISOR);
      const driver = await t.user(UserRole.DRIVER, { depotId: depot.id });
      const other = await t.user(UserRole.DRIVER, { depotId: depot.id });
      const vehicle = await t.vehicle(depot.id);
      await t.compliant(driver.id);
      await t.grant(UserRole.SUPERVISOR, {});
      await t.grant(UserRole.DRIVER, {});
      const token = await t.token(supervisor);
      const today = localDate().toISOString().slice(0, 10);
      const body = {
        date: today,
        depotId: depot.id,
        startTime: '06:00',
        endTime: '14:00',
        crews: [{ driverId: driver.id, vehicleId: vehicle.id }],
      };
      // Supervisor is not a roster role and has no ROSTER grant.
      await t
        .http()
        .post('/api/v1/roster')
        .set(auth(token))
        .send(body)
        .expect(403);
      // A matrix grant makes the route available even though the role is not listed.
      await t.grant(UserRole.SUPERVISOR, { ROSTER: 'edit' });
      const attempts = await Promise.all(
        [1, 2].map(() =>
          t.http().post('/api/v1/roster').set(auth(token)).send(body),
        ),
      );
      expect(
        attempts.map((r) => r.status).sort(),
        JSON.stringify(attempts.map((r) => r.body.message)),
      ).toEqual([201, 400]);
      const shift = attempts.find((r) => r.status === 201)!.body.data[0];
      expect(shift.status).toBe(ShiftStatus.DRAFT);

      const driverToken = await t.token(driver);
      const home = await t
        .http()
        .get('/api/v1/roster/me/today')
        .set(auth(driverToken))
        .expect(200);
      expect(home.body.data.shift).toBeNull();
      await t
        .http()
        .get(`/api/v1/roster/${shift.id}`)
        .set(auth(driverToken))
        .expect(404);
      await t
        .http()
        .post('/api/v1/attendance/clock-in')
        .set(auth(driverToken))
        .send({})
        .expect(404);

      await t
        .http()
        .post('/api/v1/roster/publish')
        .set(auth(token))
        .send({ shiftIds: [shift.id] })
        .expect(201);
      const published = await t
        .http()
        .get('/api/v1/roster/me/today')
        .set(auth(driverToken))
        .expect(200);
      expect(published.body.data.shift.id).toBe(shift.id);
      await t
        .http()
        .get(`/api/v1/roster/${shift.id}`)
        .set(auth(driverToken))
        .expect(200);
      await t
        .http()
        .get(`/api/v1/roster/${shift.id}`)
        .set(auth(await t.token(other)))
        .expect(404);

      // Pre-shift inspection lets the driver clock in; concurrent clock-ins only succeed once.
      await t.prisma.inspection.create({
        data: {
          type: 'PRE_SHIFT',
          vehicleId: vehicle.id,
          driverId: driver.id,
          shiftId: shift.id,
          result: 'PASSED',
        },
      });
      const clocks = await Promise.all(
        [1, 2].map(() =>
          t
            .http()
            .post('/api/v1/attendance/clock-in')
            .set(auth(driverToken))
            .send({}),
        ),
      );
      expect(clocks.map((r) => r.status).sort()).toEqual([201, 400]);
      // A started shift is locked.
      await t
        .http()
        .delete(`/api/v1/roster/${shift.id}`)
        .set(auth(token))
        .expect(400);
      await t
        .http()
        .patch(`/api/v1/roster/${shift.id}`)
        .set(auth(token))
        .send({ status: 'COMPLETED' })
        .expect(400);
      // Availability only covers drivers and assistants.
      await t
        .http()
        .put('/api/v1/availability')
        .set(auth(token))
        .send({ userId: supervisor.id, date: today, status: 'ON_LEAVE' })
        .expect(404);
    } finally {
      await t.destroy();
    }
  });

  it('scopes compliance, timesheets and incidents to the depot and ownership', async () => {
    const t = await Tenant.create(app, 'Compliance');
    try {
      const [a, b] = [await t.depot('A'), await t.depot('B')];
      const roster = await t.user(UserRole.ROSTER_MANAGER);
      await t.scope(roster.id, [a.id]);
      await t.grant(UserRole.ROSTER_MANAGER, {
        COMPLIANCE: 'view',
        ROSTER: 'view',
      });
      const da = await t.user(UserRole.DRIVER, { depotId: a.id });
      const db = await t.user(UserRole.DRIVER, { depotId: b.id });
      const token = await t.token(roster);
      const list = await t
        .http()
        .get('/api/v1/compliance')
        .set(auth(token))
        .expect(200);
      expect(
        list.body.data.map((r: { user: { id: string } }) => r.user.id),
      ).toEqual([da.id]);
      await t
        .http()
        .get(`/api/v1/compliance/${db.id}`)
        .set(auth(token))
        .expect(404);
      await t
        .http()
        .post(`/api/v1/compliance/${da.id}/documents`)
        .set(auth(token))
        .send({ type: 'TRAINING', title: 'BFM' })
        .expect(403);

      // Incidents: drivers cannot attach a delivery they are not assigned.
      const type = await t.prisma.incidentType.create({
        data: { businessId: t.businessId, name: 'Accident' },
      });
      const foreign = await t.prisma.delivery.create({
        data: {
          businessId: t.businessId,
          code: 'DEL-1',
          customerName: 'C',
          deliveryAddress: 'X',
          driverId: db.id,
        },
      });
      const daToken = await t.token(da);
      await t
        .http()
        .post('/api/v1/incidents')
        .set(auth(daToken))
        .send({
          incidentTypeId: type.id,
          deliveryId: foreign.id,
          description: 'x',
        })
        .expect(404);
      const dbToken = await t.token(db);
      const own = await t
        .http()
        .post('/api/v1/incidents')
        .set(auth(dbToken))
        .send({
          incidentTypeId: type.id,
          deliveryId: foreign.id,
          description: 'Hit',
        })
        .expect(201);
      await t
        .http()
        .get(`/api/v1/incidents/${own.body.data.id}`)
        .set(auth(daToken))
        .expect(404);
      const supervisor = await t.user(UserRole.SUPERVISOR);
      await t.grant(UserRole.SUPERVISOR, { DELIVERIES: 'edit' });
      const sToken = await t.token(supervisor);
      await t
        .http()
        .patch(`/api/v1/incidents/${own.body.data.id}/status`)
        .set(auth(sToken))
        .send({ status: 'RESOLVED' })
        .expect(200);
      const notes = await t.prisma.notification.count({
        where: { userId: db.id, title: 'Incident Updated' },
      });
      expect(notes).toBe(1);
    } finally {
      await t.destroy();
    }
  });

  it('governs communication, settings, audit and dashboards by the matrix', async () => {
    const t = await Tenant.create(app, 'Governance');
    try {
      const supervisor = await t.user(UserRole.SUPERVISOR);
      const driver = await t.user(UserRole.DRIVER);
      await t.grant(UserRole.SUPERVISOR, { DASHBOARD: 'view' });
      const token = await t.token(supervisor);
      await t
        .http()
        .post('/api/v1/messages')
        .set(auth(token))
        .send({ recipientId: driver.id, body: 'Hi' })
        .expect(403);
      await t.http().get('/api/v1/settings').set(auth(token)).expect(403);
      await t.http().get('/api/v1/audit-logs').set(auth(token)).expect(403);
      // Dashboard loads, but sections without module access are withheld.
      const dash = await t
        .http()
        .get('/api/v1/dashboard/supervisor')
        .set(auth(token))
        .expect(200);
      expect(dash.body.data.deliveries).toBeNull();
      expect(dash.body.data.inspectionOverview).toBeNull();
      await t
        .http()
        .get('/api/v1/dashboard/business-admin')
        .set(auth(token))
        .expect(403);

      await t.grant(UserRole.SUPERVISOR, {
        DASHBOARD: 'view',
        COMMUNICATION: 'edit',
        SETTINGS: 'edit',
        AUDIT: 'view',
        DELIVERIES: 'view',
      });
      await t
        .http()
        .post('/api/v1/messages')
        .set(auth(token))
        .send({ recipientId: driver.id, body: 'Hi' })
        .expect(201);
      await t
        .http()
        .patch('/api/v1/settings')
        .set(auth(token))
        .send({ supportPhone: '123' })
        .expect(200);
      await t
        .http()
        .patch('/api/v1/settings')
        .set(auth(token))
        .send({ twoFactorRequired: true })
        .expect(403);
      const audit = await t
        .http()
        .get('/api/v1/audit-logs')
        .set(auth(token))
        .expect(200);
      expect(
        audit.body.data.some(
          (r: { action: string }) => r.action === 'Business Settings Updated',
        ),
      ).toBe(true);
      const full = await t
        .http()
        .get('/api/v1/dashboard/supervisor')
        .set(auth(token))
        .expect(200);
      expect(full.body.data.deliveries).not.toBeNull();

      // Expiring user override denies the module despite the role grant.
      await t.prisma.userPermissionOverride.create({
        data: {
          userId: supervisor.id,
          module: M.AUDIT,
          canView: false,
          canEdit: false,
          startsAt: new Date(Date.now() - 1000),
          expiresAt: new Date(Date.now() + 3600_000),
        },
      });
      await t.http().get('/api/v1/audit-logs').set(auth(token)).expect(403);

      // Depot mutations are governed; listing depots remains available as reference data.
      await t.http().get('/api/v1/depots').set(auth(token)).expect(200);
      await t
        .http()
        .post('/api/v1/depots')
        .set(auth(token))
        .send({ name: 'New' })
        .expect(403);
      expect(localDate()).toBeInstanceOf(Date);
    } finally {
      await t.destroy();
    }
  });
});
