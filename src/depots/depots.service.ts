import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AccessService } from '../common/access/access.service.js';
import { AuditService } from '../common/audit/audit.service.js';
import type { AuthUser } from '../common/types/auth-user.js';
import { businessFilter, businessIdOf } from '../common/utils/tenant.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateDepotDto, UpdateDepotDto } from './dto/depot.dto.js';

@Injectable()
export class DepotsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  /** Depots inside the actor's business and depot scope. */
  private async where(actor: AuthUser, businessId?: string) {
    const depots = await this.access.depotScope(actor);
    return {
      ...businessFilter(actor, businessId),
      ...(depots !== null && { id: { in: depots } }),
    };
  }

  async findAll(actor: AuthUser, businessId?: string) {
    return this.prisma.depot.findMany({
      where: await this.where(actor, businessId),
      orderBy: { name: 'asc' },
      include: { _count: { select: { users: true, vehicles: true } } },
    });
  }

  async create(actor: AuthUser, dto: CreateDepotDto) {
    if ((await this.access.depotScope(actor)) !== null)
      throw new ForbiddenException(
        'Only users with access to all depots can create depots',
      );
    const { businessId, ...data } = dto;
    const depot = await this.prisma.depot.create({
      data: { ...data, businessId: businessIdOf(actor, businessId) },
    });
    await this.audit.log(actor, {
      businessId: depot.businessId,
      action: 'Depot Created',
      module: 'Depots',
      targetType: 'Depot',
      targetId: depot.id,
      details: depot.name,
    });
    return depot;
  }

  async findOne(actor: AuthUser, id: string) {
    const depot = await this.prisma.depot.findFirst({
      where: { id, ...(await this.where(actor)) },
      include: { _count: { select: { users: true, vehicles: true } } },
    });
    if (!depot) throw new NotFoundException('Depot not found');
    return depot;
  }

  async update(actor: AuthUser, id: string, dto: UpdateDepotDto) {
    await this.findOne(actor, id);
    const { businessId: _b, ...data } = dto;
    const depot = await this.prisma.depot.update({ where: { id }, data });
    await this.audit.log(actor, {
      businessId: depot.businessId,
      action: 'Depot Updated',
      module: 'Depots',
      targetType: 'Depot',
      targetId: id,
      details: depot.name,
    });
    return depot;
  }

  async remove(actor: AuthUser, id: string) {
    const depot = await this.findOne(actor, id);
    await this.prisma.depot.delete({ where: { id } });
    await this.audit.log(actor, {
      businessId: depot.businessId,
      action: 'Depot Deleted',
      module: 'Depots',
      targetType: 'Depot',
      targetId: id,
      details: depot.name,
    });
    return { id, deleted: true };
  }
}
