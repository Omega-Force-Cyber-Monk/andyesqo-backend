import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '../generated/prisma/enums.js';
import { AuditService } from '../common/audit/audit.service.js';
import type { AuthUser } from '../common/types/auth-user.js';
import { businessIdOf } from '../common/utils/tenant.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UpdateBusinessSettingsDto } from './dto/settings.dto.js';
import { refreshBusinessSetup } from '../businesses/setup.js';

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async get(actor: AuthUser, businessId?: string) {
    const business = await this.prisma.business.findUnique({
      where: { id: businessIdOf(actor, businessId) },
    });
    if (!business) throw new NotFoundException('Business not found');
    return business;
  }

  async update(
    actor: AuthUser,
    dto: UpdateBusinessSettingsDto,
    businessId?: string,
  ) {
    // The 2FA policy is a security control reserved for administrators, even
    // when another role is granted SETTINGS edit in the matrix.
    if (
      dto.twoFactorRequired !== undefined &&
      actor.role !== UserRole.BUSINESS_ADMIN &&
      actor.role !== UserRole.SUPER_ADMIN
    )
      throw new ForbiddenException(
        'Only administrators can change the two-factor policy',
      );
    const id = (await this.get(actor, businessId)).id;
    await this.prisma.business.update({
      where: { id },
      data: { ...dto, settingsConfigured: true },
    });
    await refreshBusinessSetup(this.prisma, id);
    await this.audit.log(actor, {
      businessId: id,
      action: 'Business Settings Updated',
      module: 'Settings',
      details: Object.keys(dto).join(', '),
    });
    return this.prisma.business.findUniqueOrThrow({ where: { id } });
  }
}
