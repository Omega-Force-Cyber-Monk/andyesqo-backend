import { Injectable } from '@nestjs/common';
import type { MfaStore, TotpRecord } from '@nestjs/authentication';
import { PrismaService } from '../prisma/prisma.service.js';

/** PostgreSQL implementation of Nest authentication's atomic MFA store contract. */
@Injectable()
export class PrismaMfaStore implements MfaStore {
  constructor(private readonly prisma: PrismaService) {}

  async getTotp(userId: string): Promise<TotpRecord | undefined> {
    const row = await this.prisma.mfaTotp.findUnique({ where: { userId } });
    if (!row) return undefined;
    return {
      secret: row.secret,
      confirmed: row.confirmed,
      ...(row.pendingSecret !== null && { pendingSecret: row.pendingSecret }),
      ...(row.lastUsedStep !== null && {
        lastUsedStep: Number(row.lastUsedStep),
      }),
    };
  }

  async saveTotp(userId: string, record: TotpRecord | null): Promise<void> {
    if (!record) {
      await this.prisma.mfaTotp.deleteMany({ where: { userId } });
      return;
    }
    const step =
      record.lastUsedStep === undefined ? null : BigInt(record.lastUsedStep);
    await this.prisma.$executeRaw`
      INSERT INTO "MfaTotp" ("userId", "secret", "confirmed", "pendingSecret", "lastUsedStep")
      VALUES (${userId}, ${record.secret}, ${record.confirmed}, ${record.pendingSecret ?? null}, ${step})
      ON CONFLICT ("userId") DO UPDATE SET "secret" = EXCLUDED."secret", "confirmed" = EXCLUDED."confirmed",
      "pendingSecret" = EXCLUDED."pendingSecret", "lastUsedStep" = GREATEST("MfaTotp"."lastUsedStep", EXCLUDED."lastUsedStep")
      WHERE NOT ("MfaTotp"."confirmed" AND NOT EXCLUDED."confirmed")`;
  }

  async claimTotpStep(userId: string, step: number): Promise<boolean> {
    const result = await this.prisma.mfaTotp.updateMany({
      where: {
        userId,
        OR: [{ lastUsedStep: null }, { lastUsedStep: { lt: BigInt(step) } }],
      },
      data: { lastUsedStep: BigInt(step) },
    });
    return result.count === 1;
  }

  async saveRecoveryCodes(userId: string, hashes: string[]): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
      await tx.mfaRecoveryCode.deleteMany({ where: { userId } });
      if (hashes.length)
        await tx.mfaRecoveryCode.createMany({
          data: hashes.map((hash) => ({ userId, hash })),
        });
    });
  }

  async consumeRecoveryCode(userId: string, hash: string): Promise<boolean> {
    return (
      (
        await this.prisma.mfaRecoveryCode.deleteMany({
          where: { userId, hash },
        })
      ).count === 1
    );
  }

  countRecoveryCodes(userId: string): Promise<number> {
    return this.prisma.mfaRecoveryCode.count({ where: { userId } });
  }

  async recordMfaFailure(
    userId: string,
    windowMs: number,
    now: number,
  ): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
      await tx.mfaAttempt.deleteMany({
        where: { userId, at: { lte: new Date(now - windowMs) } },
      });
      await tx.mfaAttempt.create({ data: { userId, at: new Date(now) } });
      return tx.mfaAttempt.count({
        where: { userId, at: { gt: new Date(now - windowMs) } },
      });
    });
  }

  countMfaFailures(
    userId: string,
    windowMs: number,
    now: number,
  ): Promise<number> {
    return this.prisma.mfaAttempt.count({
      where: { userId, at: { gt: new Date(now - windowMs) } },
    });
  }

  async clearMfaFailures(userId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
      await tx.mfaAttempt.deleteMany({ where: { userId } });
    });
  }
}
