import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service.js';

/** A reset that lands between authenticator confirmation and session issue. */
function setup(resetAt: Date | null) {
  const challenge = {
    id: 'c1',
    userId: 'u1',
    usedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    credentialVersion: 3,
    remember: false,
    user: {
      id: 'u1',
      status: 'ACTIVE',
      credentialVersion: 3,
      twoFactorEnabled: false,
    },
  };
  const prisma = {
    mfaChallenge: {
      findUnique: vi.fn().mockResolvedValue(challenge),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    mfaTotp: {
      findUnique: vi
        .fn()
        .mockResolvedValue({ secret: 'v1.secret', pendingSecret: null }),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    // The reset already bumped the credential version.
    user: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      findUnique: vi.fn().mockResolvedValue({ mfaResetAt: resetAt }),
    },
  };
  const mfa = {
    isEnrolled: vi.fn().mockResolvedValue(false),
    confirm: vi.fn().mockResolvedValue(true),
  };
  const service = new AuthService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    mfa as never,
  );
  return { service, prisma };
}

describe('MFA verification racing an administrator reset', () => {
  it('removes the authenticator a stale enrollment confirmed', async () => {
    const { service, prisma } = setup(new Date(Date.now() + 1000));
    await expect(
      service.mfaVerify('challenge', '123456', undefined, {}),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.mfaTotp.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u1', secret: 'v1.secret', pendingSecret: null },
    });
  });

  it('keeps the authenticator when the session was invalidated by something else', async () => {
    const { service, prisma } = setup(null);
    await expect(
      service.mfaVerify('challenge', '123456', undefined, {}),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.mfaTotp.deleteMany).not.toHaveBeenCalled();
  });
});
