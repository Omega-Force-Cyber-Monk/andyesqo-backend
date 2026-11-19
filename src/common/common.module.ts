import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  FileMailTransport,
  InMemoryMailTransport,
  MailModule,
  SmtpTransport,
} from '@nestjs/mail';
import { OutboxModule, OutboxStorage } from '@nestjs/outbox';
import { fromPrisma, PostgresOutboxStore } from '@nestjs/outbox/postgres';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from './audit/audit.service.js';
import { MailDeliveryHandler } from './mail/mail-delivery.handler.js';
import { OutboxRetentionService } from './mail/outbox-retention.service.js';
import { MailService } from './mail/mail.service.js';
import { NotifyService } from './notify/notify.service.js';
import { AccessService } from './access/access.service.js';

export function mailOptions(config: ConfigService) {
  const environment = config.get<string>('NODE_ENV') ?? 'development';
  const smtpUrl = config.get<string>('SMTP_URL');
  const from = config.get<string>('MAIL_FROM');
  if (environment === 'production' && (!smtpUrl || !from)) {
    throw new Error('SMTP_URL and MAIL_FROM are required in production');
  }
  return {
    from: from ?? 'Andyesqo <no-reply@andyesqo.test>',
    transport: smtpUrl
      ? new SmtpTransport({
          url: smtpUrl,
          pool: true,
          ...(environment === 'production' && {
            startTls: 'required' as const,
          }),
        })
      : environment === 'test'
        ? new InMemoryMailTransport()
        : new FileMailTransport({
            directory: config.get<string>('MAIL_DIRECTORY') ?? 'var/mail',
            log: false,
          }),
  };
}

@Global()
@Module({
  imports: [
    MailModule.forRootAsync({
      inject: [ConfigService],
      useFactory: mailOptions,
    }),
    // Durable email: queued in PostgreSQL (schema nest_outbox, created by a
    // Prisma migration) and retried with backoff before dead-lettering.
    OutboxModule.forRoot({
      retry: {
        attempts: 12,
        backoff: { delay: '30s', factor: 2, maxDelay: '1h' },
      },
      relay: { pollInterval: '2s' },
    }),
  ],
  providers: [
    {
      provide: PostgresOutboxStore,
      inject: [PrismaService, OutboxStorage],
      useFactory: (prisma: PrismaService, storage: OutboxStorage) =>
        new PostgresOutboxStore(
          { executor: fromPrisma(prisma), migrate: false },
          storage,
        ),
    },
    AuditService,
    MailService,
    MailDeliveryHandler,
    OutboxRetentionService,
    NotifyService,
    AccessService,
  ],
  exports: [AuditService, MailService, NotifyService, AccessService],
})
export class CommonModule {}
