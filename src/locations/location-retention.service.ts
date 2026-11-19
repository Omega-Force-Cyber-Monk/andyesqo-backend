import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';

const BATCH = 5000;
/** Arbitrary constant key for the cluster-wide purge lock. */
const LOCK_KEY = 7_302_114;

/** Deletes driver GPS points older than LOCATION_RETENTION_DAYS. */
@Injectable()
export class LocationRetentionService {
  private readonly logger = new Logger(LocationRetentionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  cutoff(now = new Date()) {
    const days = this.config.get<number>('LOCATION_RETENTION_DAYS') ?? 90;
    return new Date(now.getTime() - days * 86_400_000);
  }

  /**
   * Runs daily. A transaction-scoped advisory lock ensures only one instance
   * purges at a time; deletion is batched to keep transactions short.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM, { name: 'location-retention' })
  async purge(now = new Date()): Promise<number> {
    const cutoff = this.cutoff(now);
    let total = 0;
    for (;;) {
      const deleted = await this.prisma.$transaction(async (tx) => {
        const [lock] = await tx.$queryRaw<{ locked: boolean }[]>`
          SELECT pg_try_advisory_xact_lock(${LOCK_KEY}) AS locked`;
        if (!lock?.locked) return -1;
        return tx.$executeRaw`
          DELETE FROM "DriverLocation" WHERE id IN (
            SELECT id FROM "DriverLocation" WHERE "recordedAt" < ${cutoff}
            LIMIT ${BATCH})`;
      });
      if (deleted < 0) {
        this.logger.log('Location purge already running on another instance');
        break;
      }
      total += deleted;
      if (deleted < BATCH) break;
    }
    if (total) this.logger.log(`Purged ${total} driver location points`);
    return total;
  }
}
