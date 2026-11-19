import { describe, expect, it } from 'vitest';
import { zonedDateTime } from './timezone.js';

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe('zonedDateTime', () => {
  it('converts shift wall-clock times to UTC instants', () => {
    // Sydney is UTC+10 in winter (AEST).
    expect(
      zonedDateTime(
        day('2026-07-15'),
        '08:00',
        'Australia/Sydney',
      ).toISOString(),
    ).toBe('2026-07-14T22:00:00.000Z');
    // Perth is UTC+8 with no daylight saving.
    expect(
      zonedDateTime(
        day('2026-12-15'),
        '06:30',
        'Australia/Perth',
      ).toISOString(),
    ).toBe('2026-12-14T22:30:00.000Z');
  });

  it('follows daylight saving changes', () => {
    // Sydney is UTC+11 in summer (AEDT).
    expect(
      zonedDateTime(
        day('2026-12-15'),
        '08:00',
        'Australia/Sydney',
      ).toISOString(),
    ).toBe('2026-12-14T21:00:00.000Z');
    // Brisbane (QLD) has no daylight saving.
    expect(
      zonedDateTime(
        day('2026-12-15'),
        '08:00',
        'Australia/Brisbane',
      ).toISOString(),
    ).toBe('2026-12-14T22:00:00.000Z');
  });
});

describe('business-local calendar helpers', () => {
  it('uses the local calendar date, not the UTC one', async () => {
    const { localDate, dayRange, dayOf } = await import('./tenant.js');
    // 23:00 UTC on 9 Aug is already 10 Aug (09:00) in Sydney.
    const at = new Date('2026-08-09T23:00:00Z');
    expect(localDate(at, 'Australia/Sydney').toISOString()).toBe(
      '2026-08-10T00:00:00.000Z',
    );
    expect(localDate(at, 'UTC').toISOString()).toBe('2026-08-09T00:00:00.000Z');
    const range = dayRange(
      new Date('2026-08-10T00:00:00Z'),
      'Australia/Sydney',
    );
    expect(range.gte.toISOString()).toBe('2026-08-09T14:00:00.000Z');
    expect(range.lte.toISOString()).toBe('2026-08-10T13:59:59.999Z');
    expect(dayOf('2026-08-10').toISOString()).toBe('2026-08-10T00:00:00.000Z');
  });
});
