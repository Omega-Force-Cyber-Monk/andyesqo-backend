import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OutboxDeadLetters, OutboxInbox } from '@nestjs/outbox';

/**
 * The outbox keeps inbox records and dead letters until deleted. Dead letters
 * (mail that failed every retry) are kept 14 days for inspection or requeue;
 * inbox records 30 days, longer than any redelivery can take.
 */
@Injectable()
export class OutboxRetentionService {
  constructor(
    private readonly inbox: OutboxInbox,
    private readonly deadLetters: OutboxDeadLetters,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM, { name: 'outbox-retention' })
  async prune() {
    await this.deadLetters.purge({
      failedBefore: new Date(Date.now() - 14 * 86_400_000),
    });
    await this.inbox.prune('30d');
  }
}
