import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../../generated/prisma/enums.js';
import { RolesGuard } from './roles.guard.js';

const ctx = (role?: UserRole) =>
  ({
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({
      getRequest: () => ({ user: role ? { role } : undefined }),
    }),
  }) as unknown as ExecutionContext;

describe('RolesGuard', () => {
  const reflector = new Reflector();
  const guard = new RolesGuard(reflector);

  it('allows routes without @Roles', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    expect(guard.canActivate(ctx(UserRole.DRIVER))).toBe(true);
  });

  it('allows a listed role and the super admin', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([
      UserRole.FLEET_MANAGER,
    ]);
    expect(guard.canActivate(ctx(UserRole.FLEET_MANAGER))).toBe(true);
    expect(guard.canActivate(ctx(UserRole.SUPER_ADMIN))).toBe(true);
  });

  it('blocks other roles', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([
      UserRole.FLEET_MANAGER,
    ]);
    expect(() => guard.canActivate(ctx(UserRole.DRIVER))).toThrow(
      ForbiddenException,
    );
  });

  describe('matrix-governed routes', () => {
    const governed = (roles: UserRole[]) =>
      vi
        .spyOn(reflector, 'getAllAndOverride')
        .mockImplementation((key: unknown) =>
          key === 'roles' ? roles : { module: 'ROSTER', action: 'edit' },
        );

    it('defers dashboard roles to the permission matrix', () => {
      governed([UserRole.ROSTER_MANAGER]);
      expect(guard.canActivate(ctx(UserRole.SUPERVISOR))).toBe(true);
      expect(guard.canActivate(ctx(UserRole.FLEET_MANAGER))).toBe(true);
    });

    it('still requires field roles to be listed', () => {
      governed([UserRole.ROSTER_MANAGER]);
      expect(() => guard.canActivate(ctx(UserRole.DRIVER))).toThrow(
        ForbiddenException,
      );
    });
  });
});
