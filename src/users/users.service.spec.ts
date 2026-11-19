import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { UserRole } from '../generated/prisma/enums.js';
import { UsersService } from './users.service.js';

const admin = {
  id: 'admin',
  email: 'admin@example.com',
  role: UserRole.BUSINESS_ADMIN,
  businessId: 'tenant',
};

describe('user administration boundaries', () => {
  it('prevents a business admin promoting a user to super admin', async () => {
    const prisma = { user: { update: vi.fn() } };
    const service = new UsersService(
      prisma as never,
      {} as never,
      {} as never,
      { depotScope: vi.fn().mockResolvedValue(null) } as never,
      {} as never,
    );
    vi.spyOn(service, 'findOne').mockResolvedValue({
      id: 'user',
      businessId: 'tenant',
      role: UserRole.DRIVER,
    } as never);
    await expect(
      service.update(admin, 'user', { role: UserRole.SUPER_ADMIN }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('rejects a depot belonging to a different business', async () => {
    const prisma = {
      depot: { findFirst: vi.fn().mockResolvedValue(null) },
      user: { update: vi.fn() },
    };
    const service = new UsersService(
      prisma as never,
      {} as never,
      {} as never,
      { depotScope: vi.fn().mockResolvedValue(null) } as never,
      {} as never,
    );
    vi.spyOn(service, 'findOne').mockResolvedValue({
      id: 'user',
      businessId: 'tenant',
      role: UserRole.DRIVER,
    } as never);
    await expect(
      service.update(admin, 'user', { depotId: 'other-depot' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.depot.findFirst).toHaveBeenCalledWith({
      where: { id: 'other-depot', businessId: 'tenant' },
      select: { id: true },
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
