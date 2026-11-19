/** Scheduled driver alerts: shift starting soon and pre-shift inspection. */
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types.js';
import { UserRole } from './../src/generated/prisma/enums.js';
import { ShiftRemindersService } from './../src/roster/shift-reminders.service.js';
import { createTestApp, Tenant } from './support.js';

describe('Shift reminders (e2e)', () => {
  let app: INestApplication<App>;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('sends each reminder once, in the business time zone', async () => {
    const t = await Tenant.create(app, 'Reminders');
    try {
      await t.prisma.business.update({
        where: { id: t.businessId },
        data: { timezone: 'Australia/Perth' },
      });
      const driver = await t.user(UserRole.DRIVER);
      const assistant = await t.user(UserRole.ASSISTANT);
      const vehicle = await t.vehicle(null);
      // 08:00 Perth (UTC+8) on 15 Jul 2026 is 00:00 UTC.
      const shift = await t.prisma.shift.create({
        data: {
          businessId: t.businessId,
          date: new Date('2026-07-15T00:00:00Z'),
          startTime: '08:00',
          endTime: '16:00',
          driverId: driver.id,
          assistantId: assistant.id,
          vehicleId: vehicle.id,
          status: 'PUBLISHED',
        },
      });
      const reminders = app.get(ShiftRemindersService);
      const titles = async (userId: string) =>
        (
          await t.prisma.notification.findMany({
            where: { userId },
            orderBy: { createdAt: 'asc' },
          })
        ).map((n) => n.title);

      // 90 minutes before: nothing yet.
      await reminders.run(new Date('2026-07-14T22:30:00Z'));
      expect(await titles(driver.id)).toEqual([]);
      // 50 minutes before: inspection reminder only, to the driver.
      await reminders.run(new Date('2026-07-14T23:10:00Z'));
      expect(await titles(driver.id)).toEqual([
        'Complete Pre-Shift Inspection',
      ]);
      expect(await titles(assistant.id)).toEqual([]);
      // 20 minutes before, run concurrently: start reminder exactly once each.
      await Promise.all([
        reminders.run(new Date('2026-07-14T23:40:00Z')),
        reminders.run(new Date('2026-07-14T23:40:00Z')),
      ]);
      expect(await titles(driver.id)).toEqual([
        'Complete Pre-Shift Inspection',
        'Shift Starting Soon',
      ]);
      expect(await titles(assistant.id)).toEqual(['Shift Starting Soon']);
      const claimed = await t.prisma.shift.findUniqueOrThrow({
        where: { id: shift.id },
      });
      expect(claimed.startReminderAt).not.toBeNull();
    } finally {
      await t.destroy();
    }
  });
});
