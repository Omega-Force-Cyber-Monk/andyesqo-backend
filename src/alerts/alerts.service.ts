import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  BusinessStatus,
  NotificationType,
  TokenType,
  UserRole,
  UserStatus,
} from '../generated/prisma/enums.js';
import { NotifyService } from '../common/notify/notify.service.js';
import { ComplianceService } from '../compliance/compliance.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** ISO week key (e.g. 2026-W34): alerts for an unresolved issue repeat weekly. */
export function isoWeek(d: Date) {
  const t = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const start = Date.UTC(t.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((t.getTime() - start) / 86_400_000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

const MANAGERS = [UserRole.ROSTER_MANAGER, UserRole.BUSINESS_ADMIN];
const DAY = 86_400_000;
/** A business still in setup after this long is flagged to the platform. */
export const SETUP_STALE_DAYS = 3;

/**
 * Scheduled operational alerts from the design's notification screens:
 * "Driver Compliance Expiry Notice" and driver stand-downs for roster managers
 * and admins, and "Business Setup Incomplete" / "Administrator Invitation
 * Pending" for the platform team. Each alert carries a dedupe key, so runs are
 * safe to repeat; an unresolved issue is re-notified once a week.
 */
@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly compliance: ComplianceService,
    private readonly notify: NotifyService,
  ) {}

  /** Daily at 20:00 UTC (early morning in Australian time zones). */
  @Cron('0 20 * * *', { name: 'compliance-alerts' })
  async complianceScan(now = new Date()) {
    const week = isoWeek(now);
    const crew = await this.prisma.user.findMany({
      where: {
        role: { in: [UserRole.DRIVER, UserRole.ASSISTANT] },
        status: UserStatus.ACTIVE,
        businessId: { not: null },
        business: { status: { not: BusinessStatus.INACTIVE } },
      },
      select: {
        id: true,
        businessId: true,
        firstName: true,
        lastName: true,
        employeeId: true,
      },
    });
    const results = await this.compliance.evaluateMany(crew.map((u) => u.id));
    let notices = 0,
      standDowns = 0;
    for (const u of crew) {
      const c = results.get(u.id);
      if (!c || c.issues.length === 0) continue;
      const name = `${u.firstName} ${u.lastName ?? ''}`.trim();
      const data = { userId: u.id, issues: c.issues };
      if (!c.eligible) {
        const sent = await this.notify.toRoles(
          u.businessId!,
          MANAGERS,
          NotificationType.COMPLIANCE,
          'Driver Stand-down',
          `${name}${u.employeeId ? ` (${u.employeeId})` : ''} cannot be rostered: ${c.issues.join(', ')}.`,
          data,
          `stand-down:${u.id}:${c.issues.join('|')}:${week}`,
        );
        if (sent.count) {
          standDowns++;
          await this.prisma.auditLog.create({
            data: {
              businessId: u.businessId,
              action: 'Flagged Driver Stand-down',
              module: 'Compliance',
              targetType: 'User',
              targetId: u.id,
              details: `Stand-down alert triggered for ${name} (${c.issues.join(', ')})`,
            },
          });
        }
        continue;
      }
      const sent = await this.notify.toRoles(
        u.businessId!,
        MANAGERS,
        NotificationType.COMPLIANCE,
        'Driver Compliance Expiry Notice',
        `${name}: ${c.issues.join(', ')}.`,
        data,
        `compliance:${u.id}:${c.issues.join('|')}:${week}`,
      );
      if (sent.count) notices++;
    }
    if (notices || standDowns)
      this.logger.log(
        `Compliance alerts: ${notices} notice(s), ${standDowns} stand-down(s)`,
      );
    return { notices, standDowns };
  }

  /** Daily at 21:00 UTC. */
  @Cron('0 21 * * *', { name: 'platform-alerts' })
  async platformScan(now = new Date()) {
    const week = isoWeek(now);
    const stale = await this.prisma.business.findMany({
      where: {
        status: {
          in: [BusinessStatus.PENDING_SETUP, BusinessStatus.INCOMPLETE],
        },
        createdAt: { lt: new Date(now.getTime() - SETUP_STALE_DAYS * DAY) },
      },
      select: { id: true, name: true, createdAt: true },
    });
    let setup = 0,
      invitations = 0;
    for (const b of stale) {
      const days = Math.floor((now.getTime() - b.createdAt.getTime()) / DAY);
      const sent = await this.notify.toSuperAdmins(
        NotificationType.BUSINESS,
        'Business Setup Incomplete',
        `${b.name} has not completed setup after ${days} days.`,
        { businessId: b.id },
        `setup-incomplete:${b.id}:${week}`,
      );
      if (sent.count) setup++;
    }
    // Administrators who never activated and whose latest invitation expired.
    const pending = await this.prisma.user.findMany({
      where: {
        role: UserRole.BUSINESS_ADMIN,
        status: UserStatus.PENDING_INVITE,
        userTokens: {
          none: {
            type: TokenType.INVITATION,
            usedAt: null,
            expiresAt: { gt: now },
          },
        },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        business: { select: { id: true, name: true } },
      },
    });
    for (const a of pending) {
      const sent = await this.notify.toSuperAdmins(
        NotificationType.BUSINESS,
        'Administrator Invitation Pending',
        `${`${a.firstName} ${a.lastName ?? ''}`.trim()} (${a.email})${a.business ? ` for ${a.business.name}` : ''} has not activated and the invitation has expired. Resend the invitation.`,
        { userId: a.id, businessId: a.business?.id ?? null },
        `invitation-pending:${a.id}:${week}`,
      );
      if (sent.count) invitations++;
    }
    return { setup, invitations };
  }
}
