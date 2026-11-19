import { Injectable, NotFoundException } from '@nestjs/common';
import { UserRole } from '../generated/prisma/enums.js';
import { AuditService } from '../common/audit/audit.service.js';
import type { AuthUser } from '../common/types/auth-user.js';
import { businessFilter, businessIdOf } from '../common/utils/tenant.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  CreateDamageTypeDto,
  CreateIncidentTypeDto,
  UpdateDamageTypeDto,
  UpdateIncidentTypeDto,
} from './dto/catalog.dto.js';

/** Admin-configurable damage and incident categories. */
@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async record<
    T extends { id: string; businessId: string; name: string },
  >(actor: AuthUser, action: string, row: T) {
    await this.audit.log(actor, {
      businessId: row.businessId,
      action,
      module: 'Settings',
      targetType: 'Category',
      targetId: row.id,
      details: row.name,
    });
    return row;
  }

  private onlyActive(actor: AuthUser) {
    // Drivers / assistants only see categories marked active.
    return actor.role === UserRole.DRIVER || actor.role === UserRole.ASSISTANT
      ? { active: true }
      : {};
  }

  damageTypes(actor: AuthUser, search?: string, businessId?: string) {
    return this.prisma.damageType.findMany({
      where: {
        ...businessFilter(actor, businessId),
        ...this.onlyActive(actor),
        ...(search && { name: { contains: search, mode: 'insensitive' } }),
      },
      orderBy: { name: 'asc' },
    });
  }

  async createDamageType(actor: AuthUser, dto: CreateDamageTypeDto) {
    const { businessId, ...data } = dto;
    return this.record(
      actor,
      'Damage Type Created',
      await this.prisma.damageType.create({
        data: { ...data, businessId: businessIdOf(actor, businessId) },
      }),
    );
  }

  async updateDamageType(
    actor: AuthUser,
    id: string,
    dto: UpdateDamageTypeDto,
  ) {
    await this.ensure('damageType', actor, id);
    const { businessId: _b, ...data } = dto;
    return this.record(
      actor,
      'Damage Type Updated',
      await this.prisma.damageType.update({ where: { id }, data }),
    );
  }

  async removeDamageType(actor: AuthUser, id: string) {
    await this.ensure('damageType', actor, id);
    return this.record(
      actor,
      'Damage Type Deleted',
      await this.prisma.damageType.delete({ where: { id } }),
    );
  }

  incidentTypes(actor: AuthUser, search?: string, businessId?: string) {
    return this.prisma.incidentType.findMany({
      where: {
        ...businessFilter(actor, businessId),
        ...this.onlyActive(actor),
        ...(search && { name: { contains: search, mode: 'insensitive' } }),
      },
      orderBy: { name: 'asc' },
    });
  }

  async createIncidentType(actor: AuthUser, dto: CreateIncidentTypeDto) {
    const { businessId, ...data } = dto;
    return this.record(
      actor,
      'Incident Type Created',
      await this.prisma.incidentType.create({
        data: { ...data, businessId: businessIdOf(actor, businessId) },
      }),
    );
  }

  async updateIncidentType(
    actor: AuthUser,
    id: string,
    dto: UpdateIncidentTypeDto,
  ) {
    await this.ensure('incidentType', actor, id);
    const { businessId: _b, ...data } = dto;
    return this.record(
      actor,
      'Incident Type Updated',
      await this.prisma.incidentType.update({ where: { id }, data }),
    );
  }

  async removeIncidentType(actor: AuthUser, id: string) {
    await this.ensure('incidentType', actor, id);
    return this.record(
      actor,
      'Incident Type Deleted',
      await this.prisma.incidentType.delete({ where: { id } }),
    );
  }

  private async ensure(
    model: 'damageType' | 'incidentType',
    actor: AuthUser,
    id: string,
  ) {
    const where = { id, ...businessFilter(actor) };
    const found =
      model === 'damageType'
        ? await this.prisma.damageType.findFirst({ where })
        : await this.prisma.incidentType.findFirst({ where });
    if (!found) throw new NotFoundException('Category not found');
  }
}
