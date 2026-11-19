import { describe, expect, it, vi } from 'vitest';
import { UserRole } from '../generated/prisma/enums.js';
import { SettingsService } from './settings.service.js';

describe('business security settings', () => {
  it('refreshes business readiness after settings are saved', async () => {
    const business = {
      id: 'business',
      status: 'INCOMPLETE',
      settingsConfigured: true,
      permissionsVerified: true,
      regions: [{}],
      users: [{ status: 'ACTIVE' }],
    };
    const prisma = {
      $queryRaw: vi.fn(),
      $transaction: vi.fn(),
      user: { findMany: vi.fn().mockResolvedValue([{ id: 'root' }]) },
      notification: { createMany: vi.fn() },
      business: {
        update: vi.fn(),
        findUnique: vi.fn().mockResolvedValue(business),
        findUniqueOrThrow: vi.fn().mockResolvedValue(business),
        updateMany: vi.fn(),
      },
    };
    prisma.$transaction.mockImplementation(
      async (callback: (tx: unknown) => unknown) => callback(prisma),
    );
    const service = new SettingsService(
      prisma as never,
      { log: vi.fn() } as never,
    );
    await service.update(
      {
        id: 'admin',
        email: 'a@example.com',
        role: UserRole.BUSINESS_ADMIN,
        businessId: 'business',
      },
      { twoFactorRequired: true },
    );
    expect(prisma.business.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ twoFactorRequired: true }),
      }),
    );
    expect(prisma.business.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'READY' } }),
    );
  });

  it('reserves the two-factor policy for administrators', async () => {
    const prisma = {
      business: {
        findUnique: vi.fn().mockResolvedValue({ id: 'business' }),
        update: vi.fn(),
      },
    };
    const service = new SettingsService(
      prisma as never,
      { log: vi.fn() } as never,
    );
    await expect(
      service.update(
        {
          id: 'supervisor',
          email: 's@example.com',
          role: UserRole.SUPERVISOR,
          businessId: 'business',
        },
        { twoFactorRequired: false },
      ),
    ).rejects.toThrow('Only administrators');
    expect(prisma.business.update).not.toHaveBeenCalled();
  });
});
