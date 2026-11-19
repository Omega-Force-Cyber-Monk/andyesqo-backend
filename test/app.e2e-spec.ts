/**
 * End-to-end smoke test. Needs a running database (DATABASE_URL in .env)
 * that has been migrated: `npm run prisma:migrate && npm run db:seed`.
 */
import 'dotenv/config';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { AllExceptionsFilter } from './../src/common/filters/all-exceptions.filter.js';
import { ResponseInterceptor } from './../src/common/interceptors/response.interceptor.js';
import {
  businessSetup,
  refreshBusinessSetup,
} from './../src/businesses/setup.js';
import {
  BusinessStatus,
  UserRole,
  UserStatus,
  PermissionModule,
} from './../src/generated/prisma/enums.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { UsersService } from './../src/users/users.service.js';
import { PrismaMfaStore } from './../src/auth/mfa.store.js';
import { createHmac, randomUUID } from 'node:crypto';
import { hash } from 'bcryptjs';

function totp(secret: string, offset = 0) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of secret)
    bits += alphabet.indexOf(char).toString(2).padStart(5, '0');
  const bytes = Buffer.from(
    bits.match(/.{8}/g)!.map((part) => parseInt(part, 2)),
  );
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000) + offset));
  const digest = createHmac('sha1', bytes).update(counter).digest();
  const truncationOffset = digest[digest.length - 1] & 15;
  return String(
    (digest.readUInt32BE(truncationOffset) & 0x7fffffff) % 1_000_000,
  ).padStart(6, '0');
}

