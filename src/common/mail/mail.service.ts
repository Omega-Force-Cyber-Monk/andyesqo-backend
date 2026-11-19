import { Injectable } from '@nestjs/common';
import { Outbox } from '@nestjs/outbox';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

export const MAIL_TOPIC = 'mail.send';
export interface MailPayload {
  to: string;
  subject: string;
  text: string;
}

/**
 * Queues email in the PostgreSQL transactional outbox. Messages are written in
 * the caller's transaction when one is given (so a token and its email commit
 * together), then delivered by MailDeliveryHandler with retries and a
 * dead-letter table. SMTP failures never fail the request.
 */
@Injectable()
export class MailService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: Outbox<Prisma.TransactionClient>,
  ) {}

  async send(
    to: string,
    subject: string,
    text: string,
    tx?: Prisma.TransactionClient,
  ) {
    const message = {
      topic: MAIL_TOPIC,
      // Messages to one recipient are delivered in order.
      key: to.toLowerCase(),
      payload: { to, subject, text } satisfies MailPayload,
    };
    if (tx) {
      await this.outbox.add(tx, message);
      return;
    }
    await this.prisma.$transaction(async (t) => {
      await this.outbox.add(t, message);
    });
    this.outbox.notify();
  }

  /** Wake the relay after a caller-managed transaction commits. */
  flush() {
    this.outbox.notify();
  }
}
