import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { AuthUser } from '../types/auth-user.js';

export interface AuditEntry {
  action: string;
  module: string;
  targetType?: string;
  targetId?: string;
  details?: string;
  businessId?: string | null;
  ip?: string;
}

/** Writes the immutable audit trail. Never throws into the caller. */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(actor: AuthUser | null, entry: AuditEntry) {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId: actor?.id ?? null,
          businessId: entry.businessId ?? actor?.businessId ?? null,
          action: entry.action,
          module: entry.module,
          targetType: entry.targetType,
          targetId: entry.targetId,
          details: entry.details,
          ip: entry.ip,
        },
      });
    } catch (e) {
      this.logger.warn(`Audit log failed: ${(e as Error).message}`);
    }
  }
}
