import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  InspectionType,
  NotificationType,
  ShiftStatus,
} from '../generated/prisma/enums.js';
import { NotifyService } from '../common/notify/notify.service.js';
import { zonedDateTime } from '../common/utils/timezone.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** "Shift Starting Soon" is sent this long before the shift starts. */
export const START_REMINDER_MS = 30 * 60_000;
/** The pre-shift inspection reminder is sent this long before the start. */
export const INSPECTION_REMINDER_MS = 60 * 60_000;
const DAY = 86_400_000;

const time12 = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

/**
 * Sends the driver-app alerts shown in the design: "Shift Starting Soon" and
 * "Complete Pre-Shift Inspection". Shift times are interpreted in the
 * business time zone. Each reminder is claimed with a conditional update, so
 * it is sent once even with several instances running.
 */
@Injectable()
export class ShiftRemindersService {
  private readonly logger = new Logger(ShiftRemindersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notify: NotifyService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES, { name: 'shift-reminders' })
  async run(now = new Date()): Promise<{ start: number; inspection: number }> {
    const today = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
    );
    // Local dates differ from UTC by at most a day either way.
    const shifts = await this.prisma.shift.findMany({
      where: {
        status: ShiftStatus.PUBLISHED,
        date: { gte: new Date(today - DAY), lte: new Date(today + DAY) },
        OR: [{ startReminderAt: null }, { inspectionReminderAt: null }],
      },
      include: {
        business: { select: { timezone: true } },
        depot: { select: { name: true } },
        inspections: {
          where: { type: InspectionType.PRE_SHIFT },
          select: { id: true },
        },
      },
    });
    let start = 0,
      inspection = 0;
    for (const s of shifts) {
      const startsAt = zonedDateTime(s.date, s.startTime, s.business.timezone);
      const until = startsAt.getTime() - now.getTime();
      if (until <= 0) continue;
      if (
        !s.startReminderAt &&
        until <= START_REMINDER_MS &&
        (await this.claim(s.id, 'startReminderAt', now))
      ) {
        const minutes = Math.max(1, Math.round(until / 60_000));
        for (const userId of [s.driverId, s.assistantId])
          if (userId)
            await this.notify.toUser(
              userId,
              NotificationType.SHIFT,
              'Shift Starting Soon',
              `Your shift starts in ${minutes} minutes.${s.depot ? ` Please head to ${s.depot.name}.` : ' Please head to the depot.'}`,
              { shiftId: s.id, startsAt: startsAt.toISOString() },
            );
        start++;
      }
      if (
        !s.inspectionReminderAt &&
        s.driverId &&
        s.vehicleId &&
        s.inspections.length === 0 &&
        until <= INSPECTION_REMINDER_MS &&
        (await this.claim(s.id, 'inspectionReminderAt', now))
      ) {
        await this.notify.toUser(
          s.driverId,
          NotificationType.INSPECTION,
          'Complete Pre-Shift Inspection',
          `Complete your pre-shift vehicle inspection before ${time12(s.startTime)}.`,
          { shiftId: s.id, vehicleId: s.vehicleId },
        );
        inspection++;
      }
    }
    if (start || inspection)
      this.logger.log(
        `Sent ${start} shift and ${inspection} inspection reminder(s)`,
      );
    return { start, inspection };
  }

  private async claim(
    id: string,
    field: 'startReminderAt' | 'inspectionReminderAt',
    now: Date,
  ) {
    const res = await this.prisma.shift.updateMany({
      where: { id, [field]: null },
      data: { [field]: now },
    });
    return res.count === 1;
  }
}
