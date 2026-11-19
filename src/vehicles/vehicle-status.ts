import type { Prisma } from '../generated/prisma/client.js';
import { VehicleStatus } from '../generated/prisma/enums.js';

/**
 * Changes a vehicle's status inside an existing transaction, locking the row
 * and writing the status log and audit entry atomically. No-op when unchanged.
 */
export async function changeVehicleStatus(
  tx: Prisma.TransactionClient,
  input: {
    vehicleId: string;
    status: VehicleStatus;
    reason?: string;
    actorId: string;
  },
) {
  await tx.$queryRaw`SELECT id FROM "Vehicle" WHERE id = ${input.vehicleId} FOR UPDATE`;
  const v = await tx.vehicle.findUniqueOrThrow({
    where: { id: input.vehicleId },
  });
  if (v.status === input.status) return v;
  const updated = await tx.vehicle.update({
    where: { id: v.id },
    data: { status: input.status },
  });
  await tx.vehicleStatusLog.create({
    data: {
      vehicleId: v.id,
      fromStatus: v.status,
      toStatus: input.status,
      reason: input.reason,
      changedById: input.actorId,
    },
  });
  await tx.auditLog.create({
    data: {
      actorId: input.actorId,
      businessId: v.businessId,
      action:
        input.status === VehicleStatus.GROUNDED
          ? 'Grounded Vehicle (Red-Tag)'
          : 'Vehicle Status Changed',
      module: 'Fleet & Safety',
      targetType: 'Vehicle',
      targetId: v.id,
      details: `${v.registration}: ${v.status} → ${input.status}${input.reason ? ` (${input.reason})` : ''}`,
    },
  });
  return updated;
}
