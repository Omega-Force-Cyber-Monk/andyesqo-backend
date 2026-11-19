import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '../generated/prisma/client.js';
import { TokenType } from '../generated/prisma/enums.js';
import { MailService } from '../common/mail/mail.service.js';
import { randomToken, sha256 } from '../common/utils/crypto.js';
import { PrismaService } from '../prisma/prisma.service.js';

const DAY = 24 * 60 * 60 * 1000;

/** Invitation (7-day) and password reset (1-hour) one-time tokens. */
@Injectable()
export class UserTokensService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  private get isProd() {
    return this.config.get('NODE_ENV') === 'production';
  }

  private async issue(
    tx: Prisma.TransactionClient,
    userId: string,
    type: TokenType,
    ttlMs: number,
  ) {
    // Invalidate older unused tokens of the same type.
    await tx.userToken.updateMany({
      where: { userId, type, usedAt: null },
      data: { usedAt: new Date() },
    });
    const token = randomToken(32);
    await tx.userToken.create({
      data: {
        userId,
        type,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + ttlMs),
      },
    });
    return token;
  }

  /** Sends the "set up your account" link. Returns the raw token outside production (for testing). */
  async sendInvitation(user: { id: string; email: string; firstName: string }) {
    // The token and its email commit together: no email for a rolled-back
    // token, and no live token whose email was never queued.
    const token = await this.prisma.$transaction(async (tx) => {
      const token = await this.issue(
        tx,
        user.id,
        TokenType.INVITATION,
        7 * DAY,
      );
      const link = `${this.config.get('APP_URL')}/activate-account?token=${token}`;
      await this.mail.send(
        user.email,
        'You are invited to Andyesqo',
        `Hi ${user.firstName},\nSet your password to activate your account (link valid for 7 days):\n${link}`,
        tx,
      );
      return token;
    });
    this.mail.flush();
    return this.isProd ? { sent: true } : { sent: true, devToken: token };
  }

  async sendPasswordReset(user: {
    id: string;
    email: string;
    firstName: string;
  }) {
    const token = await this.prisma.$transaction(async (tx) => {
      const token = await this.issue(
        tx,
        user.id,
        TokenType.PASSWORD_RESET,
        60 * 60 * 1000,
      );
      const link = `${this.config.get('APP_URL')}/reset-password?token=${token}`;
      await this.mail.send(
        user.email,
        'Reset your Andyesqo password',
        `Hi ${user.firstName},\nReset your password with this link (valid for 1 hour):\n${link}`,
        tx,
      );
      return token;
    });
    this.mail.flush();
    return this.isProd ? undefined : token;
  }

  /** Validates and marks a token as used. Returns the user id. */
  async consume(token: string, type: TokenType): Promise<string> {
    const record = await this.prisma.userToken.findUnique({
      where: { tokenHash: sha256(token) },
    });
    if (
      !record ||
      record.type !== type ||
      record.usedAt ||
      record.expiresAt < new Date()
    ) {
      throw new BadRequestException('This link is invalid or has expired');
    }
    const consumed = await this.prisma.userToken.updateMany({
      where: { id: record.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (consumed.count !== 1) {
      throw new BadRequestException('This link is invalid or has expired');
    }
    return record.userId;
  }
}
