/** Brute-force protection on authentication endpoints. */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { createTestApp } from './support.js';

describe('Auth rate limiting (e2e)', () => {
  let app: INestApplication<App>;
  const previous = process.env.AUTH_RATE_LIMIT;
  beforeAll(async () => {
    process.env.AUTH_RATE_LIMIT = '3';
    app = await createTestApp();
  });
  afterAll(async () => {
    process.env.AUTH_RATE_LIMIT = previous;
    await app.close();
  });

  it('limits repeated sign-in attempts per client', async () => {
    const attempt = () =>
      request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ identifier: 'nobody@example.com', password: 'wrong-password' });
    for (let i = 0; i < 3; i++) await attempt().expect(401);
    const blocked = await attempt().expect(429);
    expect(blocked.body.success).toBe(false);
    // Other endpoints keep their own budget; the API outside auth is unaffected.
    await request(app.getHttpServer())
      .post('/api/v1/auth/forgot-password')
      .send({ identifier: 'nobody@example.com' })
      .expect(200);
    await request(app.getHttpServer()).get('/health').expect(200);
  });
});
