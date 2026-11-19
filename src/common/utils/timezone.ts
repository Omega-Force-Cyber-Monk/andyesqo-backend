/** Offset of `tz` from UTC at `instant`, in milliseconds (local − UTC). */
export function timeZoneOffsetMs(instant: number, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(instant));
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/**
 * The UTC instant of a wall-clock time on a calendar date in a time zone.
 * `date` is a date-only value (UTC midnight, as stored for shifts) and `hhmm`
 * a "HH:MM" string. Handles daylight-saving transitions.
 */
export function zonedDateTime(date: Date, hhmm: string, tz: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const wall = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    h,
    m,
  );
  const first = wall - timeZoneOffsetMs(wall, tz);
  const second = wall - timeZoneOffsetMs(first, tz);
  return new Date(second);
}
