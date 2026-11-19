import { DeliveryStatus } from '../generated/prisma/enums.js';
import { DELAY_GRACE_MIN, isLate } from './delivery.rules.js';

const due = new Date('2026-01-01T10:00:00Z');
const after = (min: number) => new Date(due.getTime() + min * 60000);
const base = {
  eta: null,
  windowEnd: due,
  scheduledDropTime: null,
  deliveredAt: null,
};

describe('isLate', () => {
  it('is not late inside the grace period', () => {
    expect(
      isLate(
        { ...base, status: DeliveryStatus.PENDING },
        after(DELAY_GRACE_MIN - 1),
      ),
    ).toBe(false);
  });

  it('is late after the grace period while still active', () => {
    expect(
      isLate(
        { ...base, status: DeliveryStatus.IN_PROGRESS },
        after(DELAY_GRACE_MIN + 1),
      ),
    ).toBe(true);
  });

  it('uses deliveredAt for completed deliveries', () => {
    expect(
      isLate(
        { ...base, status: DeliveryStatus.COMPLETED, deliveredAt: after(5) },
        after(500),
      ),
    ).toBe(false);
    expect(
      isLate(
        { ...base, status: DeliveryStatus.COMPLETED, deliveredAt: after(30) },
        after(30),
      ),
    ).toBe(true);
  });

  it('always treats DELAYED as late', () => {
    expect(
      isLate({ ...base, windowEnd: null, status: DeliveryStatus.DELAYED }),
    ).toBe(true);
  });
});
