/** Business setup checklist: every mutation path, status rules and recovery. */
import { INestApplication } from '@nestjs/common';
import { hash } from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { SetupReconcilerService } from './../src/businesses/setup-reconciler.service.js';
import {
  BusinessStatus,
  UserRole,
  UserStatus,
} from './../src/generated/prisma/enums.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { auth, createTestApp } from './support.js';

describe('Business setup checklist (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    await app.close();
  });

  it('derives status from every checklist mutation and blocks archived tenants', async () => {
    const suffix = randomUUID().slice(0, 8);
    const http = () => request(app.getHttpServer());
    const superAdmin = await prisma.user.create({
      data: {
        email: `root-${suffix}@example.com`,
        firstName: 'Root',
        role: UserRole.SUPER_ADMIN,
        status: UserStatus.ACTIVE,
        passwordHash: await hash('Password123', 4),
      },
    });
    const region = await prisma.region.create({
      data: { code: `R${suffix}`, name: 'Region' },
    });
    const name = `Setup ${suffix}`;
    let businessId: string | undefined;
    try {
      const token = (
        await http()
          .post('/api/v1/auth/login')
          .send({ identifier: superAdmin.email, password: 'Password123' })
          .expect(200)
      ).body.data.accessToken;
      const statusOf = async () =>
        (await prisma.business.findUniqueOrThrow({ where: { id: businessId } }))
          .status;

      // Invalid inputs are rejected before anything is created.
      await http()
        .post('/api/v1/businesses')
        .set(auth(token))
        .send({ name, regionIds: [randomUUID()] })
        .expect(400);
      await http()
        .post('/api/v1/businesses')
        .set(auth(token))
        .send({
          name,
          administrator: { fullName: 'Dup', email: superAdmin.email },
        })
        .expect(400);
      expect(await prisma.business.count({ where: { name } })).toBe(0);

      const created = await http()
        .post('/api/v1/businesses')
        .set(auth(token))
        .send({
          name,
          administrator: {
            fullName: 'Ada Admin',
            email: `admin-${suffix}@example.com`,
          },
          regionIds: [region.id],
        })
        .expect(201);
      businessId = created.body.data.id;
      expect(await statusOf()).toBe(BusinessStatus.INCOMPLETE);

      // Go-live requires the prerequisites.
      await http()
        .patch(`/api/v1/businesses/${businessId}`)
        .set(auth(token))
        .send({ status: BusinessStatus.ACTIVE })
        .expect(400);
      await http()
        .patch(`/api/v1/settings?businessId=${businessId}`)
        .set(auth(token))
        .send({ supportEmail: 'help@example.com' })
        .expect(200);
      expect(await statusOf()).toBe(BusinessStatus.INCOMPLETE);

      // Failure recovery: a prerequisite committed without its refresh is
      // repaired by the reconciler.
      await prisma.business.update({
        where: { id: businessId },
        data: { permissionsVerified: true },
      });
      expect(await statusOf()).toBe(BusinessStatus.INCOMPLETE);
      await app.get(SetupReconcilerService).reconcile();
      expect(await statusOf()).toBe(BusinessStatus.READY);

      // An inactive region no longer counts.
      const assignment = await prisma.businessRegion.findFirstOrThrow({
        where: { businessId },
      });
      await http()
        .patch(`/api/v1/regions/assignments/${assignment.id}`)
        .set(auth(token))
        .send({ status: 'INACTIVE' })
        .expect(200);
      expect(await statusOf()).toBe(BusinessStatus.INCOMPLETE);
      await http()
        .patch(`/api/v1/regions/assignments/${assignment.id}`)
        .set(auth(token))
        .send({ status: 'ACTIVE' })
        .expect(200);
      expect(await statusOf()).toBe(BusinessStatus.READY);

      // Deactivating the only administrator reopens setup.
      const admin = await prisma.user.findFirstOrThrow({
        where: { businessId, role: UserRole.BUSINESS_ADMIN },
      });
      await http()
        .patch(`/api/v1/administrators/${admin.id}`)
        .set(auth(token))
        .send({ status: UserStatus.INACTIVE })
        .expect(200);
      expect(await statusOf()).toBe(BusinessStatus.INCOMPLETE);
      await http()
        .patch(`/api/v1/administrators/${admin.id}`)
        .set(auth(token))
        .send({ status: UserStatus.ACTIVE })
        .expect(200);
      expect(await statusOf()).toBe(BusinessStatus.READY);

      await http()
        .patch(`/api/v1/businesses/${businessId}`)
        .set(auth(token))
        .send({ status: BusinessStatus.ACTIVE })
        .expect(200);
      expect(await statusOf()).toBe(BusinessStatus.ACTIVE);

      // Archiving signs tenant users out and blocks new sessions.
      await prisma.user.update({
        where: { id: admin.id },
        data: { passwordHash: await hash('Password123', 4) },
      });
      const adminLogin = await http()
        .post('/api/v1/auth/login')
        .send({ identifier: admin.email, password: 'Password123' })
        .expect(200);
      await http()
        .patch(`/api/v1/businesses/${businessId}`)
        .set(auth(token))
        .send({ status: BusinessStatus.INACTIVE })
        .expect(200);
      await http()
        .get('/api/v1/auth/me')
        .set(auth(adminLogin.body.data.accessToken))
        .expect(401);
      await http()
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: adminLogin.body.data.refreshToken })
        .expect(403);
      await http()
        .post('/api/v1/auth/login')
        .send({ identifier: admin.email, password: 'Password123' })
        .expect(403);

      // Reopening recomputes the derived status instead of trusting the input.
      await http()
        .patch(`/api/v1/businesses/${businessId}`)
        .set(auth(token))
        .send({ status: BusinessStatus.PENDING_SETUP })
        .expect(200);
      expect(await statusOf()).toBe(BusinessStatus.READY);
      const profile = await http()
        .get(`/api/v1/businesses/${businessId}`)
        .set(auth(token))
        .expect(200);
      expect(profile.body.data.setup).toMatchObject({
        total: 6,
        completed: 6,
        prerequisitesMet: true,
      });
    } finally {
      if (businessId)
        await prisma.business.deleteMany({ where: { id: businessId } });
      await prisma.region.delete({ where: { id: region.id } });
      await prisma.user.delete({ where: { id: superAdmin.id } });
    }
  });
});
