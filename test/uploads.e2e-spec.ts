/** Private uploads: content sniffing, tenant isolation and signed links. */
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types.js';
import { UserRole } from './../src/generated/prisma/enums.js';
import { auth, createTestApp, Tenant } from './support.js';

const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4c00000000049454e44ae426082',
  'hex',
);

describe('Uploads (e2e)', () => {
  let app: INestApplication<App>;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('stores files privately and serves them only to authorised users', async () => {
    const t = await Tenant.create(app, 'Uploads');
    const other = await Tenant.create(app, 'Other');
    try {
      const driver = await t.user(UserRole.DRIVER);
      const driver2 = await t.user(UserRole.DRIVER);
      const fleet = await t.user(UserRole.FLEET_MANAGER);
      const stranger = await other.user(UserRole.BUSINESS_ADMIN);
      const token = await t.token(driver);

      // An HTML payload labelled as a PNG is refused.
      await t
        .http()
        .post('/api/v1/uploads')
        .set(auth(token))
        .attach('files', Buffer.from('<html><script>alert(1)</script>'), {
          filename: 'photo.png',
          contentType: 'image/png',
        })
        .expect(400);
      const res = await t
        .http()
        .post('/api/v1/uploads')
        .set(auth(token))
        .attach('files', PNG, {
          filename: 'dent.html',
          contentType: 'text/html',
        })
        .expect(201);
      const [file] = res.body.data;
      expect(file.mimetype).toBe('image/png');
      expect(file.url).toBe(`/api/v1/uploads/${file.id}`);
      const stored = await t.prisma.upload.findUniqueOrThrow({
        where: { id: file.id },
      });
      expect(stored.storageKey.endsWith('.png')).toBe(true);

      // Not reachable as a public static file.
      await t.http().get(`/uploads/${stored.storageKey}`).expect(404);
      await t.http().get(file.url).expect(401);

      const own = await t.http().get(file.url).set(auth(token)).expect(200);
      expect(own.headers['content-type']).toBe('image/png');
      expect(own.headers['x-content-type-options']).toBe('nosniff');
      expect(Buffer.compare(own.body as Buffer, PNG)).toBe(0);
      await t
        .http()
        .get(file.url)
        .set(auth(await t.token(fleet)))
        .expect(200);
      await t
        .http()
        .get(file.url)
        .set(auth(await t.token(driver2)))
        .expect(404);
      await t
        .http()
        .get(file.url)
        .set(auth(await other.token(stranger)))
        .expect(404);

      const link = await t
        .http()
        .get(`${file.url}/link`)
        .set(auth(token))
        .expect(200);
      await t.http().get(link.body.data.url).expect(200);
      await t
        .http()
        .get(link.body.data.url.replace(/signature=./, 'signature=A'))
        .expect(404);
      const expired = link.body.data.url.replace(/expires=\d+/, 'expires=1000');
      await t.http().get(expired).expect(404);

      // Photo fields only accept stored-upload URLs.
      const vehicle = await t.vehicle(null, { assignedDriverId: driver.id });
      await t.grant(UserRole.DRIVER, { INSPECTIONS: 'edit', VEHICLES: 'view' });
      const rejected = await t
        .http()
        .post('/api/v1/damage-reports')
        .set(auth(token))
        .send({
          vehicleId: vehicle.id,
          severity: 'MINOR',
          description: 'Scratch',
          locations: ['FRONT'],
          photos: ['https://evil.example/x.png'],
        })
        .expect(400);
      expect(JSON.stringify(rejected.body.message)).toContain('photos');
      await t
        .http()
        .post('/api/v1/damage-reports')
        .set(auth(token))
        .send({
          vehicleId: vehicle.id,
          severity: 'MINOR',
          description: 'Scratch',
          locations: ['FRONT'],
          photos: [file.url],
        })
        .expect(201);
    } finally {
      await t.destroy();
      await other.destroy();
    }
  });
});
