import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../../generated/prisma/enums.js';
import { MANAGERS, ROLES_KEY } from '../decorators/roles.decorator.js';
import { PERMISSION_KEY } from '../access/permission.guard.js';
import type { AuthUser } from '../types/auth-user.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<UserRole[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!roles || roles.length === 0) return true;
    const user: AuthUser | undefined = context.switchToHttp().getRequest().user;
    if (!user) return false;
    if (user.role === UserRole.SUPER_ADMIN || roles.includes(user.role)) {
      return true;
    }
    // On matrix-governed routes the View/Edit matrix (and user overrides) is
    // authoritative for dashboard roles; PermissionGuard makes the decision.
    // Field roles (driver/assistant) still need to be listed explicitly.
    const governed = this.reflector.getAllAndOverride<unknown>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (governed && MANAGERS.includes(user.role)) return true;
    throw new ForbiddenException('Your role cannot access this resource');
  }
}
