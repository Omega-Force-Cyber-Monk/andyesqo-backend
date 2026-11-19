/** "Today" follows the business time zone, not UTC. */
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types.js';
import { localDate } from './../src/common/utils/tenant.js';
import { UserRole } from './../src/generated/prisma/enums.js';
import { auth, createTestApp, Tenant } from './support.js';

describe('Business time zone (e2e)', () => {
  let app: INestApplication<App>;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it("shows the driver's shift for the local date even when UTC is on another day", async () => {
    // One of these zones is always on a different calendar date from UTC.
    const tz =
      new Date().getUTCHours() >= 11
        ? 'Pacific/Kiritimati'
        : 'Pacific/Pago_Pago';
    const local = localDate(new Date(), tz);
    expect(local.getTime()).not.toBe(localDate(new Date(), 'UTC').getTime());
    const t = await Tenant.create(app, 'Zone');
    try {
      await t.prisma.business.update({
        where: { id: t.businessId },
        data: { timezone: tz },
      });
      const driver = await t.user(UserRole.DRIVER);
      const shift = await t.prisma.shift.create({
        data: {
          businessId: t.businessId,
          date: local,
          startTime: '06:00',
          endTime: '14:00',
          driverId: driver.id,
          status: 'PUBLISHED',
        },
      });
      const home = await t
        .http()
        .get('/api/v1/roster/me/today')
        .set(auth(await t.token(driver)))
        .expect(200);
      expect(home.body.data.shift?.id).toBe(shift.id);
    } finally {
      await t.destroy();
    }
  });
});
