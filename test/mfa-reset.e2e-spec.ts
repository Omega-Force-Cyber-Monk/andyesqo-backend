/** Administrator-assisted authenticator reset and its races with MFA flows. */
import { INestApplication } from '@nestjs/common';
import { InMemoryMailTransport, MailTransport } from '@nestjs/mail';
import { App } from 'supertest/types.js';
import { UserRole } from './../src/generated/prisma/enums.js';
import { auth, createTestApp, Tenant, totp } from './support.js';

describe('Authenticator reset (e2e)', () => {
  let app: INestApplication<App>;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  /** Enrolls the user and returns their 2FA session and secret. */
  async function enroll(t: Tenant, user: { email: string }) {
    const token = await t.token(user);
    const setup = await t
      .http()
      .post('/api/v1/auth/mfa/setup')
      .set(auth(token))
      .send({ password: 'Password123' })
      .expect(200);
    const verified = await t
      .http()
      .post('/api/v1/auth/mfa/verify')
      .send({
        challenge: setup.body.data.challenge,
        code: totp(setup.body.data.secret),
      })
      .expect(200);
    return { session: verified.body.data, secret: setup.body.data.secret };
  }

  it('lets an administrator reset a lost authenticator and signs the user out', async () => {
    const t = await Tenant.create(app, 'Reset');
    const other = await Tenant.create(app, 'Other');
    try {
      const admin = await t.user(UserRole.BUSINESS_ADMIN);
      const admin2 = await t.user(UserRole.BUSINESS_ADMIN);
      const supervisor = await t.user(UserRole.SUPERVISOR);
      const driver = await t.user(UserRole.DRIVER);
      const stranger = await other.user(UserRole.DRIVER);
      const { session } = await enroll(t, driver);
      await t
        .http()
        .post('/api/v1/auth/mfa/recovery-codes')
        .set(auth(session.accessToken))
        .expect(200);
      const adminToken = await t.token(admin);
      const reason = { reason: 'Lost phone' };

      await t
        .http()
        .post(`/api/v1/users/${driver.id}/mfa/reset`)
        .set(auth(await t.token(supervisor)))
        .send(reason)
        .expect(403);
      await t
        .http()
        .post(`/api/v1/users/${admin.id}/mfa/reset`)
        .set(auth(adminToken))
        .send(reason)
        .expect(400);
      await t
        .http()
        .post(`/api/v1/users/${admin2.id}/mfa/reset`)
        .set(auth(adminToken))
        .send(reason)
        .expect(403);
      await t
        .http()
        .post(`/api/v1/users/${stranger.id}/mfa/reset`)
        .set(auth(adminToken))
        .send(reason)
        .expect(404);
      await t
        .http()
        .post(`/api/v1/users/${driver.id}/mfa/reset`)
        .set(auth(adminToken))
        .send({})
        .expect(400);

      await t
        .http()
        .post(`/api/v1/users/${driver.id}/mfa/reset`)
        .set(auth(adminToken))
        .send(reason)
        .expect(200);
      await t
        .http()
        .get('/api/v1/auth/me')
        .set(auth(session.accessToken))
        .expect(401);
      await t
        .http()
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: session.refreshToken })
        .expect(401);
      const state = await t.prisma.user.findUniqueOrThrow({
        where: { id: driver.id },
        include: { mfaTotp: true, mfaRecoveryCodes: true },
      });
      expect(state.twoFactorEnabled).toBe(false);
      expect(state.mfaTotp).toBeNull();
      expect(state.mfaRecoveryCodes).toHaveLength(0);
      expect(
        await t.prisma.auditLog.count({
          where: { targetId: driver.id, action: 'Authenticator Reset' },
        }),
      ).toBe(1);
      // The notification is queued in the PostgreSQL outbox and delivered.
      const mailbox = app.get(MailTransport) as InMemoryMailTransport;
      await vi.waitFor(
        () =>
          mailbox.assertSent({
            to: driver.email,
            subject: 'Your Andyesqo authenticator was reset',
          }),
        { timeout: 5000 },
      );
      // Password-only sign-in works again and the user can re-enroll.
      const login = await t
        .http()
        .post('/api/v1/auth/login')
        .send({ identifier: driver.email, password: 'Password123' })
        .expect(200);
      expect(login.body.data.accessToken).toBeDefined();

      // When the business requires 2FA the next login must enroll again.
      await t.prisma.business.update({
        where: { id: t.businessId },
        data: { twoFactorRequired: true },
      });
      const required = await t
        .http()
        .post('/api/v1/auth/login')
        .send({ identifier: driver.email, password: 'Password123' })
        .expect(200);
      expect(required.body.data.enrollmentRequired).toBe(true);
    } finally {
      await t.destroy();
      await other.destroy();
    }
  });

  it('rejects an enrollment challenge that was issued before a reset', async () => {
    const t = await Tenant.create(app, 'Stale');
    try {
      const admin = await t.user(UserRole.BUSINESS_ADMIN);
      const driver = await t.user(UserRole.DRIVER);
      const token = await t.token(driver);
      const setup = await t
        .http()
        .post('/api/v1/auth/mfa/setup')
        .set(auth(token))
        .send({ password: 'Password123' })
        .expect(200);
      await t
        .http()
        .post(`/api/v1/users/${driver.id}/mfa/reset`)
        .set(auth(await t.token(admin)))
        .send({ reason: 'Support request' })
        .expect(200);
      await t
        .http()
        .post('/api/v1/auth/mfa/verify')
        .send({
          challenge: setup.body.data.challenge,
          code: totp(setup.body.data.secret),
        })
        .expect(401);
      const row = await t.prisma.mfaTotp.findUnique({
        where: { userId: driver.id },
      });
      expect(row?.confirmed ?? false).toBe(false);
    } finally {
      await t.destroy();
    }
  });

  it('always ends with no usable authenticator when a reset races verification', async () => {
    const t = await Tenant.create(app, 'Race');
    try {
      const admin = await t.user(UserRole.BUSINESS_ADMIN);
      const adminToken = await t.token(admin);
      for (let i = 0; i < 6; i++) {
        const driver = await t.user(UserRole.DRIVER);
        const token = await t.token(driver);
        const setup = await t
          .http()
          .post('/api/v1/auth/mfa/setup')
          .set(auth(token))
          .send({ password: 'Password123' })
          .expect(200);
        const [verify] = await Promise.all([
          t
            .http()
            .post('/api/v1/auth/mfa/verify')
            .send({
              challenge: setup.body.data.challenge,
              code: totp(setup.body.data.secret),
            }),
          t
            .http()
            .post(`/api/v1/users/${driver.id}/mfa/reset`)
            .set(auth(adminToken))
            .send({ reason: 'Race' })
            .expect(200),
        ]);
        const row = await t.prisma.mfaTotp.findUnique({
          where: { userId: driver.id },
        });
        expect(row?.confirmed ?? false).toBe(false);
        if (verify.status === 200)
          await t
            .http()
            .get('/api/v1/auth/me')
            .set(auth(verify.body.data.accessToken))
            .expect(401);
      }
    } finally {
      await t.destroy();
    }
  });
});
