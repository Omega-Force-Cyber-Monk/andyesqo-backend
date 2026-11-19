import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { UserRole } from '../generated/prisma/enums.js';
import { AuditService } from '../common/audit/audit.service.js';
import type { AuthUser } from '../common/types/auth-user.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  defaultPermissionRows,
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSION_MODULES,
} from './default-permissions.js';
import { CreateRoleDto, SaveMatrixDto } from './dto/role.dto.js';
import { refreshBusinessSetup } from '../businesses/setup.js';

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Business admins see their business. Super admin sees platform defaults or ?businessId=. */
  private scope(user: AuthUser, businessId?: string): string | null {
    if (user.role === UserRole.SUPER_ADMIN) return businessId ?? null;
    return user.businessId;
  }

  async matrix(user: AuthUser, businessId?: string) {
    const scope = this.scope(user, businessId);
    const roles = await this.prisma.roleDefinition.findMany({
      where: { businessId: scope },
      include: { permissions: true },
      orderBy: [{ isSystem: 'desc' }, { createdAt: 'asc' }],
    });
    return { modules: PERMISSION_MODULES, roles };
  }

  async create(user: AuthUser, dto: CreateRoleDto) {
    const businessId = this.scope(user, dto.businessId);
    const key = dto.name
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_');
    const role = await this.prisma.roleDefinition.create({
      data: {
        businessId,
        key,
        name: dto.name,
        description: dto.description,
        permissions: { create: defaultPermissionRows('') },
      },
      include: { permissions: true },
    });
    await this.audit.log(user, {
      businessId,
      action: 'Role Created',
      module: 'Users & Permissions',
      targetType: 'RoleDefinition',
      targetId: role.id,
      details: dto.name,
    });
    return role;
  }

  async saveMatrix(user: AuthUser, dto: SaveMatrixDto, businessId?: string) {
    const scope = this.scope(user, businessId);
    const ids = dto.roles.map((r) => r.roleId);
    const owned = await this.prisma.roleDefinition.count({
      where: { id: { in: ids }, businessId: scope },
    });
    if (owned !== ids.length)
      throw new ForbiddenException('One or more roles are outside your scope');

    await this.prisma.$transaction(
      dto.roles.flatMap((r) =>
        r.permissions.map((p) =>
          this.prisma.rolePermission.upsert({
            where: {
              roleDefinitionId_module: {
                roleDefinitionId: r.roleId,
                module: p.module,
              },
            },
            create: {
              roleDefinitionId: r.roleId,
              module: p.module,
              canView: p.canView || p.canEdit,
              canEdit: p.canEdit,
            },
            update: { canView: p.canView || p.canEdit, canEdit: p.canEdit },
          }),
        ),
      ),
    );
    if (scope) {
      await this.prisma.business.update({
        where: { id: scope },
        data: { permissionsVerified: true },
      });
      await refreshBusinessSetup(this.prisma, scope);
    }
    await this.audit.log(user, {
      businessId: scope,
      action: 'Permission Matrix Updated',
      module: 'Users & Permissions',
    });
    return this.matrix(user, businessId);
  }

  async remove(user: AuthUser, id: string) {
    const role = await this.prisma.roleDefinition.findUniqueOrThrow({
      where: { id },
    });
    if (role.isSystem)
      throw new BadRequestException('Built-in roles cannot be deleted');
    if (
      user.role !== UserRole.SUPER_ADMIN &&
      role.businessId !== user.businessId
    ) {
      throw new ForbiddenException();
    }
    return this.prisma.roleDefinition.delete({ where: { id } });
  }

  /** Copy the built-in role templates into a new business. */
  async seedForBusiness(businessId: string) {
    for (const [key, def] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
      await this.prisma.roleDefinition.upsert({
        where: { businessId_key: { businessId, key } },
        create: {
          businessId,
          key,
          name: def.name,
          isSystem: true,
          permissions: { create: defaultPermissionRows(key) },
        },
        update: {},
      });
    }
  }
}
