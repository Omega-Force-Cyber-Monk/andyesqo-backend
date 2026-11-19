import { DeliveryStatus } from '../generated/prisma/enums.js';

/** Minutes after the due time before a delivery counts as late (assumption). */
export const DELAY_GRACE_MIN = 15;

export const ACTIVE: DeliveryStatus[] = [
  DeliveryStatus.PENDING,
  DeliveryStatus.IN_PROGRESS,
  DeliveryStatus.PICKED_UP,
  DeliveryStatus.DELAYED,
];

export function dueAt(d: {
  eta: Date | null;
  windowEnd: Date | null;
  scheduledDropTime: Date | null;
}) {
  return d.eta ?? d.windowEnd ?? d.scheduledDropTime;
}

export function isLate(
  d: {
    status: DeliveryStatus;
    eta: Date | null;
    windowEnd: Date | null;
    scheduledDropTime: Date | null;
    deliveredAt: Date | null;
  },
  now = new Date(),
) {
  const due = dueAt(d);
  if (!due) return d.status === DeliveryStatus.DELAYED;
  const limit = due.getTime() + DELAY_GRACE_MIN * 60000;
  if (d.status === DeliveryStatus.COMPLETED)
    return !!d.deliveredAt && d.deliveredAt.getTime() > limit;
  return (
    d.status === DeliveryStatus.DELAYED ||
    (ACTIVE.includes(d.status) && now.getTime() > limit)
  );
}
