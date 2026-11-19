import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import {
  DeliveryStatus,
  UserRole,
  UserStatus,
  PermissionModule,
} from '../generated/prisma/enums.js';
import { publicUser } from '../auth/auth.service.js';
import { UserTokensService } from '../auth/user-tokens.service.js';
import { AuditService } from '../common/audit/audit.service.js';
import { MailService } from '../common/mail/mail.service.js';
import { pageResult, paginate } from '../common/dto/pagination.dto.js';
import type { AuthUser } from '../common/types/auth-user.js';
import { nextCode } from '../common/utils/codes.js';
import { toCsv } from '../common/utils/csv.js';
import {
  businessFilter,
  businessIdOf,
  localDate,
  todayRange,
} from '../common/utils/tenant.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { refreshBusinessSetup } from '../businesses/setup.js';
import { VISIBLE_TO_CREW } from '../roster/shift-visibility.js';
import { DepotScopeDto, PermissionOverrideDto } from './dto/access.dto.js';
import { AccessService } from '../common/access/access.service.js';
import {
  CreateUserDto,
  UpdateMeDto,
  UpdateUserDto,
  UserQueryDto,
} from './dto/user.dto.js';

export const ROLE_PREFIX: Record<UserRole, string> = {
  SUPER_ADMIN: 'SAD',
  BUSINESS_ADMIN: 'ADM',
  SUPERVISOR: 'SUP',
  FLEET_MANAGER: 'FLT',
  ROSTER_MANAGER: 'ROS',
  DRIVER: 'DRV',
  ASSISTANT: 'AST',
};

export function splitName(full: string) {
  const parts = full.trim().split(/\s+/);
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') || null };
}

