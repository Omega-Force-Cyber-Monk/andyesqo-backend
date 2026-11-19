import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../../generated/prisma/enums.js';

export const ROLES_KEY = 'roles';
/** Restrict a route to these roles. SUPER_ADMIN always passes. */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

/** Handy role groups that match the dashboards in the design. */
export const MANAGERS: UserRole[] = [
  UserRole.BUSINESS_ADMIN,
  UserRole.SUPERVISOR,
  UserRole.FLEET_MANAGER,
  UserRole.ROSTER_MANAGER,
];
export const FLEET_ROLES: UserRole[] = [
  UserRole.BUSINESS_ADMIN,
  UserRole.FLEET_MANAGER,
  UserRole.SUPERVISOR,
];
export const ROSTER_ROLES: UserRole[] = [
  UserRole.BUSINESS_ADMIN,
  UserRole.ROSTER_MANAGER,
];
export const FIELD_ROLES: UserRole[] = [UserRole.DRIVER, UserRole.ASSISTANT];