describe('Andyesqo API (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['health'] });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalInterceptors(new ResponseInterceptor(app.get(Reflector)));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ok');
  });

  it('rejects protected routes without a token', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/vehicles')
      .expect(401);
    expect(res.body.success).toBe(false);
  });

  it('validates the login body', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({})
      .expect(400);
  });

  it('requires authenticator enrollment and OTP after the business enables 2FA', async () => {
    const prisma = app.get(PrismaService);
    const suffix = randomUUID();
    const business = await prisma.business.create({
      data: { name: `MFA ${suffix}` },
    });
    try {
      const email = `${suffix}@example.com`;
      await prisma.user.create({
        data: {
          businessId: business.id,
          firstName: 'Driver',
          email,
          role: UserRole.DRIVER,
          status: UserStatus.ACTIVE,
          passwordHash: await hash('Password123', 4),
        },
      });
      const credentials = { identifier: email, password: 'Password123' };
      const initial = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send(credentials)
        .expect(200);
      const oldAccess = initial.body.data.accessToken;
      const oldRefresh = initial.body.data.refreshToken;
      await prisma.business.update({
        where: { id: business.id },
        data: { twoFactorRequired: true },
      });
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${oldAccess}`)
        .expect(401);
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: oldRefresh })
        .expect(401);
      const login = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send(credentials)
        .expect(200);
      expect(login.body.data).toMatchObject({
        mfaRequired: true,
        enrollmentRequired: true,
      });
      expect(login.body.data.accessToken).toBeUndefined();
      const challenge = login.body.data.challenge;
      const enrollment = await request(app.getHttpServer())
        .post('/api/v1/auth/mfa/enroll')
        .send({ challenge })
        .expect(200);
      const authenticator = await prisma.mfaTotp.findFirstOrThrow({
        where: { user: { email } },
      });
      expect(authenticator.secret).not.toBe(enrollment.body.data.secret);
      expect(authenticator.secret.startsWith('v1.')).toBe(true);
      const code = totp(enrollment.body.data.secret);
      await request(app.getHttpServer())
        .post('/api/v1/auth/mfa/verify')
        .send({ challenge, code: '000000' === code ? '000001' : '000000' })
        .expect(401);
      const verified = await request(app.getHttpServer())
        .post('/api/v1/auth/mfa/verify')
        .send({ challenge, code })
        .expect(200);
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${verified.body.data.accessToken}`)
        .expect(200);
      const recovery = await request(app.getHttpServer())
        .post('/api/v1/auth/mfa/recovery-codes')
        .set('Authorization', `Bearer ${verified.body.data.accessToken}`)
        .expect(200);
      expect(recovery.body.data.recoveryCodes).toHaveLength(10);
      await request(app.getHttpServer())
        .post('/api/v1/auth/mfa/verify')
        .send({ challenge, code })
        .expect(401);
      // A crash after confirming the authenticator but before setting the user
      // flag must not allow password-only sessions to bypass it.
      await prisma.business.update({
        where: { id: business.id },
        data: { twoFactorRequired: false },
      });
      await prisma.user.update({
        where: { email },
        data: { twoFactorEnabled: false },
      });
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${oldAccess}`)
        .expect(401);
      const nextLogin = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send(credentials)
        .expect(200);
      expect(nextLogin.body.data.enrollmentRequired).toBe(false);
      await request(app.getHttpServer())
        .post('/api/v1/auth/mfa/verify')
        .send({ challenge: nextLogin.body.data.challenge, code })
        .expect(401);
      await request(app.getHttpServer())
        .post('/api/v1/auth/mfa/verify')
        .send({
          challenge: nextLogin.body.data.challenge,
          recoveryCode: recovery.body.data.recoveryCodes[0],
        })
        .expect(200);
      const replayLogin = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send(credentials)
        .expect(200);
      await request(app.getHttpServer())
        .post('/api/v1/auth/mfa/verify')
        .send({
          challenge: replayLogin.body.data.challenge,
          recoveryCode: recovery.body.data.recoveryCodes[0],
        })
        .expect(401);
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: verified.body.data.refreshToken })
        .expect(200);
      await request(app.getHttpServer())
        .patch('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${verified.body.data.accessToken}`)
        .send({
          currentPassword: 'Password123',
          newPassword: 'Password456',
          confirmPassword: 'Password456',
        })
        .expect(200);
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${verified.body.data.accessToken}`)
        .expect(401);
      await request(app.getHttpServer())
        .post('/api/v1/auth/mfa/verify')
        .send({ challenge: replayLogin.body.data.challenge, code })
        .expect(401);
    } finally {
      await prisma.business.delete({ where: { id: business.id } });
    }
  });

  it('atomically claims authenticator steps and counts concurrent failures', async () => {
    const prisma = app.get(PrismaService);
    const store = app.get(PrismaMfaStore);
    const suffix = randomUUID();
    const user = await prisma.user.create({
      data: {
        firstName: 'Test',
        email: `${suffix}@example.com`,
        role: UserRole.DRIVER,
      },
    });
    try {
      await store.saveTotp(user.id, { secret: 'sealed', confirmed: true });
      const claims = await Promise.all(
        Array.from({ length: 8 }, () => store.claimTotpStep(user.id, 123)),
      );
      expect(claims.filter(Boolean)).toHaveLength(1);
      await store.saveTotp(user.id, {
        secret: 'sealed',
        confirmed: true,
        lastUsedStep: 100,
      });
      await store.saveTotp(user.id, {
        secret: 'stale-enrollment',
        confirmed: false,
      });
      expect(await store.getTotp(user.id)).toMatchObject({
        secret: 'sealed',
        confirmed: true,
      });
      expect((await store.getTotp(user.id))?.lastUsedStep).toBe(123);
      const now = Date.now();
      const attempts = await Promise.all(
        Array.from({ length: 5 }, () =>
          store.recordMfaFailure(user.id, 60_000, now),
        ),
      );
      expect(attempts.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
    } finally {
      await prisma.user.delete({ where: { id: user.id } });
    }
  });

  it('allows a signed-in user to enroll an authenticator voluntarily', async () => {
    const prisma = app.get(PrismaService);
    const suffix = randomUUID();
    const user = await prisma.user.create({
      data: {
        firstName: 'Driver',
        email: `${suffix}@example.com`,
        role: UserRole.DRIVER,
        status: UserStatus.ACTIVE,
        passwordHash: await hash('Password123', 4),
      },
    });
    try {
      const login = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ identifier: user.email, password: 'Password123' })
        .expect(200);
      const oldToken = login.body.data.accessToken;
      await request(app.getHttpServer())
        .post('/api/v1/auth/mfa/setup')
        .set('Authorization', `Bearer ${oldToken}`)
        .send({ password: 'wrong' })
        .expect(401);
      const setup = await request(app.getHttpServer())
        .post('/api/v1/auth/mfa/setup')
        .set('Authorization', `Bearer ${oldToken}`)
        .send({ password: 'Password123' })
        .expect(200);
      const confirmed = await request(app.getHttpServer())
        .post('/api/v1/auth/mfa/verify')
        .send({
          challenge: setup.body.data.challenge,
          code: totp(setup.body.data.secret),
        })
        .expect(200);
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${oldToken}`)
        .expect(401);
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${confirmed.body.data.accessToken}`)
        .expect(200);
      const codes = await request(app.getHttpServer())
        .post('/api/v1/auth/mfa/recovery-codes')
        .set('Authorization', `Bearer ${confirmed.body.data.accessToken}`)
        .expect(200);
      const replacement = await request(app.getHttpServer())
        .post('/api/v1/auth/mfa/replace')
        .set('Authorization', `Bearer ${confirmed.body.data.accessToken}`)
        .send({
          password: 'Password123',
          recoveryCode: codes.body.data.recoveryCodes[0],
        })
        .expect(200);
      const replaced = await request(app.getHttpServer())
        .post('/api/v1/auth/mfa/replace/confirm')
        .set('Authorization', `Bearer ${confirmed.body.data.accessToken}`)
        .send({ code: totp(replacement.body.data.secret, 1) })
        .expect(200);
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${confirmed.body.data.accessToken}`)
        .expect(401);
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${replaced.body.data.accessToken}`)
        .expect(200);
    } finally {
      await prisma.user.delete({ where: { id: user.id } });
    }
  });

  it('updates the six-step checklist as business setup changes', async () => {
    const prisma = app.get(PrismaService);
    const suffix = randomUUID();
    const business = await prisma.business.create({
      data: { name: `Setup ${suffix}` },
    });
    const region = await prisma.region.create({
      data: { code: suffix, name: 'Test region' },
    });
    try {
      await prisma.user.create({
        data: {
          email: `${suffix}@example.com`,
          firstName: 'Admin',
          role: UserRole.BUSINESS_ADMIN,
          status: UserStatus.PENDING_INVITE,
          businessId: business.id,
        },
      });
      await prisma.businessRegion.create({
        data: { businessId: business.id, regionId: region.id },
      });
      await prisma.business.update({
        where: { id: business.id },
        data: { settingsConfigured: true, permissionsVerified: true },
      });
      await refreshBusinessSetup(prisma, business.id);
      const complete = await prisma.business.findUniqueOrThrow({
        where: { id: business.id },
        include: { users: true, regions: true },
      });
      expect(complete.status).toBe(BusinessStatus.READY);
      expect(businessSetup(complete)).toMatchObject({ total: 6, completed: 6 });
      await prisma.businessRegion.deleteMany({
        where: { businessId: business.id },
      });
      await refreshBusinessSetup(prisma, business.id);
      expect(
        (
          await prisma.business.findUniqueOrThrow({
            where: { id: business.id },
          })
        ).status,
      ).toBe(BusinessStatus.INCOMPLETE);
      await prisma.businessRegion.create({
        data: { businessId: business.id, regionId: region.id },
      });
      await prisma.business.update({
        where: { id: business.id },
        data: { settingsConfigured: false, permissionsVerified: false },
      });
      await Promise.all([
        (async () => {
          await prisma.business.update({
            where: { id: business.id },
            data: { settingsConfigured: true },
          });
          await refreshBusinessSetup(prisma, business.id);
        })(),
        (async () => {
          await prisma.business.update({
            where: { id: business.id },
            data: { permissionsVerified: true },
          });
          await refreshBusinessSetup(prisma, business.id);
        })(),
      ]);
      expect(
        (
          await prisma.business.findUniqueOrThrow({
            where: { id: business.id },
          })
        ).status,
      ).toBe(BusinessStatus.READY);
    } finally {
      await prisma.business.delete({ where: { id: business.id } });
      await prisma.region.delete({ where: { id: region.id } });
    }
  });

  it('prevents tenant user administration from crossing privilege and depot boundaries', async () => {
    const prisma = app.get(PrismaService);
    const users = app.get(UsersService);
    const suffix = randomUUID();
    const tenant = await prisma.business.create({
      data: { name: `Tenant ${suffix}` },
    });
    const other = await prisma.business.create({
      data: { name: `Other ${suffix}` },
    });
    try {
      const driver = await prisma.user.create({
        data: {
          businessId: tenant.id,
          firstName: 'Driver',
          email: `${suffix}@example.com`,
          role: UserRole.DRIVER,
        },
      });
      const depot = await prisma.depot.create({
        data: { businessId: other.id, name: 'Other depot' },
      });
      const admin = await prisma.user.create({
        data: {
          businessId: tenant.id,
          firstName: 'Admin',
          email: `admin-${suffix}@example.com`,
          role: UserRole.BUSINESS_ADMIN,
        },
      });
      const actor = {
        id: admin.id,
        email: admin.email,
        role: UserRole.BUSINESS_ADMIN,
        businessId: tenant.id,
      };
      await expect(
        users.update(actor, driver.id, { role: UserRole.SUPER_ADMIN }),
      ).rejects.toThrow('super admin');
      await expect(
        users.update(actor, driver.id, { depotId: depot.id }),
      ).rejects.toThrow('outside the user business');
      const unchanged = await prisma.user.findUniqueOrThrow({
        where: { id: driver.id },
      });
      expect(unchanged.role).toBe(UserRole.DRIVER);
      expect(unchanged.depotId).toBeNull();
    } finally {
      await prisma.business.deleteMany({
        where: { id: { in: [tenant.id, other.id] } },
      });
    }
  });

  it('enforces live-map permissions, expiring overrides and depot scope', async () => {
    const prisma = app.get(PrismaService);
    const users = app.get(UsersService);
    const suffix = randomUUID();
    const business = await prisma.business.create({
      data: { name: `Access ${suffix}` },
    });
    const other = await prisma.business.create({
      data: { name: `Other ${suffix}` },
    });
    try {
      const admin = await prisma.user.create({
        data: {
          businessId: business.id,
          firstName: 'Admin',
          email: `admin-${suffix}@example.com`,
          role: UserRole.BUSINESS_ADMIN,
          status: UserStatus.ACTIVE,
        },
      });
      const manager = await prisma.user.create({
        data: {
          businessId: business.id,
          firstName: 'Supervisor',
          email: `super-${suffix}@example.com`,
          role: UserRole.SUPERVISOR,
          status: UserStatus.ACTIVE,
          passwordHash: await hash('Password123', 4),
        },
      });
      const depotA = await prisma.depot.create({
        data: { businessId: business.id, name: 'A' },
      });
      const depotB = await prisma.depot.create({
        data: { businessId: business.id, name: 'B' },
      });
      const otherDepot = await prisma.depot.create({
        data: { businessId: other.id, name: 'Other' },
      });
      const driverA = await prisma.user.create({
        data: {
          businessId: business.id,
          depotId: depotA.id,
          firstName: 'A',
          email: `a-${suffix}@example.com`,
          role: UserRole.DRIVER,
        },
      });
      const driverB = await prisma.user.create({
        data: {
          businessId: business.id,
          depotId: depotB.id,
          firstName: 'B',
          email: `b-${suffix}@example.com`,
          role: UserRole.DRIVER,
        },
      });
      await prisma.user.update({
        where: { id: driverA.id },
        data: { supervisorId: admin.id },
      });
      await prisma.complianceDocument.create({
        data: { userId: driverA.id, type: 'TRAINING', title: 'Certificate' },
      });
      await prisma.vehicle.create({
        data: {
          businessId: business.id,
          depotId: depotB.id,
          assignedDriverId: driverA.id,
          code: 'VH-1',
          registration: 'TEST-1',
          model: 'Van',
        },
      });
      await prisma.driverLocation.createMany({
        data: [driverA, driverB].map((driver) => ({
          driverId: driver.id,
          latitude: 1,
          longitude: 2,
          recordedAt: new Date(),
        })),
      });
      await prisma.roleDefinition.create({
        data: {
          businessId: business.id,
          key: UserRole.SUPERVISOR,
          name: 'Supervisor',
          isSystem: true,
          permissions: {
            create: [
              { module: PermissionModule.LIVE_MAP, canView: true },
              { module: PermissionModule.DRIVERS, canView: true },
            ],
          },
        },
      });
      const actor = {
        id: admin.id,
        email: admin.email,
        role: UserRole.BUSINESS_ADMIN,
        businessId: business.id,
      };
      await expect(
        users.setDepotScope(actor, manager.id, {
          allDepots: false,
          depotIds: [otherDepot.id],
        }),
      ).rejects.toThrow('outside');
      await users.setDepotScope(actor, manager.id, {
        allDepots: false,
        depotIds: [depotA.id],
      });
      const login = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ identifier: manager.email, password: 'Password123' })
        .expect(200);
      const token = login.body.data.accessToken;
      const directory = await request(app.getHttpServer())
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(directory.body.data.map((row: { id: string }) => row.id)).toEqual([
        driverA.id,
      ]);
      const limitedDetail = await request(app.getHttpServer())
        .get(`/api/v1/users/${driverA.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(limitedDetail.body.data.documents).toBeUndefined();
      expect(limitedDetail.body.data.assignedVehicles).toBeUndefined();
      expect(limitedDetail.body.data.supervisor).toBeNull();
      const role = await prisma.roleDefinition.findFirstOrThrow({
        where: { businessId: business.id, key: UserRole.SUPERVISOR },
      });
      await prisma.rolePermission.createMany({
        data: [PermissionModule.COMPLIANCE, PermissionModule.VEHICLES].map(
          (module) => ({ roleDefinitionId: role.id, module, canView: true }),
        ),
      });
      const fullDetail = await request(app.getHttpServer())
        .get(`/api/v1/users/${driverA.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(fullDetail.body.data.documents).toHaveLength(1);
      expect(fullDetail.body.data.assignedVehicles).toHaveLength(0);
      await request(app.getHttpServer())
        .get(`/api/v1/users/${driverB.id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
      await users.setPermissionOverride(actor, manager.id, {
        module: PermissionModule.DRIVERS,
        canView: false,
        canEdit: false,
        startsAt: new Date(Date.now() - 1000).toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      });
      await request(app.getHttpServer())
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
      const visible = await request(app.getHttpServer())
        .get('/api/v1/locations/latest')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(
        visible.body.data.map((row: { driverId: string }) => row.driverId),
      ).toEqual([driverA.id]);
      const from = new Date(Date.now() - 60_000).toISOString();
      const to = new Date(Date.now() + 60_000).toISOString();
      await request(app.getHttpServer())
        .get(`/api/v1/locations/drivers/${driverB.id}/history`)
        .query({ from, to })
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
      await request(app.getHttpServer())
        .get(`/api/v1/locations/drivers/${driverA.id}/history`)
        .query({ from, to })
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      await users.setPermissionOverride(actor, manager.id, {
        module: PermissionModule.LIVE_MAP,
        canView: false,
        canEdit: false,
        startsAt: new Date(Date.now() - 1000).toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      });
      await request(app.getHttpServer())
        .get('/api/v1/locations/latest')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
      await prisma.userPermissionOverride.update({
        where: {
          userId_module: {
            userId: manager.id,
            module: PermissionModule.LIVE_MAP,
          },
        },
        data: {
          startsAt: new Date(Date.now() - 120_000),
          expiresAt: new Date(Date.now() - 1000),
        },
      });
      await request(app.getHttpServer())
        .get('/api/v1/locations/latest')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      await prisma.user.update({
        where: { id: admin.id },
        data: {
          depotId: depotA.id,
          allDepots: false,
          depotScopes: { create: { depotId: depotA.id } },
        },
      });
      await expect(
        users.setDepotScope(actor, driverA.id, {
          allDepots: true,
          depotIds: [],
        }),
      ).rejects.toThrow('outside your scope');
      await expect(
        users.setDepotScope(actor, driverA.id, {
          allDepots: false,
          depotIds: [depotB.id],
        }),
      ).rejects.toThrow('outside your scope');
      await expect(users.access(actor, driverB.id)).rejects.toThrow(
        'not found',
      );
    } finally {
      await prisma.business.deleteMany({
        where: { id: { in: [business.id, other.id] } },
      });
    }
  });

  it('enforces fleet permissions, depot boundaries and assigned-vehicle access', async () => {
    const prisma = app.get(PrismaService);
    const suffix = randomUUID();
    const business = await prisma.business.create({
      data: { name: `Fleet ${suffix}` },
    });
    const other = await prisma.business.create({
      data: { name: `Other fleet ${suffix}` },
    });
    try {
      const depotA = await prisma.depot.create({
        data: { businessId: business.id, name: 'A' },
      });
      const depotB = await prisma.depot.create({
        data: { businessId: business.id, name: 'B' },
      });
      const otherDepot = await prisma.depot.create({
        data: { businessId: other.id, name: 'Other' },
      });
      const manager = await prisma.user.create({
        data: {
          businessId: business.id,
          depotId: depotA.id,
          firstName: 'Fleet',
          email: `fleet-${suffix}@example.com`,
          role: UserRole.FLEET_MANAGER,
          status: UserStatus.ACTIVE,
          passwordHash: await hash('Password123', 4),
          allDepots: false,
          depotScopes: { create: { depotId: depotA.id } },
        },
      });
      const driver = await prisma.user.create({
        data: {
          businessId: business.id,
          depotId: depotA.id,
          firstName: 'Driver',
          email: `driver-${suffix}@example.com`,
          role: UserRole.DRIVER,
          status: UserStatus.ACTIVE,
          passwordHash: await hash('Password123', 4),
          allDepots: false,
          depotScopes: { create: { depotId: depotA.id } },
        },
      });
      const assistant = await prisma.user.create({
        data: {
          businessId: business.id,
          depotId: depotA.id,
          firstName: 'Assistant',
          email: `assistant-${suffix}@example.com`,
          role: UserRole.ASSISTANT,
          status: UserStatus.ACTIVE,
          passwordHash: await hash('Password123', 4),
          allDepots: false,
          depotScopes: { create: { depotId: depotA.id } },
        },
      });
      const vehicleA = await prisma.vehicle.create({
        data: {
          businessId: business.id,
          depotId: depotA.id,
          assignedDriverId: driver.id,
          code: 'A',
          registration: 'A-1',
          model: 'Van A',
        },
      });
      const vehicleB = await prisma.vehicle.create({
        data: {
          businessId: business.id,
          depotId: depotB.id,
          code: 'B',
          registration: 'B-1',
          model: 'Van B',
        },
      });
      const vehicleC = await prisma.vehicle.create({
        data: {
          businessId: business.id,
          depotId: depotA.id,
          code: 'C',
          registration: 'C-1',
          model: 'Van C',
        },
      });
      const shift = await prisma.shift.create({
        data: {
          businessId: business.id,
          depotId: depotA.id,
          assistantId: assistant.id,
          vehicleId: vehicleC.id,
          date: new Date(),
          startTime: '08:00',
          endTime: '17:00',
          status: 'DRAFT',
        },
      });
      for (const role of [
        UserRole.FLEET_MANAGER,
        UserRole.DRIVER,
        UserRole.ASSISTANT,
      ]) {
        await prisma.roleDefinition.create({
          data: {
            businessId: business.id,
            key: role,
            name: role,
            isSystem: true,
            permissions: {
              create: {
                module: PermissionModule.VEHICLES,
                canView: true,
                canEdit: role === UserRole.FLEET_MANAGER,
              },
            },
          },
        });
      }
      const login = (identifier: string) =>
        request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .send({ identifier, password: 'Password123' })
          .expect(200);
      const managerToken = (await login(manager.email)).body.data.accessToken;
      const driverToken = (await login(driver.email)).body.data.accessToken;
      const assistantToken = (await login(assistant.email)).body.data
        .accessToken;
      const list = await request(app.getHttpServer())
        .get('/api/v1/vehicles')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      expect(list.body.data.map((row: { id: string }) => row.id)).toEqual([
        vehicleA.id,
        vehicleC.id,
      ]);
      await request(app.getHttpServer())
        .get(`/api/v1/vehicles/${vehicleB.id}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(404);
      await request(app.getHttpServer())
        .get(`/api/v1/vehicles/${vehicleC.id}`)
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(404);
      await request(app.getHttpServer())
        .get(`/api/v1/vehicles/${vehicleC.id}`)
        .set('Authorization', `Bearer ${assistantToken}`)
        .expect(404);
      await prisma.shift.update({
        where: { id: shift.id },
        data: { status: 'PUBLISHED' },
      });
      await request(app.getHttpServer())
        .get(`/api/v1/vehicles/${vehicleC.id}`)
        .set('Authorization', `Bearer ${assistantToken}`)
        .expect(200);
      const detail = await request(app.getHttpServer())
        .get(`/api/v1/vehicles/${vehicleA.id}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      expect(detail.body.data.inspections).toBeUndefined();
      expect(detail.body.data.maintenance).toBeUndefined();
      expect(detail.body.data.readiness.ready).toBeNull();
      expect(detail.body.data.assignedDriver).toBeNull();
      expect(detail.body.data.assignedDriverId).toBeNull();
      for (const role of [
        UserRole.FLEET_MANAGER,
        UserRole.DRIVER,
        UserRole.ASSISTANT,
      ]) {
        const definition = await prisma.roleDefinition.findFirstOrThrow({
          where: { businessId: business.id, key: role },
        });
        await prisma.rolePermission.create({
          data: {
            roleDefinitionId: definition.id,
            module: PermissionModule.INSPECTIONS,
            canView: true,
            canEdit: role !== UserRole.FLEET_MANAGER,
          },
        });
      }
      await request(app.getHttpServer())
        .patch(`/api/v1/vehicles/${vehicleA.id}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ depotId: depotB.id })
        .expect(400);
      await request(app.getHttpServer())
        .post('/api/v1/vehicles')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ registration: 'X-1', model: 'Van', depotId: otherDepot.id })
        .expect(400);
      await request(app.getHttpServer())
        .get(`/api/v1/vehicles/${vehicleA.id}`)
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(200);
      await request(app.getHttpServer())
        .get(`/api/v1/vehicles/${vehicleB.id}`)
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(404);
      await request(app.getHttpServer())
        .post('/api/v1/inspections')
        .set('Authorization', `Bearer ${driverToken}`)
        .send({
          vehicleId: vehicleB.id,
          type: 'PRE_SHIFT',
          items: [{ name: 'Tyres', result: 'ISSUE' }],
        })
        .expect(404);
      await request(app.getHttpServer())
        .post('/api/v1/damage-reports')
        .set('Authorization', `Bearer ${driverToken}`)
        .send({
          vehicleId: vehicleB.id,
          locations: ['FRONT'],
          severity: 'MINOR',
          description: 'Damage',
        })
        .expect(404);
      const foreignDamage = await prisma.damageType.create({
        data: { businessId: other.id, name: 'Foreign' },
      });
      await request(app.getHttpServer())
        .post('/api/v1/damage-reports')
        .set('Authorization', `Bearer ${driverToken}`)
        .send({
          vehicleId: vehicleA.id,
          damageTypeId: foreignDamage.id,
          locations: ['FRONT'],
          severity: 'MINOR',
          description: 'Damage',
        })
        .expect(400);
      expect(
        await prisma.inspection.count({ where: { vehicleId: vehicleB.id } }),
      ).toBe(0);
      expect(
        await prisma.damageReport.count({ where: { vehicleId: vehicleB.id } }),
      ).toBe(0);
      const submitted = await request(app.getHttpServer())
        .post('/api/v1/inspections')
        .set('Authorization', `Bearer ${driverToken}`)
        .send({
          vehicleId: vehicleA.id,
          type: 'PRE_SHIFT',
          items: [{ name: 'Tyres', result: 'ISSUE' }],
        })
        .expect(201);
      const inspectionId = submitted.body.data.id;
      const outsideInspection = await prisma.inspection.create({
        data: {
          vehicleId: vehicleB.id,
          driverId: driver.id,
          type: 'PRE_SHIFT',
          result: 'PASSED',
          photos: [],
        },
      });
      const managerInspections = await request(app.getHttpServer())
        .get('/api/v1/inspections')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      expect(
        managerInspections.body.data.map((row: { id: string }) => row.id),
      ).toContain(inspectionId);
      expect(
        managerInspections.body.data.map((row: { id: string }) => row.id),
      ).not.toContain(outsideInspection.id);
      await request(app.getHttpServer())
        .get(`/api/v1/inspections/${outsideInspection.id}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(404);
      expect(managerInspections.body.data[0].driver).toBeNull();
      expect(managerInspections.body.data[0].vehicle.id).toBe(vehicleA.id);
      await request(app.getHttpServer())
        .patch(`/api/v1/inspections/${inspectionId}/review`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({})
        .expect(403);
      const inspectionDetail = await request(app.getHttpServer())
        .get(`/api/v1/inspections/${inspectionId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      expect(inspectionDetail.body.data.repairRequests).toBeUndefined();
      await prisma.rolePermission.updateMany({
        where: {
          roleDefinition: {
            businessId: business.id,
            key: UserRole.FLEET_MANAGER,
          },
          module: PermissionModule.INSPECTIONS,
        },
        data: { canView: false },
      });
      await request(app.getHttpServer())
        .get('/api/v1/inspections')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(403);
      await prisma.rolePermission.updateMany({
        where: {
          roleDefinition: {
            businessId: business.id,
            key: UserRole.FLEET_MANAGER,
          },
          module: PermissionModule.INSPECTIONS,
        },
        data: { canView: true },
      });
      const submittedDamage = await request(app.getHttpServer())
        .post('/api/v1/damage-reports')
        .set('Authorization', `Bearer ${driverToken}`)
        .send({
          vehicleId: vehicleA.id,
          locations: ['FRONT'],
          severity: 'UNSAFE',
          description: 'Scratch',
        })
        .expect(201);
      const damageId = submittedDamage.body.data.id;
      expect(
        (await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicleA.id } }))
          .status,
      ).toBe('GROUNDED');
      const concurrentInspections = await Promise.all(
        [100, 200].map((odometerKm) =>
          request(app.getHttpServer())
            .post('/api/v1/inspections')
            .set('Authorization', `Bearer ${driverToken}`)
            .send({
              vehicleId: vehicleA.id,
              type: 'PRE_SHIFT',
              odometerKm,
              items: [{ name: 'Tyres', result: 'ISSUE' }],
            }),
        ),
      );
      expect(concurrentInspections.map((response) => response.status)).toEqual([
        201, 201,
      ]);
      const safeVehicle = await prisma.vehicle.findUniqueOrThrow({
        where: { id: vehicleA.id },
      });
      expect(safeVehicle.status).toBe('GROUNDED');
      expect(safeVehicle.odometerKm).toBe(200);
      const outsideDamage = await prisma.damageReport.create({
        data: {
          vehicleId: vehicleB.id,
          reportedById: driver.id,
          code: 'OUTSIDE',
          locations: ['FRONT'],
          severity: 'MINOR',
          description: 'Outside',
          photos: [],
        },
      });
      const reports = await request(app.getHttpServer())
        .get('/api/v1/damage-reports')
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      expect(reports.body.data.map((row: { id: string }) => row.id)).toContain(
        damageId,
      );
      expect(
        reports.body.data.map((row: { id: string }) => row.id),
      ).not.toContain(outsideDamage.id);
      expect(reports.body.data[0].reportedBy).toBeNull();
      expect(reports.body.data[0].repairRequests).toBeUndefined();
      await request(app.getHttpServer())
        .get(`/api/v1/damage-reports/${outsideDamage.id}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(404);
      await request(app.getHttpServer())
        .post(`/api/v1/damage-reports/${damageId}/approve`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({})
        .expect(403);
      await prisma.rolePermission.updateMany({
        where: {
          roleDefinition: {
            businessId: business.id,
            key: UserRole.FLEET_MANAGER,
          },
          module: PermissionModule.INSPECTIONS,
        },
        data: { canEdit: true },
      });
      await request(app.getHttpServer())
        .post(`/api/v1/damage-reports/${damageId}/repair-request`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({})
        .expect(403);
      await prisma.rolePermission.updateMany({
        where: {
          roleDefinition: { businessId: business.id, key: UserRole.DRIVER },
          module: PermissionModule.INSPECTIONS,
        },
        data: { canEdit: false },
      });
      await request(app.getHttpServer())
        .post('/api/v1/inspections')
        .set('Authorization', `Bearer ${driverToken}`)
        .send({
          vehicleId: vehicleA.id,
          type: 'PRE_SHIFT',
          items: [{ name: 'Tyres', result: 'GOOD' }],
        })
        .expect(403);
      expect(
        (await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicleA.id } }))
          .status,
      ).toBe('GROUNDED');
      const outsideDriver = await prisma.user.create({
        data: {
          businessId: business.id,
          depotId: depotB.id,
          firstName: 'Outsider',
          email: `outside-${suffix}@example.com`,
          role: UserRole.DRIVER,
        },
      });
      await prisma.vehicle.update({
        where: { id: vehicleA.id },
        data: { assignedDriverId: outsideDriver.id },
      });
      const fleetRole = await prisma.roleDefinition.findFirstOrThrow({
        where: { businessId: business.id, key: UserRole.FLEET_MANAGER },
      });
      await prisma.rolePermission.create({
        data: {
          roleDefinitionId: fleetRole.id,
          module: PermissionModule.DRIVERS,
          canView: true,
        },
      });
      const scopedDetail = await request(app.getHttpServer())
        .get(`/api/v1/vehicles/${vehicleA.id}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      expect(scopedDetail.body.data.assignedDriver).toBeNull();
      expect(scopedDetail.body.data.assignedDriverId).toBeNull();
      const search = await request(app.getHttpServer())
        .get('/api/v1/vehicles')
        .query({ search: 'Outsider' })
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      expect(search.body.data).toHaveLength(0);
      await prisma.rolePermission.updateMany({
        where: {
          roleDefinition: {
            businessId: business.id,
            key: UserRole.FLEET_MANAGER,
          },
          module: PermissionModule.VEHICLES,
        },
        data: { canEdit: false },
      });
      await request(app.getHttpServer())
        .patch(`/api/v1/vehicles/${vehicleA.id}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ model: 'Updated' })
        .expect(403);
    } finally {
      await prisma.business.deleteMany({
        where: { id: { in: [business.id, other.id] } },
      });
    }
  });

  it('enforces delivery permissions, depot scope, assignments and assistant ownership', async () => {
    const prisma = app.get(PrismaService);
    const users = app.get(UsersService);
    const suffix = randomUUID();
    const business = await prisma.business.create({
      data: { name: `Delivery ${suffix}` },
    });
    const other = await prisma.business.create({
      data: { name: `Other delivery ${suffix}` },
    });
    try {
      const depotA = await prisma.depot.create({
        data: { businessId: business.id, name: 'A' },
      });
      const depotB = await prisma.depot.create({
        data: { businessId: business.id, name: 'B' },
      });
      const admin = await prisma.user.create({
        data: {
          businessId: business.id,
          firstName: 'Admin',
          email: `da-${suffix}@example.com`,
          role: UserRole.BUSINESS_ADMIN,
        },
      });
      const passwordHash = await hash('Password123', 4);
      const makeUser = (label: string, role: UserRole, depotId: string) =>
        prisma.user.create({
          data: {
            businessId: business.id,
            depotId,
            firstName: label,
            email: `${label}-${suffix}@example.com`,
            role,
            status: UserStatus.ACTIVE,
            passwordHash,
            allDepots: false,
            depotScopes: { create: { depotId: depotA.id } },
          },
        });
      const manager = await makeUser('manager', UserRole.SUPERVISOR, depotA.id);
      const driver = await makeUser('driver', UserRole.DRIVER, depotA.id);
      const driver2 = await makeUser('driver2', UserRole.DRIVER, depotA.id);
      const outsideDriver = await makeUser(
        'outside',
        UserRole.DRIVER,
        depotB.id,
      );
      const assistant = await makeUser(
        'assistant',
        UserRole.ASSISTANT,
        depotA.id,
      );
      const foreignVehicle = await prisma.vehicle.create({
        data: {
          businessId: other.id,
          code: 'FOREIGN',
          registration: 'OTHER',
          model: 'Van',
        },
      });
      const vehicle = await prisma.vehicle.create({
        data: {
          businessId: business.id,
          depotId: depotA.id,
          code: 'LOCAL',
          registration: 'LOCAL',
          model: 'Van',
        },
      });
      const shift = await prisma.shift.create({
        data: {
          businessId: business.id,
          depotId: depotA.id,
          driverId: driver.id,
          assistantId: assistant.id,
          date: new Date(),
          startTime: '08:00',
          endTime: '17:00',
          status: 'PUBLISHED',
        },
      });
      for (const role of [
        UserRole.SUPERVISOR,
        UserRole.DRIVER,
        UserRole.ASSISTANT,
      ])
        await prisma.roleDefinition.create({
          data: {
            businessId: business.id,
            key: role,
            name: role,
            isSystem: true,
            permissions: {
              create: {
                module: PermissionModule.DELIVERIES,
                canView: true,
                canEdit: true,
              },
            },
          },
        });
      const login = async (email: string) =>
        (
          await request(app.getHttpServer())
            .post('/api/v1/auth/login')
            .send({ identifier: email, password: 'Password123' })
            .expect(200)
        ).body.data.accessToken;
      const managerToken = await login(manager.email),
        driverToken = await login(driver.email),
        assistantToken = await login(assistant.email);
      const base = {
        customerName: 'Customer',
        deliveryAddress: 'Address',
        depotId: depotA.id,
        scheduledDropTime: new Date().toISOString(),
      };
      await request(app.getHttpServer())
        .post('/api/v1/deliveries')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ ...base, vehicleId: foreignVehicle.id })
        .expect(400);
      await request(app.getHttpServer())
        .post('/api/v1/deliveries')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ ...base, driverId: outsideDriver.id })
        .expect(400);
      const created = await request(app.getHttpServer())
        .post('/api/v1/deliveries')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ ...base, driverId: driver.id, vehicleId: vehicle.id })
        .expect(201);
      const deliveryId = created.body.data.id;
      expect(
        (await prisma.delivery.findUniqueOrThrow({ where: { id: deliveryId } }))
          .shiftId,
      ).toBe(shift.id);
      expect(created.body.data.driver).toBeNull();
      expect(created.body.data.driverId).toBeNull();
      expect(created.body.data.vehicle).toBeNull();
      expect(created.body.data.vehicleId).toBeNull();
      expect(created.body.data.shift).toBeNull();
      const search = await request(app.getHttpServer())
        .get('/api/v1/deliveries')
        .query({ search: 'driver' })
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
      expect(search.body.data).toHaveLength(0);
      const outside = await prisma.delivery.create({
        data: {
          businessId: business.id,
          depotId: depotB.id,
          driverId: outsideDriver.id,
          code: 'OUTSIDE',
          customerName: 'Other',
          deliveryAddress: 'Elsewhere',
        },
      });
      const mine = await request(app.getHttpServer())
        .get('/api/v1/deliveries/me')
        .set('Authorization', `Bearer ${assistantToken}`)
        .expect(200);
      expect(mine.body.data.map((row: { id: string }) => row.id)).toContain(
        deliveryId,
      );
      await prisma.shift.update({
        where: { id: shift.id },
        data: { status: 'DRAFT' },
      });
      await request(app.getHttpServer())
        .get(`/api/v1/deliveries/${deliveryId}`)
        .set('Authorization', `Bearer ${assistantToken}`)
        .expect(404);
      await prisma.shift.update({
        where: { id: shift.id },
        data: { status: 'PUBLISHED' },
      });
      await request(app.getHttpServer())
        .get(`/api/v1/deliveries/${outside.id}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(404);
      await request(app.getHttpServer())
        .patch(`/api/v1/deliveries/${deliveryId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ depotId: depotB.id })
        .expect(400);
      const actor = {
        id: admin.id,
        email: admin.email,
        role: UserRole.BUSINESS_ADMIN,
        businessId: business.id,
      };
      await users.setPermissionOverride(actor, driver.id, {
        module: PermissionModule.DELIVERIES,
        canView: true,
        canEdit: false,
        startsAt: new Date(Date.now() - 1000).toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      });
      await request(app.getHttpServer())
        .get(`/api/v1/deliveries/${deliveryId}`)
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(200);
      await request(app.getHttpServer())
        .post(`/api/v1/deliveries/${deliveryId}/pickup`)
        .set('Authorization', `Bearer ${driverToken}`)
        .send({})
        .expect(403);
      const concurrentPickups = await Promise.all(
        [0, 1].map(() =>
          request(app.getHttpServer())
            .post(`/api/v1/deliveries/${deliveryId}/pickup`)
            .set('Authorization', `Bearer ${assistantToken}`)
            .send({}),
        ),
      );
      expect(
        concurrentPickups
          .map((response) => response.status)
          .sort((a, b) => a - b),
      ).toEqual([201, 400]);
      await request(app.getHttpServer())
        .patch(`/api/v1/deliveries/${deliveryId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ driverId: driver2.id })
        .expect(200);
      expect(
        (await prisma.delivery.findUniqueOrThrow({ where: { id: deliveryId } }))
          .shiftId,
      ).toBeNull();
      await request(app.getHttpServer())
        .get(`/api/v1/deliveries/${deliveryId}`)
        .set('Authorization', `Bearer ${assistantToken}`)
        .expect(404);
      await prisma.delivery.update({
        where: { id: deliveryId },
        data: { driverId: assistant.id, shiftId: null },
      });
      await request(app.getHttpServer())
        .get(`/api/v1/deliveries/${deliveryId}`)
        .set('Authorization', `Bearer ${assistantToken}`)
        .expect(404);
    } finally {
      await prisma.business.deleteMany({
        where: { id: { in: [business.id, other.id] } },
      });
    }
  });
});
