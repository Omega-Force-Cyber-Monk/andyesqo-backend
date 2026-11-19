import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BusinessRegionStatus } from '../generated/prisma/enums.js';
import { AuditService } from '../common/audit/audit.service.js';
import type { AuthUser } from '../common/types/auth-user.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { refreshBusinessSetup } from '../businesses/setup.js';
import {
  AssignRegionsDto,
  CreateRegionDto,
  UpdateRegionDto,
} from './dto/region.dto.js';

@Injectable()
export class RegionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll() {
    const regions = await this.prisma.region.findMany({
      orderBy: { code: 'asc' },
      include: { _count: { select: { businesses: true } } },
    });
    return regions.map(({ _count, ...r }) => ({
      ...r,
      businessCount: _count.businesses,
    }));
  }

  create(dto: CreateRegionDto) {
    return this.prisma.region.create({
      data: { ...dto, code: dto.code.toUpperCase() },
    });
  }

  update(id: string, dto: UpdateRegionDto) {
    return this.prisma.region.update({
      where: { id },
      data: { ...dto, code: dto.code?.toUpperCase() },
    });
  }

  async remove(id: string) {
    const assignments = await this.prisma.businessRegion.findMany({
      where: { regionId: id },
      select: { businessId: true },
    });
    const region = await this.prisma.region.delete({ where: { id } });
    for (const { businessId } of assignments) {
      await refreshBusinessSetup(this.prisma, businessId);
    }
    return region;
  }

  /** "Regions & States" table: which business operates where. */
  assignments(search?: string) {
    return this.prisma.businessRegion.findMany({
      where: search
        ? { business: { name: { contains: search, mode: 'insensitive' } } }
        : undefined,
      include: { business: { select: { id: true, name: true } }, region: true },
      orderBy: { assignedAt: 'desc' },
    });
  }

  /** "Assign Region / State" modal. */
  async assign(actor: AuthUser, dto: AssignRegionsDto) {
    if (
      !(await this.prisma.business.findUnique({
        where: { id: dto.businessId },
        select: { id: true },
      }))
    )
      throw new NotFoundException('Business not found');
    const found = await this.prisma.region.count({
      where: { id: { in: dto.regionIds } },
    });
    if (found !== new Set(dto.regionIds).size)
      throw new BadRequestException('One or more regions do not exist');
    await this.prisma.$transaction([
      this.prisma.businessRegion.deleteMany({
        where: {
          businessId: dto.businessId,
          regionId: { notIn: dto.regionIds },
        },
      }),
      ...dto.regionIds.map((regionId) =>
        this.prisma.businessRegion.upsert({
          where: {
            businessId_regionId: { businessId: dto.businessId, regionId },
          },
          create: { businessId: dto.businessId, regionId },
          update: {},
        }),
      ),
    ]);
    await refreshBusinessSetup(this.prisma, dto.businessId);
    await this.audit.log(actor, {
      businessId: dto.businessId,
      action: 'Regions Configured',
      module: 'Business',
      targetType: 'Business',
      targetId: dto.businessId,
    });
    return this.prisma.businessRegion.findMany({
      where: { businessId: dto.businessId },
      include: { region: true },
    });
  }

  async updateAssignment(
    actor: AuthUser,
    id: string,
    status: BusinessRegionStatus,
  ) {
    const existing = await this.prisma.businessRegion.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Region assignment not found');
    const updated = await this.prisma.businessRegion.update({
      where: { id },
      data: { status },
    });
    // An INACTIVE region no longer satisfies the "Regions / Status" step.
    await refreshBusinessSetup(this.prisma, existing.businessId);
    await this.audit.log(actor, {
      businessId: existing.businessId,
      action: 'Region Status Changed',
      module: 'Business',
      targetType: 'BusinessRegion',
      targetId: id,
      details: `${existing.status} → ${status}`,
    });
    return updated;
  }
}
