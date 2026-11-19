import { Injectable } from '@nestjs/common';
import { Mailer } from '@nestjs/mail';
import { OnOutboxMessage } from '@nestjs/outbox';
import { MAIL_TOPIC, type MailPayload } from './mail.service.js';

/** Relay consumer that hands queued messages to the configured mail transport. */
@Injectable()
export class MailDeliveryHandler {
  constructor(private readonly mailer: Mailer) {}

  @OnOutboxMessage(MAIL_TOPIC, { consumer: 'mail-delivery' })
  async deliver(payload: MailPayload) {
    await this.mailer.send({
      to: payload.to,
      subject: payload.subject,
      text: payload.text,
    });
  }
}
