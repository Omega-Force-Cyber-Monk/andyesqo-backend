import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { UserRole, UserStatus } from '../../generated/prisma/enums.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';

describe('JwtAuthGuard', () => {
  function setup(user: object | null) {
    const request = {
      headers: { authorization: 'Bearer valid' },
      user: undefined,
    };
    const context = {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    const jwt = {
      verifyAsync: vi.fn().mockResolvedValue({
        sub: 'u1',
        role: UserRole.SUPERVISOR,
        credentialVersion: 0,
      }),
    };
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue(false) };
    const prisma = { user: { findUnique: vi.fn().mockResolvedValue(user) } };
    const guard = new JwtAuthGuard(
      jwt as never,
      reflector as never,
      prisma as never,
    );
    return { guard, context, request };
  }

  it('uses the current database role rather than the stale token role', async () => {
    const { guard, context, request } = setup({
      id: 'u1',
      email: 'a@example.com',
      role: UserRole.DRIVER,
      businessId: 'b1',
      status: UserStatus.ACTIVE,
      credentialVersion: 0,
    });
    expect(await guard.canActivate(context)).toBe(true);
    expect(request.user).toMatchObject({ role: UserRole.DRIVER });
  });

  it('rejects tokens issued before a password change', async () => {
    const { guard, context } = setup({
      id: 'u1',
      status: UserStatus.ACTIVE,
      credentialVersion: 1,
    });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects password-only tokens for an enrolled authenticator or required business policy', async () => {
    for (const security of [
      { mfaTotp: { confirmed: true } },
      { business: { twoFactorRequired: true } },
    ]) {
      const { guard, context } = setup({
        id: 'u1',
        status: UserStatus.ACTIVE,
        credentialVersion: 0,
        ...security,
      });
      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    }
  });

  it('rejects inactive and deleted users', async () => {
    for (const user of [null, { status: UserStatus.INACTIVE }]) {
      const { guard, context } = setup(user);
      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    }
  });
});
