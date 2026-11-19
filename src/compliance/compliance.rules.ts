import { ComplianceDocumentType } from '../generated/prisma/enums.js';

/** Thresholds used for compliance status (assumptions, see README). */
export const COMPLIANCE_RULES = {
  expiringSoonDays: 30,
  dailyHoursLimit: 8,
  weeklyHoursLimit: 40,
  /** Documents every driver/assistant must hold. */
  requiredDocuments: [
    ComplianceDocumentType.MEDICAL_CERTIFICATE,
    ComplianceDocumentType.POLICE_CHECK,
  ],
};

export type ItemStatus =
  'VALID' | 'EXPIRING' | 'EXPIRED' | 'MISSING' | 'NOT_APPLICABLE';

export function expiryStatus(
  date: Date | null | undefined,
  now = new Date(),
): ItemStatus {
  if (!date) return 'MISSING';
  if (date < now) return 'EXPIRED';
  const soon = new Date(
    now.getTime() + COMPLIANCE_RULES.expiringSoonDays * 86400000,
  );
  return date < soon ? 'EXPIRING' : 'VALID';
}

/** Worst status wins. */
export function worst(statuses: ItemStatus[]): ItemStatus {
  const order: ItemStatus[] = [
    'EXPIRED',
    'MISSING',
    'EXPIRING',
    'VALID',
    'NOT_APPLICABLE',
  ];
  for (const s of order) if (statuses.includes(s)) return s;
  return 'NOT_APPLICABLE';
}
