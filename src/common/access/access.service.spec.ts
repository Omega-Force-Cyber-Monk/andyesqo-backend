import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PermissionModule, UserRole } from '../../generated/prisma/enums.js';
import { AccessService } from './access.service.js';

const actor = {
  id: 'user',
  email: 'a@example.com',
  businessId: 'business',
  role: UserRole.SUPERVISOR,
};

describe('access policy', () => {
  it('honours a temporary deny over a role grant', async () => {
    const prisma = {
      userPermissionOverride: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ canView: false, canEdit: false }),
      },
      rolePermission: {
        findFirst: vi.fn().mockResolvedValue({ canView: true, canEdit: true }),
      },
    };
    const service = new AccessService(prisma as never);
    await expect(
      service.assertPermission(actor, PermissionModule.LIVE_MAP, 'view'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.rolePermission.findFirst).not.toHaveBeenCalled();
  });

  it('requires edit access for writes and fails closed on missing roles', async () => {
    const prisma = {
      userPermissionOverride: { findFirst: vi.fn().mockResolvedValue(null) },
      rolePermission: {
        findFirst: vi.fn().mockResolvedValue({ canView: true, canEdit: false }),
      },
    };
    const service = new AccessService(prisma as never);
    await expect(
      service.assertPermission(actor, PermissionModule.LIVE_MAP, 'view'),
    ).resolves.toBeUndefined();
    await expect(
      service.assertPermission(actor, PermissionModule.LIVE_MAP, 'edit'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    prisma.rolePermission.findFirst.mockResolvedValue(null);
    await expect(
      service.assertPermission(actor, PermissionModule.LIVE_MAP, 'view'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
