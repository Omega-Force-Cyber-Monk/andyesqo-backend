import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { BusinessStatus, UserRole } from '../generated/prisma/enums.js';
import { AuditService } from '../common/audit/audit.service.js';
import { pageResult, paginate } from '../common/dto/pagination.dto.js';
import type { AuthUser } from '../common/types/auth-user.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RolesService } from '../roles/roles.service.js';
import { UsersService } from '../users/users.service.js';
import { businessSetup, derivedStatus, refreshBusinessSetup } from './setup.js';
import {
  BusinessQueryParams,
  CreateBusinessDto,
  UpdateBusinessDto,
} from './dto/business.dto.js';

const businessInclude = {
  regions: { include: { region: true } },
  users: {
    where: { role: UserRole.BUSINESS_ADMIN },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      status: true,
    },
  },
} satisfies Prisma.BusinessInclude;

type BusinessWithRelations = Prisma.BusinessGetPayload<{
  include: typeof businessInclude;
}>;

@Injectable()
export class BusinessesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly roles: RolesService,
    private readonly audit: AuditService,
  ) {}

  /** The setup checklist on "view Business profile". */
  setupSteps(b: BusinessWithRelations) {
    return businessSetup(b);
  }

  private shape(b: BusinessWithRelations) {
    const { users, ...rest } = b;
    return {
      ...rest,
      administrator: users.find((user) => user.status !== 'INACTIVE') ?? null,
      setup: this.setupSteps(b),
    };
  }

  private async assertRegions(regionIds: string[] | undefined) {
    if (!regionIds?.length) return;
    const found = await this.prisma.region.count({
      where: { id: { in: regionIds } },
    });
    if (found !== new Set(regionIds).size)
      throw new BadRequestException('One or more regions do not exist');
  }

  async create(actor: AuthUser, dto: CreateBusinessDto) {
    const { administrator, regionIds, ...info } = dto;
    await this.assertRegions(regionIds);
    if (
      administrator &&
      (await this.prisma.user.findUnique({
        where: { email: administrator.email.toLowerCase() },
        select: { id: true },
      }))
    )
      throw new BadRequestException(
        'A user with the administrator email already exists',
      );
    const business = await this.prisma.business.create({
      data: {
        ...info,
        // Status is derived from the checklist, never set at creation.
        status: BusinessStatus.PENDING_SETUP,
        regions: regionIds?.length
          ? {
              create: [...new Set(regionIds)].map((regionId) => ({ regionId })),
            }
          : undefined,
      },
    });
    let invitation: unknown;
    try {
      await this.roles.seedForBusiness(business.id);
      if (administrator) {
        const res = await this.users.createUser(actor, business.id, {
          ...administrator,
          role: UserRole.BUSINESS_ADMIN,
        });
        invitation = res.invitation;
      }
    } catch (error) {
      // Do not leave a half-created tenant behind (cascades roles and users).
      await this.prisma.business.delete({ where: { id: business.id } });
      throw error;
    }
    await this.refreshStatus(business.id);
    await this.audit.log(actor, {
      businessId: business.id,
      action: 'Business Created',
      module: 'Business',
      targetType: 'Business',
      targetId: business.id,
      details: `${business.name} was created by Super Admin`,
    });
    return { ...(await this.findOne(business.id)), invitation };
  }

  async findAll(q: BusinessQueryParams) {
    const { skip, take, page, limit } = paginate(q);
    const where: Prisma.BusinessWhereInput = {
      status: q.status,
      ...(q.search && {
        OR: [
          { name: { contains: q.search, mode: 'insensitive' } },
          {
            users: {
              some: {
                role: UserRole.BUSINESS_ADMIN,
                firstName: { contains: q.search, mode: 'insensitive' },
              },
            },
          },
          {
            regions: {
              some: {
                region: { code: { contains: q.search, mode: 'insensitive' } },
              },
            },
          },
        ],
      }),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.business.findMany({
        where,
        skip,
        take,
        include: businessInclude,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.business.count({ where }),
    ]);
    return pageResult(
      items.map((b) => this.shape(b)),
      total,
      page,
      limit,
    );
  }

  /** Stat cards: Total / Active / Pending Setup / Inactive. */
  async stats() {
    const groups = await this.prisma.business.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    const count = (s: BusinessStatus[]) =>
      groups
        .filter((g) => s.includes(g.status))
        .reduce((n, g) => n + g._count._all, 0);
    return {
      total: groups.reduce((n, g) => n + g._count._all, 0),
      active: count([BusinessStatus.ACTIVE, BusinessStatus.READY]),
      pendingSetup: count([
        BusinessStatus.PENDING_SETUP,
        BusinessStatus.INCOMPLETE,
      ]),
      inactive: count([BusinessStatus.INACTIVE]),
    };
  }

  async findOne(id: string) {
    const b = await this.prisma.business.findUnique({
      where: { id },
      include: businessInclude,
    });
    if (!b) throw new NotFoundException('Business not found');
    return this.shape(b);
  }

  /**
   * Status rules: INACTIVE archives at any time; ACTIVE (go-live) requires the
   * first five checklist steps; PENDING_SETUP, INCOMPLETE or READY reopen an
   * active or archived business and are recomputed from the checklist.
   */
  async update(actor: AuthUser, id: string, dto: UpdateBusinessDto) {
    const { administrator: _a, regionIds, status, ...info } = dto;
    await this.assertRegions(regionIds);
    const current = await this.prisma.business.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!current) throw new NotFoundException('Business not found');
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Business" WHERE id = ${id} FOR UPDATE`;
      await tx.business.update({ where: { id }, data: info });
      if (regionIds) {
        await tx.businessRegion.deleteMany({
          where: { businessId: id, regionId: { notIn: regionIds } },
        });
        for (const regionId of new Set(regionIds))
          await tx.businessRegion.upsert({
            where: { businessId_regionId: { businessId: id, regionId } },
            create: { businessId: id, regionId },
            update: {},
          });
      }
      if (status) {
        const b = await tx.business.findUniqueOrThrow({
          where: { id },
          include: {
            regions: true,
            users: { where: { role: UserRole.BUSINESS_ADMIN } },
          },
        });
        const setup = businessSetup(b);
        let next: BusinessStatus;
        if (status === BusinessStatus.INACTIVE) next = status;
        else if (status === BusinessStatus.ACTIVE) {
          if (!setup.prerequisitesMet)
            throw new BadRequestException(
              'Complete the administrator, regions, settings and permissions steps before activating the business',
            );
          next = status;
        } else next = derivedStatus(setup);
        await tx.business.update({ where: { id }, data: { status: next } });
      }
    });
    if (!status) await this.refreshStatus(id);
    await this.audit.log(actor, {
      businessId: id,
      action:
        status && status !== current.status
          ? `Business Status Changed (${status})`
          : 'Business Updated',
      module: 'Business',
      targetType: 'Business',
      targetId: id,
    });
    return this.findOne(id);
  }

  /** Archive (sets INACTIVE). */
  async archive(actor: AuthUser, id: string) {
    await this.prisma.business.update({
      where: { id },
      data: { status: BusinessStatus.INACTIVE },
    });
    await this.audit.log(actor, {
      businessId: id,
      action: 'Business Archived',
      module: 'Business',
      targetType: 'Business',
      targetId: id,
    });
    return this.findOne(id);
  }

  /** Moves PENDING_SETUP → INCOMPLETE → READY as checklist items complete. */
  async refreshStatus(id: string) {
    await refreshBusinessSetup(this.prisma, id);
  }
}
