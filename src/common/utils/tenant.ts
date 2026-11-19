import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { UserRole } from '../../generated/prisma/enums.js';
import type { AuthUser } from '../types/auth-user.js';
import { currentTimeZone } from './request-context.js';
import { zonedDateTime } from './timezone.js';

/**
 * Returns the business a request works on.
 * Business users are locked to their own business. The platform super admin
 * may pass `?businessId=` to act on a specific tenant.
 */
export function businessIdOf(user: AuthUser, override?: string): string {
  if (user.role === UserRole.SUPER_ADMIN) {
    if (!override) {
      throw new BadRequestException(
        'businessId query parameter is required for super admin',
      );
    }
    return override;
  }
  if (!user.businessId)
    throw new ForbiddenException('User is not linked to a business');
  return user.businessId;
}

/** Optional variant for list endpoints: super admin without override sees all. */
export function businessFilter(
  user: AuthUser,
  override?: string,
): { businessId?: string } {
  if (user.role === UserRole.SUPER_ADMIN)
    return override ? { businessId: override } : {};
  return { businessId: businessIdOf(user) };
}

export function startOfDay(d = new Date()): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
}

export function endOfDay(d = new Date()): Date {
  const s = startOfDay(d);
  return new Date(s.getTime() + 24 * 60 * 60 * 1000 - 1);
}

const DAY = 24 * 60 * 60 * 1000;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The calendar date at `at` in the business time zone, as UTC midnight (the
 * representation of date-only columns such as Shift.date).
 */
export function localDate(at = new Date(), tz = currentTimeZone()): Date {
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
  return new Date(`${ymd}T00:00:00.000Z`);
}

/** Local "today" for date-only columns. */
export const today = () => localDate();

/** First and last instant of a local calendar date (for timestamp columns). */
export function dayRange(date: Date, tz = currentTimeZone()) {
  const next = new Date(date.getTime() + DAY);
  return {
    gte: zonedDateTime(date, '00:00', tz),
    lte: new Date(zonedDateTime(next, '00:00', tz).getTime() - 1),
  };
}

/** Local today as a timestamp range. */
export const todayRange = () => dayRange(localDate());

/**
 * A calendar date from a request value: "YYYY-MM-DD" is taken as written; a
 * timestamp is converted to the business time zone; nothing means today.
 */
export function dayOf(value?: string | Date | null): Date {
  if (!value) return localDate();
  if (typeof value === 'string' && DATE_ONLY.test(value))
    return new Date(`${value}T00:00:00.000Z`);
  return localDate(new Date(value));
}

export function parseDateOnly(value?: string): Date {
  return dayOf(value);
}
