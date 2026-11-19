import { ConfigService } from '@nestjs/config';
import { InMemoryMailTransport, MailModule } from '@nestjs/mail';
import { OutboxModule } from '@nestjs/outbox';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../../prisma/prisma.service.js';
import { mailOptions } from '../common.module.js';
import { MailDeliveryHandler } from './mail-delivery.handler.js';
import { MailService } from './mail.service.js';

async function harness(mailbox: InMemoryMailTransport) {
  const module = await Test.createTestingModule({
    imports: [
      MailModule.forRoot({
        transport: mailbox,
        from: 'sender@example.com',
        retry: false,
      }),
      OutboxModule.forRoot({
        retry: { attempts: 3, backoff: { delay: 10, factor: 1 } },
        relay: { pollInterval: 10 },
      }),
    ],
    providers: [
      MailService,
      MailDeliveryHandler,
      {
        provide: PrismaService,
        useValue: {
          $transaction: (work: (tx: unknown) => unknown) => work({}),
        },
      },
    ],
  }).compile();
  await module.init();
  return module;
}

describe('mail delivery', () => {
  it('rejects missing production mail configuration', () => {
    expect(() =>
      mailOptions(new ConfigService({ NODE_ENV: 'production' })),
    ).toThrow('SMTP_URL and MAIL_FROM');
  });

  it('queues the message and delivers it through the outbox relay', async () => {
    const mailbox = new InMemoryMailTransport();
    const module = await harness(mailbox);
    await module
      .get(MailService)
      .send(
        'recipient@example.com',
        'Reset password',
        'Reset link: https://example.com/reset?token=secret',
      );
    await vi.waitFor(() => mailbox.assertSent({ to: 'recipient@example.com' }));
    const sent = mailbox.assertSent({ to: 'recipient@example.com' });
    expect(sent.subject).toBe('Reset password');
    expect(sent.text).toContain('token=secret');
    await module.close();
  });

  it('retries delivery after a transport failure', async () => {
    const mailbox = new InMemoryMailTransport();
    const original = mailbox.send.bind(mailbox);
    let calls = 0;
    vi.spyOn(mailbox, 'send').mockImplementation(async (...args) => {
      calls++;
      if (calls === 1) throw new Error('SMTP unavailable');
      return original(...args);
    });
    const module = await harness(mailbox);
    await module.get(MailService).send('r@example.com', 'Hello', 'Body');
    await vi.waitFor(() => mailbox.assertSent({ to: 'r@example.com' }), {
      timeout: 3000,
    });
    expect(calls).toBe(2);
    await module.close();
  });
});
