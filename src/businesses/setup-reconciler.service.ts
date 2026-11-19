import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BusinessStatus } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { refreshBusinessSetup } from './setup.js';

const LOCK_KEY = 7_302_115;

/**
 * Failure recovery for the setup checklist. Every mutation refreshes the
 * derived status after it commits; if that refresh is lost (error, crash or
 * deploy in between), this hourly pass recomputes every business in setup.
 */
@Injectable()
export class SetupReconcilerService {
  private readonly logger = new Logger(SetupReconcilerService.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_HOUR, { name: 'business-setup-reconcile' })
  async reconcile(): Promise<number> {
    // Session-free coordination: a transaction-scoped try-lock held for the run.
    return this.prisma.$transaction(
      async (tx) => {
        const [lock] = await tx.$queryRaw<{ locked: boolean }[]>`
          SELECT pg_try_advisory_xact_lock(${LOCK_KEY}) AS locked`;
        if (!lock?.locked) return 0;
        const pending = await tx.business.findMany({
          where: {
            status: {
              in: [
                BusinessStatus.PENDING_SETUP,
                BusinessStatus.INCOMPLETE,
                BusinessStatus.READY,
              ],
            },
          },
          select: { id: true, status: true },
        });
        let changed = 0;
        for (const b of pending) {
          // One failing business must not stop the repair of the others.
          try {
            await refreshBusinessSetup(this.prisma, b.id);
          } catch (error) {
            this.logger.error(`Setup refresh failed for ${b.id}`, error);
            continue;
          }
          const after = await this.prisma.business.findUnique({
            where: { id: b.id },
            select: { status: true },
          });
          if (after && after.status !== b.status) changed++;
        }
        if (changed)
          this.logger.warn(`Repaired setup status of ${changed} business(es)`);
        return changed;
      },
      { timeout: 10 * 60_000 },
    );
  }
}
