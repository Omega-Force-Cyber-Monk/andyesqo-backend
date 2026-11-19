import type { PrismaService } from '../../prisma/prisma.service.js';

/**
 * Next human readable ID for a business, e.g. DEL-1024, REP-1025, DR-2048.
 * Uses an atomic upsert-increment on the Counter table.
 */
export async function nextCode(
  prisma: PrismaService,
  businessId: string,
  prefix: string,
  start = 1000,
): Promise<string> {
  const counter = await prisma.counter.upsert({
    where: { businessId_key: { businessId, key: prefix } },
    create: { businessId, key: prefix, value: start + 1 },
    update: { value: { increment: 1 } },
  });
  return `${prefix}-${counter.value}`;
}
