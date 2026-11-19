import {
  BusinessRegionStatus,
  BusinessStatus,
  NotificationType,
  UserRole,
  UserStatus,
} from '../generated/prisma/enums.js';
import type { PrismaService } from '../prisma/prisma.service.js';

export interface SetupBusiness {
  status: BusinessStatus;
  settingsConfigured: boolean;
  permissionsVerified: boolean;
  regions: { status?: BusinessRegionStatus }[];
  users: { status: UserStatus }[];
}

export function businessSetup(b: SetupBusiness) {
  const admin = b.users.find((u) => u.status !== UserStatus.INACTIVE);
  // A region switched to INACTIVE no longer counts as operating coverage.
  const regions = b.regions.filter(
    (r) => r.status !== BusinessRegionStatus.INACTIVE,
  ).length;
  const ready =
    !!admin && regions > 0 && b.settingsConfigured && b.permissionsVerified;
  const steps = [
    { key: 'BUSINESS_CREATED', label: 'Business Created', done: true },
    {
      key: 'ADMINISTRATOR',
      label: 'Business Administrator',
      done: !!admin,
      status: !admin
        ? 'Not assigned'
        : admin.status === UserStatus.ACTIVE
          ? 'Assigned'
          : 'Pending',
    },
    { key: 'REGIONS', label: 'Regions / Status', done: regions > 0 },
    { key: 'SETTINGS', label: 'Platform Settings', done: b.settingsConfigured },
    {
      key: 'PERMISSIONS',
      label: 'Roles & Permissions',
      done: b.permissionsVerified,
    },
    {
      key: 'READY',
      label: 'Business Ready',
      done: ready && b.status !== BusinessStatus.INACTIVE,
    },
  ];
  const completed = steps.filter((step) => step.done).length;
  return {
    steps,
    /** Steps 1-5 done: the business may be marked READY or ACTIVE. */
    prerequisitesMet: ready,
    completed,
    total: steps.length,
    percent: Math.round((completed * 100) / steps.length),
  };
}

/** Derived status for a business still in setup. */
export function derivedStatus(setup: ReturnType<typeof businessSetup>) {
  return setup.prerequisitesMet
    ? BusinessStatus.READY
    : setup.completed > 1
      ? BusinessStatus.INCOMPLETE
      : BusinessStatus.PENDING_SETUP;
}

/**
 * Recompute derived setup status after a checklist input changes. Mutations
 * call this after they commit; SetupReconciler re-runs it periodically so a
 * refresh lost to a crash or error is repaired.
 */
export async function refreshBusinessSetup(prisma: PrismaService, id: string) {
  return prisma.$transaction(async (tx) => {
    // Serialize refreshes for this business after prerequisite mutations commit.
    await tx.$queryRaw`SELECT id FROM "Business" WHERE id = ${id} FOR UPDATE`;
    const b = await tx.business.findUnique({
      where: { id },
      include: {
        regions: true,
        users: { where: { role: UserRole.BUSINESS_ADMIN } },
      },
    });
    // Deleted concurrently: nothing to refresh.
    if (!b) return;
    if (
      b.status === BusinessStatus.ACTIVE ||
      b.status === BusinessStatus.INACTIVE
    )
      return;
    const status = derivedStatus(businessSetup(b));
    if (status !== b.status) {
      await tx.business.updateMany({
        where: {
          id,
          status: {
            in: [
              BusinessStatus.PENDING_SETUP,
              BusinessStatus.INCOMPLETE,
              BusinessStatus.READY,
            ],
          },
        },
        data: { status },
      });
      if (status === BusinessStatus.READY) {
        // "Business Ready" on the platform admin notifications screen.
        const admins = await tx.user.findMany({
          where: { role: UserRole.SUPER_ADMIN, status: UserStatus.ACTIVE },
          select: { id: true },
        });
        if (admins.length)
          await tx.notification.createMany({
            data: admins.map((a) => ({
              userId: a.id,
              type: NotificationType.BUSINESS,
              title: 'Business Ready',
              body: `${b.name} has completed setup and is ready to go live.`,
              data: { businessId: id },
            })),
          });
      }
    }
  });
}
