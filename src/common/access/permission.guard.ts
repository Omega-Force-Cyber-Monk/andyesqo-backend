import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionModule, UserRole } from '../../generated/prisma/enums.js';
import type { AuthUser } from '../types/auth-user.js';
import { AccessService } from './access.service.js';

export const PERMISSION_KEY = 'access-permission';
export type Requirement = {
  module: PermissionModule;
  action: 'view' | 'edit';
  /**
   * Drivers and assistants use this route for their own records only (the
   * service enforces ownership), so the module matrix does not apply to them.
   */
  selfService?: boolean;
};

/** Governs a route by the View/Edit permission matrix and user overrides. */
export const RequirePermission = (
  module: PermissionModule,
  action: 'view' | 'edit',
  options: { selfService?: boolean } = {},
) => SetMetadata(PERMISSION_KEY, { module, action, ...options });

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly access: AccessService,
  ) {}
  async canActivate(context: ExecutionContext) {
    const requirement = this.reflector.getAllAndOverride<
      Requirement | undefined
    >(PERMISSION_KEY, [context.getHandler(), context.getClass()]);
    if (!requirement) return true;
    const actor: AuthUser | undefined = context
      .switchToHttp()
      .getRequest().user;
    if (!actor) return false;
    if (
      requirement.selfService &&
      (actor.role === UserRole.DRIVER || actor.role === UserRole.ASSISTANT)
    )
      return true;
    await this.access.assertPermission(
      actor,
      requirement.module,
      requirement.action,
    );
    return true;
  }
}
