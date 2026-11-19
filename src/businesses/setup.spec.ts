import { describe, expect, it, vi } from 'vitest';
import { BusinessStatus, UserStatus } from '../generated/prisma/enums.js';
import { businessSetup, refreshBusinessSetup } from './setup.js';

const complete = {
  status: BusinessStatus.INCOMPLETE,
  users: [{ status: UserStatus.PENDING_INVITE }],
  regions: [{}],
  settingsConfigured: true,
  permissionsVerified: true,
};

describe('business setup checklist', () => {
  it('derives all six steps from their current inputs', () => {
    expect(businessSetup(complete)).toMatchObject({
      total: 6,
      completed: 6,
      percent: 100,
    });
    const incomplete = businessSetup({
      ...complete,
      users: [{ status: UserStatus.INACTIVE }],
    });
    expect(incomplete.steps[1]).toMatchObject({
      done: false,
      status: 'Not assigned',
    });
    expect(incomplete.steps[5].done).toBe(false);
  });

  it('ignores region assignments switched to INACTIVE', () => {
    const setup = businessSetup({
      ...complete,
      regions: [{ status: 'INACTIVE' as never }],
    });
    expect(setup.steps[2].done).toBe(false);
    expect(setup.prerequisitesMet).toBe(false);
  });

  it('does not count stale READY status when prerequisites are removed', () => {
    expect(
      businessSetup({ ...complete, status: BusinessStatus.READY, regions: [] })
        .steps[5].done,
    ).toBe(false);
  });

  it('refreshes status after prerequisites change and preserves archived businesses', async () => {
    const prisma = {
      $queryRaw: vi.fn(),
      $transaction: vi.fn(),
      user: { findMany: vi.fn().mockResolvedValue([{ id: 'root' }]) },
      notification: { createMany: vi.fn() },
      business: {
        findUnique: vi.fn().mockResolvedValue(complete),
        updateMany: vi.fn(),
      },
    };
    prisma.$transaction.mockImplementation(
      async (callback: (tx: unknown) => unknown) => callback(prisma),
    );
    await refreshBusinessSetup(prisma as never, 'business');
    expect(prisma.business.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: BusinessStatus.READY } }),
    );
    prisma.business.updateMany.mockClear();
    prisma.business.findUnique.mockResolvedValue({
      ...complete,
      status: BusinessStatus.INACTIVE,
    });
    await refreshBusinessSetup(prisma as never, 'business');
    expect(prisma.business.updateMany).not.toHaveBeenCalled();
    // A business deleted concurrently is skipped rather than failing.
    prisma.business.findUnique.mockResolvedValue(null);
    await expect(
      refreshBusinessSetup(prisma as never, 'gone'),
    ).resolves.toBeUndefined();
  });
});
