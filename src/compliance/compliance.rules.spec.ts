import { COMPLIANCE_RULES, expiryStatus, worst } from './compliance.rules.js';

const now = new Date('2026-01-01T00:00:00Z');
const inDays = (n: number) => new Date(now.getTime() + n * 86400000);

describe('compliance rules', () => {
  it('marks missing, expired, expiring and valid dates', () => {
    expect(expiryStatus(null, now)).toBe('MISSING');
    expect(expiryStatus(inDays(-1), now)).toBe('EXPIRED');
    expect(
      expiryStatus(inDays(COMPLIANCE_RULES.expiringSoonDays - 1), now),
    ).toBe('EXPIRING');
    expect(
      expiryStatus(inDays(COMPLIANCE_RULES.expiringSoonDays + 1), now),
    ).toBe('VALID');
  });

  it('returns the worst status', () => {
    expect(worst(['VALID', 'EXPIRING'])).toBe('EXPIRING');
    expect(worst(['VALID', 'MISSING', 'EXPIRING'])).toBe('MISSING');
    expect(worst(['EXPIRED', 'MISSING'])).toBe('EXPIRED');
    expect(worst([])).toBe('NOT_APPLICABLE');
  });
});
