import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { UserRole, UserStatus } from '../generated/prisma/enums.js';
import { publicUser } from '../auth/auth.service.js';
import { BusinessesService } from '../businesses/businesses.service.js';
import { pageResult, paginate } from '../common/dto/pagination.dto.js';
import type { AuthUser } from '../common/types/auth-user.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { splitName, UsersService } from '../users/users.service.js';
import {
  AdministratorQueryDto,
  CreateAdministratorDto,
  UpdateAdministratorDto,
} from './dto/administrator.dto.js';

@Injectable()
export class AdministratorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly businesses: BusinessesService,
  ) {}

  async create(actor: AuthUser, dto: CreateAdministratorDto) {
    await this.businesses.findOne(dto.businessId);
    const res = await this.users.createUser(actor, dto.businessId, {
      ...dto,
      role: UserRole.BUSINESS_ADMIN,
    });
    await this.businesses.refreshStatus(dto.businessId);
    return res;
  }

  async findAll(q: AdministratorQueryDto) {
    const { skip, take, page, limit } = paginate(q);
    const where: Prisma.UserWhereInput = {
      role: UserRole.BUSINESS_ADMIN,
      status: q.status,
      ...(q.search && {
        OR: [
          { firstName: { contains: q.search, mode: 'insensitive' } },
          { lastName: { contains: q.search, mode: 'insensitive' } },
          { email: { contains: q.search, mode: 'insensitive' } },
          { business: { name: { contains: q.search, mode: 'insensitive' } } },
        ],
      }),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          business: { select: { id: true, name: true, businessType: true } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);
    return pageResult(items.map(publicUser), total, page, limit);
  }

  async stats() {
    const base = { role: UserRole.BUSINESS_ADMIN };
    const [total, active, pending] = await this.prisma.$transaction([
      this.prisma.user.count({ where: base }),
      this.prisma.user.count({ where: { ...base, status: UserStatus.ACTIVE } }),
      this.prisma.user.count({
        where: { ...base, status: UserStatus.PENDING_INVITE },
      }),
    ]);
    return { total, active, pendingInvitation: pending };
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, role: UserRole.BUSINESS_ADMIN },
      include: {
        business: true,
        userTokens: {
          where: { type: 'INVITATION' },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    if (!user) throw new NotFoundException('Administrator not found');
    const { userTokens, ...rest } = user;
    return {
      ...publicUser(rest as typeof user),
      lastInvitationAt: userTokens[0]?.createdAt ?? null,
    };
  }

  /** "Manage Business Administrator" — also used to move an admin to another business. */
  async update(actor: AuthUser, id: string, dto: UpdateAdministratorDto) {
    const previous = await this.findOne(id);
    const { fullName, sendInvitation: _s, ...rest } = dto;
    const user = await this.prisma.user.update({
      where: { id },
      data: { ...rest, ...(fullName && splitName(fullName)) },
    });
    if (user.businessId) await this.businesses.refreshStatus(user.businessId);
    if (previous.businessId && previous.businessId !== user.businessId)
      await this.businesses.refreshStatus(previous.businessId);
    return publicUser(user);
  }

  resend(actor: AuthUser, id: string) {
    return this.users.resendInvitation(actor, id);
  }
}