const toDate = (v?: string) => (v ? new Date(v) : undefined);

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: UserTokensService,
    private readonly audit: AuditService,
    private readonly accessPolicy: AccessService,
    private readonly mail: MailService,
  ) {}

  private async accessTarget(actor: AuthUser, id: string) {
    const scope = await this.accessPolicy.depotScope(actor);
    const target = await this.prisma.user.findFirst({
      where: {
        id,
        ...businessFilter(actor),
        ...(scope !== null && { depotId: { in: scope } }),
      },
      select: { id: true, businessId: true, role: true },
    });
    if (!target || !target.businessId || target.role === UserRole.SUPER_ADMIN)
      throw new NotFoundException('User not found');
    return target;
  }

  /**
   * Administrator-assisted authenticator reset (lost device). Runs under a lock
   * on the user row and bumps the credential version, which invalidates every
   * session, refresh token and pending MFA challenge. Enrollment or verification
   * already in flight cannot complete afterwards (see AuthService).
   */
  async resetMfa(actor: AuthUser, id: string, reason: string) {
    if (id === actor.id)
      throw new BadRequestException(
        'Use authenticator replacement to change your own authenticator',
      );
    const target = await this.accessTarget(actor, id);
    if (
      target.role === UserRole.BUSINESS_ADMIN &&
      actor.role !== UserRole.SUPER_ADMIN
    )
      throw new ForbiddenException(
        'Only the platform administrator can reset an administrator authenticator',
      );
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${id} FOR UPDATE`;
      const removed = await tx.mfaTotp.deleteMany({ where: { userId: id } });
      await tx.mfaRecoveryCode.deleteMany({ where: { userId: id } });
      await tx.mfaAttempt.deleteMany({ where: { userId: id } });
      const now = new Date();
      await tx.mfaChallenge.updateMany({
        where: { userId: id, usedAt: null },
        data: { usedAt: now },
      });
      await tx.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: now },
      });
      const updated = await tx.user.update({
        where: { id },
        data: {
          twoFactorEnabled: false,
          mfaResetAt: now,
          credentialVersion: { increment: 1 },
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          businessId: target.businessId,
          action: 'Authenticator Reset',
          module: 'Users & Permissions',
          targetType: 'User',
          targetId: id,
          details: `${reason}${removed.count ? '' : ' (no authenticator enrolled)'}`,
        },
      });
      const business = await tx.business.findUnique({
        where: { id: target.businessId! },
        select: { twoFactorRequired: true },
      });
      await this.mail.send(
        updated.email,
        'Your Andyesqo authenticator was reset',
        `An administrator reset two-factor authentication on your account.\n\nReason: ${reason}\n\nYou have been signed out. ${
          business?.twoFactorRequired
            ? 'Sign in again to enroll a new authenticator app.'
            : 'Sign in again; you can enroll a new authenticator app in your settings.'
        }\n\nIf you did not request this, contact your administrator immediately.`,
        tx,
      );
      return updated;
    });
    this.mail.flush();
    return { reset: true, userId: id };
  }

  async access(actor: AuthUser, id: string) {
    await this.accessTarget(actor, id);
    return this.prisma.user.findUniqueOrThrow({
      where: { id },
      select: {
        id: true,
        allDepots: true,
        depotScopes: { select: { depotId: true } },
        permissionOverrides: true,
      },
    });
  }

  async setDepotScope(actor: AuthUser, id: string, dto: DepotScopeDto) {
    const target = await this.accessTarget(actor, id);
    const scope = await this.accessPolicy.depotScope(actor);
    if (
      scope !== null &&
      (dto.allDepots ||
        dto.depotIds.some((depotId) => !scope.includes(depotId)))
    ) {
      throw new BadRequestException(
        'Cannot grant depot access outside your scope',
      );
    }
    if (dto.allDepots && dto.depotIds.length)
      throw new BadRequestException(
        'Do not specify depots for business-wide access',
      );
    const count = await this.prisma.depot.count({
      where: { id: { in: dto.depotIds }, businessId: target.businessId! },
    });
    if (count !== dto.depotIds.length)
      throw new BadRequestException(
        'One or more depots are outside the user business',
      );
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: { allDepots: dto.allDepots },
      });
      await tx.userDepotScope.deleteMany({ where: { userId: id } });
      if (dto.depotIds.length)
        await tx.userDepotScope.createMany({
          data: dto.depotIds.map((depotId) => ({ userId: id, depotId })),
        });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          businessId: target.businessId,
          action: 'Depot Access Updated',
          module: 'Users & Permissions',
          targetType: 'User',
          targetId: id,
        },
      });
    });
    return this.access(actor, id);
  }

  async setPermissionOverride(
    actor: AuthUser,
    id: string,
    dto: PermissionOverrideDto,
  ) {
    const target = await this.accessTarget(actor, id);
    if (target.role === UserRole.BUSINESS_ADMIN)
      throw new BadRequestException(
        'Business administrator module access is unrestricted',
      );
    const startsAt = new Date(dto.startsAt),
      expiresAt = new Date(dto.expiresAt);
    if (
      !Number.isFinite(startsAt.getTime()) ||
      !Number.isFinite(expiresAt.getTime()) ||
      startsAt >= expiresAt ||
      expiresAt <= new Date()
    )
      throw new BadRequestException(
        'Override must have a valid future expiry after its start',
      );
    await this.prisma.$transaction(async (tx) => {
      await tx.userPermissionOverride.upsert({
        where: { userId_module: { userId: id, module: dto.module } },
        create: {
          userId: id,
          module: dto.module,
          canView: dto.canView || dto.canEdit,
          canEdit: dto.canEdit,
          startsAt,
          expiresAt,
        },
        update: {
          canView: dto.canView || dto.canEdit,
          canEdit: dto.canEdit,
          startsAt,
          expiresAt,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          businessId: target.businessId,
          action: 'Permission Override Updated',
          module: 'Users & Permissions',
          targetType: 'User',
          targetId: id,
          details: dto.module,
        },
      });
    });
    return this.access(actor, id);
  }

  async removePermissionOverride(
    actor: AuthUser,
    id: string,
    module: PermissionModule,
  ) {
    const target = await this.accessTarget(actor, id);
    await this.prisma.$transaction(async (tx) => {
      await tx.userPermissionOverride.deleteMany({
        where: { userId: id, module },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          businessId: target.businessId,
          action: 'Permission Override Removed',
          module: 'Users & Permissions',
          targetType: 'User',
          targetId: id,
          details: module,
        },
      });
    });
    return this.access(actor, id);
  }

  private async validateAssignments(
    businessId: string | null,
    depotId?: string,
    supervisorId?: string,
  ) {
    if ((depotId || supervisorId) && !businessId)
      throw new BadRequestException('Assignments require a business');
    if (
      depotId &&
      !(await this.prisma.depot.findFirst({
        where: { id: depotId, businessId: businessId! },
        select: { id: true },
      }))
    ) {
      throw new BadRequestException('Depot is outside the user business');
    }
    if (
      supervisorId &&
      !(await this.prisma.user.findFirst({
        where: { id: supervisorId, businessId },
        select: { id: true },
      }))
    ) {
      throw new BadRequestException('Supervisor is outside the user business');
    }
  }

  /** Shared by Users, Administrators and Businesses (create business step 2). */
  async createUser(
    actor: AuthUser,
    businessId: string | null,
    dto: CreateUserDto,
  ) {
    if (
      dto.role === UserRole.SUPER_ADMIN &&
      actor.role !== UserRole.SUPER_ADMIN
    ) {
      throw new BadRequestException('Cannot create a super admin');
    }
    await this.validateAssignments(businessId, dto.depotId, dto.supervisorId);
    const exists = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (exists)
      throw new ConflictException('A user with this email already exists');

    const employeeId =
      dto.employeeId ??
      (businessId
        ? await nextCode(this.prisma, businessId, ROLE_PREFIX[dto.role])
        : null);
    const { firstName, lastName } = splitName(dto.fullName);
    const user = await this.prisma.user.create({
      data: {
        businessId,
        role: dto.role,
        email: dto.email,
        phone: dto.phone,
        firstName,
        lastName,
        employeeId,
        depotId: dto.depotId,
        status: UserStatus.PENDING_INVITE,
        employmentType: dto.employmentType,
        joiningDate: toDate(dto.joiningDate),
        team: dto.team,
        supervisorId: dto.supervisorId,
        preferredShift: dto.preferredShift,
        licenceClass: dto.licenceClass,
        licenceNumber: dto.licenceNumber,
        licenceExpiry: toDate(dto.licenceExpiry),
        visaStatus: dto.visaStatus,
        visaExpiry: toDate(dto.visaExpiry),
        dateOfBirth: toDate(dto.dateOfBirth),
        emergencyContactName: dto.emergencyContactName,
        emergencyContactPhone: dto.emergencyContactPhone,
      },
    });
    const invitation =
      dto.sendInvitation === false
        ? { sent: false }
        : await this.tokens.sendInvitation(user);
    if (businessId && user.role === UserRole.BUSINESS_ADMIN)
      await refreshBusinessSetup(this.prisma, businessId);
    await this.audit.log(actor, {
      businessId,
      action:
        dto.role === UserRole.BUSINESS_ADMIN
          ? 'Administrator Created'
          : 'User Created',
      module: 'Users & Permissions',
      targetType: 'User',
      targetId: user.id,
      details: `${user.firstName} ${user.lastName ?? ''} (${user.role})`.trim(),
    });
    return { user: publicUser(user), invitation };
  }

  /** Managers granted DRIVERS edit may only manage driver and assistant accounts. */
  private assertManagedRole(actor: AuthUser, role: UserRole | undefined) {
    if (
      role !== undefined &&
      actor.role !== UserRole.BUSINESS_ADMIN &&
      actor.role !== UserRole.SUPER_ADMIN &&
      role !== UserRole.DRIVER &&
      role !== UserRole.ASSISTANT
    )
      throw new ForbiddenException('Only administrators can manage this role');
  }

  async create(actor: AuthUser, dto: CreateUserDto) {
    if (dto.role === UserRole.SUPER_ADMIN)
      throw new BadRequestException('Use the seed to create super admins');
    this.assertManagedRole(actor, dto.role);
    const scope = await this.accessPolicy.depotScope(actor);
    if (scope !== null && (!dto.depotId || !scope.includes(dto.depotId)))
      throw new BadRequestException('Depot is outside your access scope');
    return this.createUser(actor, businessIdOf(actor, dto.businessId), dto);
  }

  private async where(
    actor: AuthUser,
    q: UserQueryDto,
  ): Promise<Prisma.UserWhereInput> {
    const scope = await this.accessPolicy.depotScope(actor);
    return {
      ...businessFilter(actor, q.businessId),
      role:
        actor.role === UserRole.BUSINESS_ADMIN ||
        actor.role === UserRole.SUPER_ADMIN
          ? (q.role ?? { not: UserRole.SUPER_ADMIN })
          : {
              in: q.role
                ? [q.role].filter(
                    (role) =>
                      role === UserRole.DRIVER || role === UserRole.ASSISTANT,
                  )
                : [UserRole.DRIVER, UserRole.ASSISTANT],
            },
      status: q.status,
      depotId: q.depotId,
      ...(scope !== null && { AND: [{ depotId: { in: scope } }] }),
      ...(q.search && {
        OR: [
          { firstName: { contains: q.search, mode: 'insensitive' } },
          { lastName: { contains: q.search, mode: 'insensitive' } },
          { email: { contains: q.search, mode: 'insensitive' } },
          { employeeId: { contains: q.search, mode: 'insensitive' } },
        ],
      }),
    };
  }

  async findAll(actor: AuthUser, q: UserQueryDto) {
    const { skip, take, page, limit } = paginate(q);
    const where = await this.where(actor, q);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: { depot: { select: { id: true, name: true } } },
      }),
      this.prisma.user.count({ where }),
    ]);
    return pageResult(items.map(publicUser), total, page, limit);
  }

  /** Stat cards on "All Users Directory". */
  async stats(actor: AuthUser, businessId?: string) {
    const scope = await this.accessPolicy.depotScope(actor);
    const base = {
      ...businessFilter(actor, businessId),
      role:
        actor.role === UserRole.BUSINESS_ADMIN ||
        actor.role === UserRole.SUPER_ADMIN
          ? { not: UserRole.SUPER_ADMIN }
          : { in: [UserRole.DRIVER, UserRole.ASSISTANT] },
      ...(scope !== null && { depotId: { in: scope } }),
    };
    const [total, drivers, assistants, active] = await this.prisma.$transaction(
      [
        this.prisma.user.count({ where: base }),
        this.prisma.user.count({
          where: { ...base, role: UserRole.DRIVER, status: UserStatus.ACTIVE },
        }),
        this.prisma.user.count({
          where: { ...base, role: UserRole.ASSISTANT },
        }),
        this.prisma.user.count({
          where: { ...base, status: UserStatus.ACTIVE },
        }),
      ],
    );
    return {
      totalUsers: total,
      activeDrivers: drivers,
      assistants,
      activeAccounts: active,
    };
  }

  async exportCsv(actor: AuthUser, q: UserQueryDto) {
    const users = await this.prisma.user.findMany({
      where: await this.where(actor, q),
      include: { depot: true },
      orderBy: { createdAt: 'desc' },
    });
    return toCsv(
      users.map((u) => ({
        employeeId: u.employeeId,
        name: `${u.firstName} ${u.lastName ?? ''}`.trim(),
        email: u.email,
        phone: u.phone,
        role: u.role,
        depot: u.depot?.name,
        status: u.status,
      })),
    );
  }

  async findOne(actor: AuthUser, id: string) {
    const scope = await this.accessPolicy.depotScope(actor);
    const allowed = async (module: PermissionModule) => {
      try {
        await this.accessPolicy.assertPermission(actor, module, 'view');
        return true;
      } catch (error) {
        if (error instanceof ForbiddenException) return false;
        throw error;
      }
    };
    const [canViewDocuments, canViewVehicles] = await Promise.all([
      allowed(PermissionModule.COMPLIANCE),
      allowed(PermissionModule.VEHICLES),
    ]);
    const user = await this.prisma.user.findFirst({
      where: {
        id,
        ...businessFilter(actor),
        ...(scope !== null && { depotId: { in: scope } }),
        ...(actor.role !== UserRole.BUSINESS_ADMIN &&
          actor.role !== UserRole.SUPER_ADMIN && {
            role: { in: [UserRole.DRIVER, UserRole.ASSISTANT] },
          }),
      },
      include: {
        depot: true,
        supervisor: {
          select: { id: true, firstName: true, lastName: true, depotId: true },
        },
        documents: canViewDocuments ? { orderBy: { expiresAt: 'asc' } } : false,
        assignedVehicles: canViewVehicles
          ? { where: scope === null ? {} : { depotId: { in: scope } } }
          : false,
      },
    });
    if (!user) throw new NotFoundException('User not found');
    const supervisor =
      user.supervisor &&
      (scope === null ||
        (user.supervisor.depotId && scope.includes(user.supervisor.depotId)))
        ? {
            id: user.supervisor.id,
            firstName: user.supervisor.firstName,
            lastName: user.supervisor.lastName,
          }
        : null;
    return { ...publicUser(user), supervisor };
  }

  async update(actor: AuthUser, id: string, dto: UpdateUserDto) {
    this.assertManagedRole(actor, dto.role);
    const previous = await this.findOne(actor, id);
    const scope = await this.accessPolicy.depotScope(actor);
    if (
      scope !== null &&
      dto.depotId !== undefined &&
      (!dto.depotId || !scope.includes(dto.depotId))
    )
      throw new BadRequestException('Depot is outside your access scope');
    if (
      actor.role !== UserRole.SUPER_ADMIN &&
      (dto.role === UserRole.SUPER_ADMIN ||
        previous.role === UserRole.SUPER_ADMIN)
    ) {
      throw new BadRequestException('Cannot assign or modify a super admin');
    }
    await this.validateAssignments(
      previous.businessId,
      dto.depotId,
      dto.supervisorId,
    );
    const {
      fullName,
      licenceExpiry,
      visaExpiry,
      joiningDate,
      dateOfBirth,
      ...rest
    } = dto;
    const user = await this.prisma.user.update({
      where: { id },
      data: {
        ...rest,
        ...(fullName && splitName(fullName)),
        licenceExpiry: toDate(licenceExpiry),
        visaExpiry: toDate(visaExpiry),
        joiningDate: toDate(joiningDate),
        dateOfBirth: toDate(dateOfBirth),
      },
    });
    if (
      previous.businessId &&
      (previous.role === UserRole.BUSINESS_ADMIN ||
        user.role === UserRole.BUSINESS_ADMIN)
    )
      await refreshBusinessSetup(this.prisma, previous.businessId);
    await this.audit.log(actor, {
      businessId: user.businessId,
      action: 'User Updated',
      module: 'Users & Permissions',
      targetType: 'User',
      targetId: id,
    });
    return publicUser(user);
  }

  async deactivate(actor: AuthUser, id: string) {
    await this.findOne(actor, id);
    if (id === actor.id)
      throw new BadRequestException('You cannot deactivate yourself');
    const user = await this.prisma.user.update({
      where: { id },
      data: { status: UserStatus.INACTIVE },
    });
    await this.prisma.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (user.businessId && user.role === UserRole.BUSINESS_ADMIN)
      await refreshBusinessSetup(this.prisma, user.businessId);
    await this.audit.log(actor, {
      businessId: user.businessId,
      action: 'User Deactivated',
      module: 'Users & Permissions',
      targetType: 'User',
      targetId: id,
    });
    return publicUser(user);
  }

  async resendInvitation(actor: AuthUser, id: string) {
    const user = await this.findOne(actor, id);
    if (user.status !== UserStatus.PENDING_INVITE) {
      throw new BadRequestException('User has already activated the account');
    }
    const result = await this.tokens.sendInvitation(user);
    await this.audit.log(actor, {
      businessId: user.businessId,
      action: 'Administrator Invitation Sent',
      module: 'Users & Permissions',
      targetType: 'User',
      targetId: id,
      details: `Resent invitation to ${user.firstName} (${user.email})`,
    });
    return result;
  }

  updateMe(actor: AuthUser, dto: UpdateMeDto) {
    return this.prisma.user
      .update({ where: { id: actor.id }, data: dto })
      .then(publicUser);
  }

  /** Driver / assistant "My Profile" screen. */
  async myProfile(actor: AuthUser) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: actor.id },
      include: {
        business: { select: { id: true, name: true } },
        depot: true,
        supervisor: { select: { id: true, firstName: true, lastName: true } },
        documents: true,
        assignedVehicles: true,
      },
    });
    const today = todayRange();
    const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    const [
      todayShift,
      totalDeliveries,
      onTime,
      completed,
      weekAttendance,
      todayDeliveries,
      todayCompleted,
    ] = await this.prisma.$transaction([
      this.prisma.shift.findFirst({
        where: {
          date: today,
          status: { in: VISIBLE_TO_CREW },
          OR: [{ driverId: actor.id }, { assistantId: actor.id }],
        },
        include: {
          depot: true,
          vehicle: true,
          attendances: { where: { userId: actor.id } },
        },
      }),
      this.prisma.delivery.count({ where: { driverId: actor.id } }),
      this.prisma.delivery.count({
        where: {
          driverId: actor.id,
          status: DeliveryStatus.COMPLETED,
          delayReason: null,
        },
      }),
      this.prisma.delivery.count({
        where: { driverId: actor.id, status: DeliveryStatus.COMPLETED },
      }),
      this.prisma.attendance.findMany({
        where: { userId: actor.id, clockInAt: { gte: weekAgo } },
      }),
      this.prisma.delivery.count({
        where: { driverId: actor.id, scheduledDropTime: today },
      }),
      this.prisma.delivery.count({
        where: {
          driverId: actor.id,
          scheduledDropTime: today,
          status: DeliveryStatus.COMPLETED,
        },
      }),
    ]);
    // Attendance: share of the last 30 days' rostered (published) shifts the
    // user clocked in to. Today's shift is excluded while it is still open.
    const rostered = await this.prisma.shift.findMany({
      where: {
        date: {
          gte: new Date(localDate().getTime() - 30 * 86_400_000),
          lt: localDate(),
        },
        status: { in: VISIBLE_TO_CREW },
        OR: [{ driverId: actor.id }, { assistantId: actor.id }],
      },
      select: {
        attendances: {
          where: { userId: actor.id, clockInAt: { not: null } },
          select: { id: true },
        },
      },
    });
    const attended = rostered.filter((s) => s.attendances.length).length;
    const weeklyHours = weekAttendance.reduce((sum, a) => {
      const end = a.clockOutAt ?? new Date();
      return a.clockInAt
        ? sum + (end.getTime() - a.clockInAt.getTime()) / 3600000
        : sum;
    }, 0);
    const vehicle = user.assignedVehicles[0] ?? todayShift?.vehicle ?? null;
    return {
      ...publicUser(user),
      assignedVehicle: vehicle,
      todayShift,
      todayDeliveries: { total: todayDeliveries, completed: todayCompleted },
      performance: {
        deliveries: totalDeliveries,
        onTimeRate: completed
          ? Math.round((onTime / completed) * 1000) / 10
          : null,
        weeklyHours: Math.round(weeklyHours * 10) / 10,
        attendanceRate: rostered.length
          ? Math.round((attended / rostered.length) * 1000) / 10
          : null,
        // The design gives no rule for a safety score (see README).
        safetyScore: null,
      },
    };
  }
}
