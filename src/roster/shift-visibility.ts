import { ShiftStatus } from '../generated/prisma/enums.js';

/** Statuses a driver or assistant can see on their own roster. */
export const VISIBLE_TO_CREW: ShiftStatus[] = [
  ShiftStatus.PUBLISHED,
  ShiftStatus.IN_PROGRESS,
  ShiftStatus.COMPLETED,
];
