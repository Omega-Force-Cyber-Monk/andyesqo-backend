import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { NotificationType, UserRole } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';

type Db = Prisma.TransactionClient | PrismaService;

/** In-app notifications (the Alerts / Notifications screens). */
@Injectable()
export class NotifyService {
  constructor(private readonly prisma: PrismaService) {}

  async toUser(
    userId: string,
    type: NotificationType,
    title: string,
    body: string,
    data?: Prisma.InputJsonValue,
  ) {
    return this.prisma.notification.create({
      data: { userId, type, title, body, data },
    });
  }

  /**
   * Notifies active users of these roles in a business. With a `dedupeKey`,
   * users who already received that key are skipped; the count returned is the
   * number of new notifications.
   */
  async toRoles(
    businessId: string,
    roles: UserRole[],
    type: NotificationType,
    title: string,
    body: string,
    data?: Prisma.InputJsonValue,
    dedupeKey?: string,
    db: Db = this.prisma,
  ) {
    const users = await db.user.findMany({
      where: { businessId, role: { in: roles }, status: 'ACTIVE' },
      select: { id: true },
    });
    return this.create(db, users, type, title, body, data, dedupeKey);
  }

  /** Notifies every active platform administrator. */
  async toSuperAdmins(
    type: NotificationType,
    title: string,
    body: string,
    data?: Prisma.InputJsonValue,
    dedupeKey?: string,
    db: Db = this.prisma,
  ) {
    const users = await db.user.findMany({
      where: { role: UserRole.SUPER_ADMIN, status: 'ACTIVE' },
      select: { id: true },
    });
    return this.create(db, users, type, title, body, data, dedupeKey);
  }

  private async create(
    db: Db,
    users: { id: string }[],
    type: NotificationType,
    title: string,
    body: string,
    data: Prisma.InputJsonValue | undefined,
    dedupeKey: string | undefined,
  ) {
    if (users.length === 0) return { count: 0 };
    return db.notification.createMany({
      data: users.map((u) => ({
        userId: u.id,
        type,
        title,
        body,
        data,
        dedupeKey,
      })),
      skipDuplicates: true,
    });
  }
}
