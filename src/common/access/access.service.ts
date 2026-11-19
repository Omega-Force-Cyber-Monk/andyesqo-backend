import { ForbiddenException, Injectable } from '@nestjs/common';
import { PermissionModule, UserRole } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AuthUser } from '../types/auth-user.js';

@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService) {}

  async assertPermission(
    actor: AuthUser,
    module: PermissionModule,
    action: 'view' | 'edit',
  ) {
    if (
      actor.role === UserRole.SUPER_ADMIN ||
      actor.role === UserRole.BUSINESS_ADMIN
    )
      return;
    if (!actor.businessId)
      throw new ForbiddenException('Business access required');
    const now = new Date();
    const override = await this.prisma.userPermissionOverride.findFirst({
      where: {
        userId: actor.id,
        module,
        startsAt: { lte: now },
        expiresAt: { gt: now },
      },
    });
    const permission =
      override ??
      (await this.prisma.rolePermission.findFirst({
        where: {
          module,
          roleDefinition: {
            businessId: actor.businessId,
            key: actor.role,
            isSystem: true,
          },
        },
      }));
    if (
      !permission ||
      (action === 'edit'
        ? !permission.canEdit
        : !(permission.canView || permission.canEdit))
    ) {
      throw new ForbiddenException('Permission denied');
    }
  }

  async canView(actor: AuthUser, module: PermissionModule): Promise<boolean> {
    try {
      await this.assertPermission(actor, module, 'view');
      return true;
    } catch (error) {
      if (error instanceof ForbiddenException) return false;
      throw error;
    }
  }

  /** Prisma filter on a `depotId` column for the actor's depot scope. */
  async depotWhere(actor: AuthUser): Promise<{ depotId?: { in: string[] } }> {
    const depots = await this.depotScope(actor);
    return depots === null ? {} : { depotId: { in: depots } };
  }

  /** Throws unless the depot is inside the actor's scope (null depot only for business-wide users). */
  async assertDepot(actor: AuthUser, depotId: string | null | undefined) {
    const depots = await this.depotScope(actor);
    if (depots !== null && (!depotId || !depots.includes(depotId)))
      throw new ForbiddenException('Depot is outside your access scope');
  }

  /** null means business-wide; an empty list means no depot access. */
  async depotScope(actor: AuthUser): Promise<string[] | null> {
    if (actor.role === UserRole.SUPER_ADMIN) return null;
    if (!actor.businessId)
      throw new ForbiddenException('Business access required');
    const user = await this.prisma.user.findFirst({
      where: { id: actor.id, businessId: actor.businessId },
      select: {
        allDepots: true,
        depotScopes: {
          select: { depotId: true, depot: { select: { businessId: true } } },
        },
      },
    });
    if (!user) throw new ForbiddenException('Business access required');
    return user.allDepots
      ? null
      : user.depotScopes
          .filter((s) => s.depot.businessId === actor.businessId)
          .map((s) => s.depotId);
  }
}
